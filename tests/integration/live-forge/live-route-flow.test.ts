import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import prisma from '@/lib/prisma';
import {
  startStrengthSessionAction,
  getActiveStrengthSessionAction,
  logStrengthSetAction,
  finishStrengthSessionAction,
  getStrengthSessionHistoryAction,
  resolveUserId,
} from '@/actions/live-forge/core';
import type { CanonicalStrengthSetInput } from '@/features/strength-evidence/write-contract';

describe('Integration: Live Forge Mobile Vertical Slice (/live)', () => {
  let userId: string;

  beforeAll(async () => {
    userId = await resolveUserId();

    // Clean up any lingering test sessions for this user
    const existing = await prisma.strengthEvidenceSession.findMany({
      where: { userId, source: 'IRONFORGE_LIVE_FORGE' },
      select: { id: true },
    });
    for (const sess of existing) {
      await prisma.strengthEvidenceSet.deleteMany({ where: { sessionId: sess.id } });
    }
    await prisma.strengthEvidenceSession.deleteMany({
      where: { userId, source: 'IRONFORGE_LIVE_FORGE' },
    });
  });

  afterAll(async () => {
    const existing = await prisma.strengthEvidenceSession.findMany({
      where: { userId, source: 'IRONFORGE_LIVE_FORGE' },
      select: { id: true },
    });
    for (const sess of existing) {
      await prisma.strengthEvidenceSet.deleteMany({ where: { sessionId: sess.id } });
    }
    await prisma.strengthEvidenceSession.deleteMany({
      where: { userId, source: 'IRONFORGE_LIVE_FORGE' },
    });
  });

  it('proves the full critical path: start A1 -> log sets -> deduplicate -> refresh/resume -> finish "Klar för idag" -> history', async () => {
    // 1. Initial State: No active session
    const initialActive = await getActiveStrengthSessionAction();
    expect(initialActive).toBeNull();

    // 2. Start A1 session
    const session1 = await startStrengthSessionAction({ templateCode: 'A1' });
    expect(session1.sessionId).toMatch(/^live-a1-/);
    expect(session1.status).toBe('ACTIVE');
    expect(session1.templateCode).toBe('A1');
    expect(session1.performedExercises.length).toBe(5);
    expect(session1.performedExercises[0].exerciseName).toBe('Belt Squat');
    expect(session1.performedExercises[0].sets.length).toBe(0);

    // 3. Idempotent Start: Starting again returns the exact same active session
    const session1Duplicate = await startStrengthSessionAction({ templateCode: 'A1' });
    expect(session1Duplicate.sessionId).toBe(session1.sessionId);

    // 4. Log Set 1 on Belt Squat (Exercise 0)
    const set1WriteId = `write-belt-1-${Date.now()}`;
    const set1Input: CanonicalStrengthSetInput = {
      performedExerciseId: 'belt-squat',
      clientWriteId: set1WriteId,
      measurementMode: 'LOAD_AND_REPS',
      load: 100,
      loadUnit: 'KG',
      loadSemantics: 'TOTAL_EXTERNAL_LOAD',
      reps: 8,
      completedAt: new Date().toISOString(),
      setType: 'NORMAL',
    };

    const writeResult1 = await logStrengthSetAction({
      sessionId: session1.sessionId,
      exerciseIndex: 0,
      performedExerciseId: 'belt-squat',
      exerciseName: 'Belt Squat',
      setInput: set1Input,
    });

    expect(writeResult1.status).toBe('PERSISTED');
    if (writeResult1.status === 'PERSISTED') {
      expect(writeResult1.set.clientWriteId).toBe(set1WriteId);
      expect(writeResult1.set.load).toBe(100);
      expect(writeResult1.set.reps).toBe(8);
    }

    // 5. Duplicate Set Write: Exact same clientWriteId is deduplicated safely
    const duplicateWriteResult = await logStrengthSetAction({
      sessionId: session1.sessionId,
      exerciseIndex: 0,
      performedExerciseId: 'belt-squat',
      exerciseName: 'Belt Squat',
      setInput: set1Input,
    });
    expect(duplicateWriteResult.status).toBe('DUPLICATE_IGNORED');

    // 6. Refresh / Resume Simulation:
    // Calling getActiveStrengthSessionAction() simulates the user reloading the page or reopening mobile browser
    const resumedSession = await getActiveStrengthSessionAction();
    expect(resumedSession).not.toBeNull();
    expect(resumedSession!.sessionId).toBe(session1.sessionId);
    expect(resumedSession!.status).toBe('ACTIVE');

    // Verify Set 1 is present in resumed session directly from DB
    const beltSquatExercise = resumedSession!.performedExercises.find(
      (e) => e.exerciseId === 'belt-squat'
    );
    expect(beltSquatExercise).toBeDefined();
    expect(beltSquatExercise!.sets.length).toBe(1);
    expect(beltSquatExercise!.sets[0].clientWriteId).toBe(set1WriteId);
    expect(beltSquatExercise!.sets[0].load).toBe(100);
    expect(beltSquatExercise!.sets[0].reps).toBe(8);

    // 7. Log Set 2 (Calf Raise - Exercise 1)
    const set2WriteId = `write-calf-1-${Date.now()}`;
    const set2Input: CanonicalStrengthSetInput = {
      performedExerciseId: 'calf-raise',
      clientWriteId: set2WriteId,
      measurementMode: 'LOAD_AND_REPS',
      load: 60,
      loadUnit: 'KG',
      loadSemantics: 'TOTAL_EXTERNAL_LOAD',
      reps: 12,
      completedAt: new Date().toISOString(),
      setType: 'NORMAL',
    };

    const writeResult2 = await logStrengthSetAction({
      sessionId: session1.sessionId,
      exerciseIndex: 1,
      performedExerciseId: 'calf-raise',
      exerciseName: 'Calf Raise',
      setInput: set2Input,
    });
    expect(writeResult2.status).toBe('PERSISTED');

    // 8. User taps "Klar för idag" early (only 2 sets performed across 2 exercises)
    const finishedSession = await finishStrengthSessionAction({
      sessionId: session1.sessionId,
      explicitKlarForIdag: true,
    });

    expect(finishedSession.status).toBe('COMPLETED');
    expect(finishedSession.outcome).toBe('KLAR_FOR_IDAG');
    expect(finishedSession.completedAt).toBeDefined();

    // 9. Session is no longer returned as active on reload
    const activeAfterFinish = await getActiveStrengthSessionAction();
    expect(activeAfterFinish).toBeNull();

    // 10. History verification: Session appears in completed sessions history
    const history = await getStrengthSessionHistoryAction();
    expect(history.length).toBeGreaterThanOrEqual(1);

    const historicalEntry = history.find((h) => h.sessionId === session1.sessionId);
    expect(historicalEntry).toBeDefined();
    expect(historicalEntry!.outcome).toBe('KLAR_FOR_IDAG');
    expect(historicalEntry!.totalSets).toBe(2);
    expect(historicalEntry!.exercises.length).toBe(2);

    const beltSquatHistory = historicalEntry!.exercises.find((e) => e.exerciseId === 'belt-squat');
    expect(beltSquatHistory).toBeDefined();
    expect(beltSquatHistory!.exerciseName).toBe('Belt Squat');
    expect(beltSquatHistory!.sets.length).toBe(1);
    expect(beltSquatHistory!.sets[0].load).toBe(100);
    expect(beltSquatHistory!.sets[0].reps).toBe(8);

    const calfRaiseHistory = historicalEntry!.exercises.find((e) => e.exerciseId === 'calf-raise');
    expect(calfRaiseHistory).toBeDefined();
    expect(calfRaiseHistory!.exerciseName).toBe('Calf Raise');
    expect(calfRaiseHistory!.sets.length).toBe(1);
    expect(calfRaiseHistory!.sets[0].load).toBe(60);
    expect(calfRaiseHistory!.sets[0].reps).toBe(12);
  });
});
