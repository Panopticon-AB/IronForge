import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-1' } } })),
    },
  })),
}));

vi.mock('@/features/strength-evidence/effect-gate', () => ({
  claimStrengthEvidenceEffects: vi.fn(),
  markStrengthEvidenceEffectsApplied: vi.fn(),
}));

vi.mock('@/lib/prisma', () => {
  const tx = {
    exercise: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    exerciseLog: {
      createMany: vi.fn(),
    },
  };

  const client = {
    $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
  };

  return {
    default: client,
    prisma: client,
  };
});

import { importHevyHistoryAction } from '@/actions/integrations/hevy';
import {
  claimStrengthEvidenceEffects,
  markStrengthEvidenceEffectsApplied,
} from '@/features/strength-evidence/effect-gate';
import prisma from '@/lib/prisma';

const workout = {
  id: 'hevy-workout-123',
  title: 'Hyper Pro strength',
  start_time: '2026-09-02T18:00:00.000Z',
  exercises: [
    {
      exercise_template_id: 'back-extension-template',
      exercise_template: {
        id: 'back-extension-template',
        title: 'Back Extension',
      },
      sets: [{ index: 0, weight_kg: 20, reps: 10 }],
    },
  ],
};

type TxMock = {
  exercise: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  exerciseLog: {
    createMany: ReturnType<typeof vi.fn>;
  };
};

const transactionMock = vi.mocked(prisma.$transaction);

describe('importHevyHistoryAction idempotency orchestration', () => {
  let tx: TxMock;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = {
      exercise: {
        findMany: vi.fn().mockResolvedValue([{ id: 'exercise-1', name: 'Back Extension' }]),
        create: vi.fn(),
      },
      exerciseLog: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    transactionMock.mockImplementation((callback: unknown) => {
      if (typeof callback !== 'function') throw new Error('Expected interactive transaction');
      return (callback as (transaction: TxMock) => unknown)(tx) as never;
    });
  });

  it('applies legacy logs and marks effects when an identified provider session is newly claimed', async () => {
    vi.mocked(claimStrengthEvidenceEffects).mockResolvedValue({
      status: 'CLAIMED',
      sessionId: 'session-1',
    });

    const result = await importHevyHistoryAction([workout]);

    expect(result).toMatchObject({
      success: true,
      count: 1,
      logs: 1,
      importedWorkouts: 1,
      duplicateWorkouts: 0,
      unidentifiedWorkouts: 0,
    });
    expect(tx.exerciseLog.createMany).toHaveBeenCalledTimes(1);
    expect(markStrengthEvidenceEffectsApplied).toHaveBeenCalledWith(tx, 'session-1');
  });

  it('does not create duplicate legacy logs when the same provider session is already applied', async () => {
    vi.mocked(claimStrengthEvidenceEffects)
      .mockResolvedValueOnce({ status: 'CLAIMED', sessionId: 'session-1' })
      .mockResolvedValueOnce({ status: 'ALREADY_APPLIED', sessionId: 'session-1' });

    await importHevyHistoryAction([workout]);
    const second = await importHevyHistoryAction([workout]);

    expect(tx.exerciseLog.createMany).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({
      logs: 0,
      importedWorkouts: 0,
      duplicateWorkouts: 1,
      unidentifiedWorkouts: 0,
    });
  });

  it('keeps missing provider identity explicit and uses the legacy fallback without fabricating an id', async () => {
    const result = await importHevyHistoryAction([{ ...workout, id: undefined }]);

    expect(claimStrengthEvidenceEffects).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      logs: 1,
      importedWorkouts: 1,
      duplicateWorkouts: 0,
      unidentifiedWorkouts: 1,
    });
  });

  it('can retry after a failed transaction without marking effects applied', async () => {
    vi.mocked(claimStrengthEvidenceEffects).mockResolvedValue({
      status: 'CLAIMED',
      sessionId: 'session-1',
    });
    tx.exerciseLog.createMany.mockRejectedValueOnce(new Error('write failed'));

    await expect(importHevyHistoryAction([workout])).rejects.toThrow('Failed to import history');
    expect(markStrengthEvidenceEffectsApplied).not.toHaveBeenCalled();

    tx.exerciseLog.createMany.mockResolvedValueOnce({ count: 1 });
    await expect(importHevyHistoryAction([workout])).resolves.toMatchObject({
      importedWorkouts: 1,
      duplicateWorkouts: 0,
    });
    expect(markStrengthEvidenceEffectsApplied).toHaveBeenCalledTimes(1);
  });
});
