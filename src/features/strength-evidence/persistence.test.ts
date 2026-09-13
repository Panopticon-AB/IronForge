import { describe, expect, it } from 'vitest';

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
});
