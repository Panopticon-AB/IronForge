import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import prisma from '@/lib/prisma';
import {
  persistCanonicalStrengthSet,
  getStrengthSessionEvidence,
  persistStrengthSessionEvidence,
} from '@/features/strength-evidence/persistence';
import type { CanonicalStrengthSetInput } from '@/features/strength-evidence/write-contract';
import type { StrengthSessionEvidence } from '@/features/strength-evidence/domain';

describe('Integration: Canonical Strength Evidence Persistence & Idempotency', () => {
  const testUserId = `test-user-integration-${Date.now()}`;
  const testProviderSessionId = `test-live-forge-sess-${Date.now()}`;
  const testSource = 'IRONFORGE_LIVE_FORGE';

  beforeAll(async () => {
    try {
      await prisma.strengthEvidenceSession.deleteMany({
        where: { userId: testUserId },
      });
    } catch {
      // Ignore if table/database is fresh
    }
  });

  afterAll(async () => {
    try {
      await prisma.strengthEvidenceSession.deleteMany({
        where: { userId: testUserId },
      });
    } catch {
      // Ignore cleanup error
    }
  });

  it('persists set, reads back truthfully, deduplicates replayed write ID across service reconstruction', async () => {
    // 1. Initial write of a canonical set (weighted LOAD_AND_REPS)
    const set1: CanonicalStrengthSetInput = {
      id: `set-id-1-${Date.now()}`,
      performedExerciseId: 'belt-squat',
      clientWriteId: 'cw-unique-belt-squat-1',
      measurementMode: 'LOAD_AND_REPS',
      load: 100,
      loadUnit: 'KG',
      loadSemantics: 'TOTAL_EXTERNAL_LOAD',
      reps: 6,
      // rpe and rir omitted intentionally
      completedAt: '2026-09-24T18:00:00.000Z',
      setType: 'NORMAL',
      note: 'Felt solid on belt squat',
    };

    const firstResult = await persistCanonicalStrengthSet(
      testUserId,
      testSource,
      testProviderSessionId,
      0,
      'Belt Squat',
      'belt-squat',
      set1,
      { startedAt: '2026-09-24T17:55:00.000Z', title: 'A1 Belt Squat Live Forge' }
    );

    expect(firstResult.status).toBe('PERSISTED');

    // 2. Read back from real database
    const readBack1 = await getStrengthSessionEvidence(
      testUserId,
      testSource,
      testProviderSessionId
    );

    expect(readBack1).not.toBeNull();
    expect(readBack1?.provenance.source).toBe(testSource);
    expect(readBack1?.provenance.providerSessionId).toBe(testProviderSessionId);
    expect(readBack1?.exercises).toHaveLength(1);

    const exercise1 = readBack1!.exercises[0];
    expect(exercise1.exerciseName).toBe('Belt Squat');
    expect(exercise1.providerExerciseId).toBe('belt-squat');
    expect(exercise1.sets).toHaveLength(1);

    const readSet1 = exercise1.sets[0];
    // Verify clientWriteId
    expect(readSet1.clientWriteId).toBe('cw-unique-belt-squat-1');
    // Verify measurement mode
    expect(readSet1.measurementMode).toBe('LOAD_AND_REPS');
    // Verify load, unit, semantics
    expect(readSet1.load).toBe(100);
    expect(readSet1.loadUnit).toBe('KG');
    expect(readSet1.loadSemantics).toBe('TOTAL_EXTERNAL_LOAD');
    // Verify derived loadKg
    expect(readSet1.loadKg).toBe(100);
    expect(readSet1.reps).toBe(6);
    expect(readSet1.note).toBe('Felt solid on belt squat');
    // Verify missing RPE/RIR remains missing without synthesis
    expect('rpe' in readSet1).toBe(false);
    expect('rir' in readSet1).toBe(false);

    // 3. Replay EXACT same clientWriteId (simulating reconnect / browser refresh / second server instance)
    const replayResult = await persistCanonicalStrengthSet(
      testUserId,
      testSource,
      testProviderSessionId,
      0,
      'Belt Squat',
      'belt-squat',
      set1
    );

    expect(replayResult.status).toBe('DUPLICATE_IGNORED');

    // 4. Query again and prove exactly one canonical set exists
    const readBackReplay = await getStrengthSessionEvidence(
      testUserId,
      testSource,
      testProviderSessionId
    );

    expect(readBackReplay?.exercises[0].sets).toHaveLength(1);
    expect(readBackReplay?.exercises[0].sets[0].clientWriteId).toBe('cw-unique-belt-squat-1');

    // 5. Add a second set with imperial units (LBS) to test loadKg derivation and unit preservation
    const set2Lbs: CanonicalStrengthSetInput = {
      id: `set-id-2-${Date.now()}`,
      performedExerciseId: 'belt-squat',
      clientWriteId: 'cw-unique-belt-squat-2-lbs',
      measurementMode: 'LOAD_AND_REPS',
      load: 220,
      loadUnit: 'LBS',
      loadSemantics: 'TOTAL_EXTERNAL_LOAD',
      reps: 5,
      rpe: 8.5,
      completedAt: '2026-09-24T18:05:00.000Z',
      setType: 'NORMAL',
    };

    const secondResult = await persistCanonicalStrengthSet(
      testUserId,
      testSource,
      testProviderSessionId,
      0,
      'Belt Squat',
      'belt-squat',
      set2Lbs
    );

    expect(secondResult.status).toBe('PERSISTED');

    const readBack2 = await getStrengthSessionEvidence(
      testUserId,
      testSource,
      testProviderSessionId
    );

    expect(readBack2?.exercises[0].sets).toHaveLength(2);
    const readSet2 = readBack2!.exercises[0].sets[1];
    expect(readSet2.clientWriteId).toBe('cw-unique-belt-squat-2-lbs');
    expect(readSet2.load).toBe(220);
    expect(readSet2.loadUnit).toBe('LBS');
    expect(readSet2.loadKg).toBe(99.79);
    expect(readSet2.rpe).toBe(8.5);

    // 6. Complete session with Klar för idag
    const finalEvidence: StrengthSessionEvidence = {
      ...readBack2!,
      endedAt: '2026-09-24T18:30:00.000Z',
    };

    const finishResult = await persistStrengthSessionEvidence(testUserId, finalEvidence);
    expect(finishResult.status).toBe('PERSISTED');

    const completedReadBack = await getStrengthSessionEvidence(
      testUserId,
      testSource,
      testProviderSessionId
    );
    expect(completedReadBack?.endedAt).toBe('2026-09-24T18:30:00.000Z');
    expect(completedReadBack?.exercises[0].sets).toHaveLength(2);
  });
});
