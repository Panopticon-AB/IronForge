import { describe, expect, it, vi } from 'vitest';

import type { StrengthSessionEvidence } from './domain';
import {
  STRENGTH_EVIDENCE_VERSION,
  prepareStrengthEvidencePersistence,
} from './persistence';

const evidence: StrengthSessionEvidence = {
  provenance: {
    source: 'HEVY',
    providerSessionId: 'hevy-workout-123',
  },
  title: 'Hyper Pro strength',
  startedAt: '2026-09-02T18:00:00.000Z',
  endedAt: '2026-09-02T18:40:00.000Z',
  durationSeconds: 2400,
  exercises: [
    {
      sequence: 0,
      exerciseName: 'Back Extension',
      providerExerciseId: 'back-extension-template',
      sets: [{ sequence: 0, providerSetIndex: 0, loadKg: 20, reps: 10 }],
    },
  ],
};

describe('prepareStrengthEvidencePersistence', () => {
  it('prepares exact provider identity and canonical evidence without raw provider data', () => {
    const prepared = prepareStrengthEvidencePersistence('user-1', evidence);

    expect(prepared.status).toBe('READY');
    if (prepared.status !== 'READY') return;

    expect(prepared.data).toMatchObject({
      userId: 'user-1',
      source: 'HEVY',
      providerSessionId: 'hevy-workout-123',
      evidenceVersion: STRENGTH_EVIDENCE_VERSION,
    });
    expect(prepared.data.startedAt.toISOString()).toBe('2026-09-02T18:00:00.000Z');
    expect(prepared.data.endedAt?.toISOString()).toBe('2026-09-02T18:40:00.000Z');
    expect(prepared.data.evidence).toEqual(evidence);
  });

  it('does not manufacture a provider session id when identity is missing', () => {
    const prepared = prepareStrengthEvidencePersistence('user-1', {
      ...evidence,
      provenance: { source: 'HEVY' },
    });

    expect(prepared).toEqual({ status: 'SKIP_MISSING_PROVIDER_SESSION_ID' });
  });

  it('keeps missing RPE absent in persisted canonical evidence', () => {
    const prepared = prepareStrengthEvidencePersistence('user-1', evidence);

    expect(prepared.status).toBe('READY');
    if (prepared.status !== 'READY') return;

    const persistedEvidence = prepared.data.evidence as unknown as StrengthSessionEvidence;
    const firstSet = persistedEvidence.exercises[0].sets[0];

    expect('rpe' in firstSet).toBe(false);
    expect('rir' in firstSet).toBe(false);
  });

  it('persists and reads back session evidence through prisma', async () => {
    const { persistStrengthSessionEvidence, getStrengthSessionEvidence } = await import(
      './persistence'
    );
    const prismaModule = await import('@/lib/prisma');
    const prisma = prismaModule.default;

    const upsertSpy = vi.spyOn(prisma.strengthEvidenceSession, 'upsert').mockResolvedValue({
      id: 'db-row-1',
    } as any);

    const findUniqueSpy = vi
      .spyOn(prisma.strengthEvidenceSession, 'findUnique')
      .mockResolvedValue({
        id: 'db-row-1',
        evidence: evidence as any,
      } as any);

    const findManySpy = vi
      .spyOn(prisma.strengthEvidenceSet, 'findMany')
      .mockResolvedValue([]);

    const persistRes = await persistStrengthSessionEvidence('user-1', evidence);
    expect(persistRes.status).toBe('PERSISTED');
    expect(upsertSpy).toHaveBeenCalledTimes(1);

    const readBack = await getStrengthSessionEvidence('user-1', 'HEVY', 'hevy-workout-123');
    expect(readBack).toEqual(evidence);
    expect(findUniqueSpy).toHaveBeenCalledTimes(1);

    upsertSpy.mockRestore();
    findUniqueSpy.mockRestore();
    findManySpy.mockRestore();
  });

  it('persistCanonicalStrengthSet persists initial set and ignores duplicate clientWriteId via P2002', async () => {
    const { persistCanonicalStrengthSet } = await import('./persistence');
    const prismaModule = await import('@/lib/prisma');
    const prisma = prismaModule.default;

    const setInput = {
      id: 'set-1',
      performedExerciseId: 'ex-1',
      clientWriteId: 'cw-1',
      measurementMode: 'LOAD_AND_REPS' as const,
      load: 100,
      loadUnit: 'KG' as const,
      loadSemantics: 'TOTAL_EXTERNAL_LOAD' as const,
      reps: 8,
      completedAt: '2026-09-24T18:00:00.000Z',
      setType: 'NORMAL' as const,
    };

    const sessionUpsertSpy = vi
      .spyOn(prisma.strengthEvidenceSession, 'upsert')
      .mockResolvedValue({ id: 'sess-row-1' } as any);
    const setCountSpy = vi
      .spyOn(prisma.strengthEvidenceSet, 'count')
      .mockResolvedValue(0);
    const setCreateSpy = vi
      .spyOn(prisma.strengthEvidenceSet, 'create')
      .mockResolvedValueOnce({ id: 'set-row-1' } as any);
    const sessionFindUniqueSpy = vi
      .spyOn(prisma.strengthEvidenceSession, 'findUnique')
      .mockResolvedValue({ id: 'sess-row-1', evidence: { exercises: [] } } as any);
    const sessionUpdateSpy = vi
      .spyOn(prisma.strengthEvidenceSession, 'update')
      .mockResolvedValue({ id: 'sess-row-1' } as any);

    // 1. Initial write -> PERSISTED
    const res1 = await persistCanonicalStrengthSet(
      'user-1',
      'IRONFORGE_LIVE_FORGE',
      'sess-1',
      0,
      'Belt Squat',
      'ex-1',
      setInput
    );
    expect(res1.status).toBe('PERSISTED');
    expect(setCreateSpy).toHaveBeenCalledTimes(1);

    // 2. Duplicate write with same clientWriteId throws P2002 -> DUPLICATE_IGNORED
    const p2002Error: any = new Error('Unique constraint failed on the fields: (`sessionId`,`clientWriteId`)');
    p2002Error.code = 'P2002';
    setCreateSpy.mockRejectedValueOnce(p2002Error);

    const res2 = await persistCanonicalStrengthSet(
      'user-1',
      'IRONFORGE_LIVE_FORGE',
      'sess-1',
      0,
      'Belt Squat',
      'ex-1',
      setInput
    );
    expect(res2.status).toBe('DUPLICATE_IGNORED');
    expect(res2.clientWriteId).toBe('cw-1');

    sessionUpsertSpy.mockRestore();
    setCountSpy.mockRestore();
    setCreateSpy.mockRestore();
    sessionFindUniqueSpy.mockRestore();
    sessionUpdateSpy.mockRestore();
  });
});


