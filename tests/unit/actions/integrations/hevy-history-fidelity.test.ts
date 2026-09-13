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

const workout = {
  id: 'hevy-fidelity-123',
  title: 'Mixed strength',
  start_time: '2026-09-03T05:00:00.000Z',
  exercises: [
    {
      exercise_template_id: 'nordic-template',
      exercise_template: {
        id: 'nordic-template',
        title: 'Nordic Curl',
      },
      sets: [{ index: 0, weight_kg: 0, reps: 8 }],
    },
    {
      exercise_template_id: 'heavy-squat-template',
      exercise_template: {
        id: 'heavy-squat-template',
        title: 'Belt Squat',
      },
      sets: [{ index: 0, weight_kg: 120, reps: 5 }],
    },
  ],
};

describe('Hevy history import fidelity', () => {
  let tx: TxMock;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = {
      exercise: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'nordic-exercise', name: 'Nordic Curl' },
          { id: 'belt-squat-exercise', name: 'Belt Squat' },
        ]),
        create: vi.fn(),
      },
      exerciseLog: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    transactionMock.mockImplementation((callback: unknown) => {
      if (typeof callback !== 'function') throw new Error('Expected interactive transaction');
      return (callback as (transaction: TxMock) => unknown)(tx) as never;
    });
    vi.mocked(claimStrengthEvidenceEffects).mockResolvedValue({
      status: 'CLAIMED',
      sessionId: 'session-1',
    });
  });

  it('preserves zero-load bodyweight sets and does not infer personal records from load', async () => {
    const result = await importHevyHistoryAction([workout]);

    expect(result).toMatchObject({
      success: true,
      logs: 2,
      importedWorkouts: 1,
      duplicateWorkouts: 0,
    });

    expect(tx.exerciseLog.createMany).toHaveBeenCalledTimes(1);
    const createManyCall = tx.exerciseLog.createMany.mock.calls[0]?.[0];
    const data = createManyCall?.data as Array<Record<string, unknown>>;

    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      exerciseId: 'nordic-exercise',
      sets: [{ index: 0, weight_kg: 0, reps: 8 }],
    });
    expect(data[1]).toMatchObject({
      exerciseId: 'belt-squat-exercise',
      sets: [{ index: 0, weight_kg: 120, reps: 5 }],
    });
    expect(data[0]).not.toHaveProperty('isPersonalRecord');
    expect(data[1]).not.toHaveProperty('isPersonalRecord');
    expect(markStrengthEvidenceEffectsApplied).toHaveBeenCalledWith(tx, 'session-1');
  });
});
