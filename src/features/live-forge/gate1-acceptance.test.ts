import { describe, expect, it } from 'vitest';
import { LiveStrengthSessionManager } from './active-strength-session';
import { CANONICAL_STRENGTH_TEMPLATES } from '@/features/training/canonicalTemplates';
import { toCanonicalStrengthSessionEvidence } from '@/features/strength-evidence/write-service';
import { prepareStrengthEvidencePersistence } from '@/features/strength-evidence/persistence';

describe('Gate 1 A1 Vertical Slice (phone -> session -> exercise -> set -> persistence -> finish -> history)', () => {
  it('successfully starts an A1 workout, logs sets across different measurement modes, finishes via Klar för idag, and maps to canonical persistence evidence', () => {
    const manager = new LiveStrengthSessionManager();

    // 1. Phone / User starts an A1 session
    let session = manager.startSession({
      sessionId: 'live-forge-a1-test-session',
      userId: 'user-titan-1',
      template: CANONICAL_STRENGTH_TEMPLATES.A1,
      startedAt: '2026-09-24T18:00:00.000Z',
    });

    expect(session.status).toBe('ACTIVE');
    expect(session.performedExercises).toHaveLength(5);
    expect(session.performedExercises[0].exerciseName).toBe('Belt Squat');

    // 2. Exercise 1: Belt Squat (LOAD_AND_REPS) - Set 1
    session = manager.logSet(session, 0, {
      id: 'bs-set-1',
      performedExerciseId: 'belt-squat',
      clientWriteId: 'cw-bs-1',
      measurementMode: 'LOAD_AND_REPS',
      load: 85,
      loadUnit: 'KG',
      loadSemantics: 'TOTAL_EXTERNAL_LOAD',
      reps: 8,
      rpe: 8,
      completedAt: '2026-09-24T18:05:00.000Z',
      setType: 'NORMAL',
    });

    // Set 2: Belt Squat
    session = manager.logSet(session, 0, {
      id: 'bs-set-2',
      performedExerciseId: 'belt-squat',
      clientWriteId: 'cw-bs-2',
      measurementMode: 'LOAD_AND_REPS',
      load: 85,
      loadUnit: 'KG',
      loadSemantics: 'TOTAL_EXTERNAL_LOAD',
      reps: 8,
      // Effort data omitted - unknown must remain unknown
      completedAt: '2026-09-24T18:09:00.000Z',
      setType: 'NORMAL',
    });

    // Double tap retry on Set 2 must not duplicate
    session = manager.logSet(session, 0, {
      id: 'bs-set-2-retry',
      performedExerciseId: 'belt-squat',
      clientWriteId: 'cw-bs-2',
      measurementMode: 'LOAD_AND_REPS',
      load: 85,
      loadUnit: 'KG',
      loadSemantics: 'TOTAL_EXTERNAL_LOAD',
      reps: 8,
      completedAt: '2026-09-24T18:09:00.000Z',
      setType: 'NORMAL',
    });
    expect(session.performedExercises[0].sets).toHaveLength(2);

    // 3. Exercise 3: Bench Press (LOAD_AND_REPS) - Set 1
    session = manager.logSet(session, 2, {
      id: 'bp-set-1',
      performedExerciseId: 'bench-press',
      clientWriteId: 'cw-bp-1',
      measurementMode: 'LOAD_AND_REPS',
      load: 70,
      loadUnit: 'KG',
      loadSemantics: 'TOTAL_EXTERNAL_LOAD',
      reps: 10,
      completedAt: '2026-09-24T18:18:00.000Z',
      setType: 'NORMAL',
    });

    // 4. Exercise 5: Ab Wheel (REPS_ONLY) - Set 1
    session = manager.logSet(session, 4, {
      id: 'aw-set-1',
      performedExerciseId: 'ab-wheel',
      clientWriteId: 'cw-aw-1',
      measurementMode: 'REPS_ONLY',
      reps: 10,
      completedAt: '2026-09-24T18:25:00.000Z',
      setType: 'NORMAL',
    });

    // 5. User finishes via Klar för idag without needing every accessory complete
    session = manager.finishSession(session, {
      explicitKlarForIdag: true,
      finishedAt: '2026-09-24T18:30:00.000Z',
    });

    expect(session.status).toBe('COMPLETED');
    expect(session.outcome).toBe('KLAR_FOR_IDAG');
    expect(session.completedAt).toBe('2026-09-24T18:30:00.000Z');

    // 6. Map session to Canonical StrengthSessionEvidence
    const evidence = toCanonicalStrengthSessionEvidence({
      sessionId: session.sessionId,
      source: 'IRONFORGE_LIVE_FORGE',
      startedAt: session.startedAt,
      endedAt: session.completedAt,
      title: session.templateSnapshot.name,
      performedExercises: session.performedExercises
        .filter((ex) => ex.sets.length > 0)
        .map((ex) => ({
          performedExerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
          sequence: ex.sequence,
          sets: ex.sets,
        })),
    });

    expect(evidence.provenance.source).toBe('IRONFORGE_LIVE_FORGE');
    expect(evidence.provenance.providerSessionId).toBe('live-forge-a1-test-session');
    expect(evidence.exercises).toHaveLength(3); // Belt squat, bench, ab wheel

    // Verify Belt Squat sets
    expect(evidence.exercises[0].sets).toHaveLength(2);
    expect(evidence.exercises[0].sets[0].loadKg).toBe(85);
    expect(evidence.exercises[0].sets[0].rpe).toBe(8);
    expect(evidence.exercises[0].sets[1].loadKg).toBe(85);
    expect('rpe' in evidence.exercises[0].sets[1]).toBe(false); // Unknown RPE remains missing!

    // Verify Ab wheel (reps only)
    expect(evidence.exercises[2].sets[0].reps).toBe(10);
    expect('loadKg' in evidence.exercises[2].sets[0]).toBe(false);

    // 7. Verify prepareStrengthEvidencePersistence is ready for DB insertion
    const prepared = prepareStrengthEvidencePersistence('user-titan-1', evidence);
    expect(prepared.status).toBe('READY');
    if (prepared.status === 'READY') {
      expect(prepared.data.userId).toBe('user-titan-1');
      expect(prepared.data.source).toBe('IRONFORGE_LIVE_FORGE');
      expect(prepared.data.providerSessionId).toBe('live-forge-a1-test-session');
      expect(prepared.data.evidenceVersion).toBe(1);
    }
  });
});
