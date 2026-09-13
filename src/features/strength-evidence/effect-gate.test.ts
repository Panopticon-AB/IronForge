import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StrengthSessionEvidence } from './domain';
import {
  claimStrengthEvidenceEffects,
  markStrengthEvidenceEffectsApplied,
} from './effect-gate';

const evidence: StrengthSessionEvidence = {
  provenance: {
    source: 'HEVY',
    providerSessionId: 'hevy-workout-123',
  },
  startedAt: '2026-09-02T18:00:00.000Z',
  exercises: [],
};

function createTxMock() {
  return {
    strengthEvidenceSession: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  } as unknown as Prisma.TransactionClient;
}

describe('strength evidence effect gate', () => {
  let tx: Prisma.TransactionClient;

  beforeEach(() => {
    tx = createTxMock();
  });

  it('claims pending provider-session effects exactly once', async () => {
    vi.mocked(tx.strengthEvidenceSession.upsert).mockResolvedValue({
      id: 'session-1',
      effectState: 'PENDING',
    } as never);
    vi.mocked(tx.strengthEvidenceSession.updateMany).mockResolvedValue({ count: 1 });

    await expect(claimStrengthEvidenceEffects(tx, 'user-1', evidence)).resolves.toEqual({
      status: 'CLAIMED',
      sessionId: 'session-1',
    });
  });

  it('returns already applied without claiming or duplicating effects', async () => {
    vi.mocked(tx.strengthEvidenceSession.upsert).mockResolvedValue({
      id: 'session-1',
      effectState: 'APPLIED',
    } as never);

    await expect(claimStrengthEvidenceEffects(tx, 'user-1', evidence)).resolves.toEqual({
      status: 'ALREADY_APPLIED',
      sessionId: 'session-1',
    });
    expect(tx.strengthEvidenceSession.updateMany).not.toHaveBeenCalled();
  });

  it('does not invent identity when provider session id is missing', async () => {
    await expect(
      claimStrengthEvidenceEffects(tx, 'user-1', {
        ...evidence,
        provenance: { source: 'HEVY' },
      }),
    ).resolves.toEqual({ status: 'SKIP_MISSING_PROVIDER_SESSION_ID' });
    expect(tx.strengthEvidenceSession.upsert).not.toHaveBeenCalled();
  });

  it('treats a completed concurrent claim as already applied', async () => {
    vi.mocked(tx.strengthEvidenceSession.upsert).mockResolvedValue({
      id: 'session-1',
      effectState: 'PENDING',
    } as never);
    vi.mocked(tx.strengthEvidenceSession.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(tx.strengthEvidenceSession.findUnique).mockResolvedValue({
      effectState: 'APPLIED',
    } as never);

    await expect(claimStrengthEvidenceEffects(tx, 'user-1', evidence)).resolves.toEqual({
      status: 'ALREADY_APPLIED',
      sessionId: 'session-1',
    });
  });

  it('marks claimed effects applied only at the end of the transaction', async () => {
    vi.mocked(tx.strengthEvidenceSession.update).mockResolvedValue({} as never);
    const appliedAt = new Date('2026-09-02T18:45:00.000Z');

    await markStrengthEvidenceEffectsApplied(tx, 'session-1', appliedAt);

    expect(tx.strengthEvidenceSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: {
        effectState: 'APPLIED',
        effectsAppliedAt: appliedAt,
      },
    });
  });
});
