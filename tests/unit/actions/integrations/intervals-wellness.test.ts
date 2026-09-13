import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-1' } } })),
    },
  })),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/intervals', () => ({
  getWellness: vi.fn(),
  getActivities: vi.fn(),
  getAthleteSettings: vi.fn(),
  getEvents: vi.fn(),
}));

import { getWellnessAction, getWellnessRangeAction } from '@/actions/integrations/intervals';
import { getWellness } from '@/lib/intervals';
import prisma from '@/lib/prisma';

const getWellnessMock = vi.mocked(getWellness);
const findUserMock = vi.mocked(prisma.user.findUnique);

const credentials = {
  intervalsApiKey: 'test-key',
  intervalsAthleteId: 'test-athlete',
};

describe('Intervals wellness actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUserMock.mockResolvedValue(credentials as never);
  });

  it('preserves a real Body Battery value', async () => {
    getWellnessMock.mockResolvedValue({
      id: 'w1',
      date: '2026-09-03',
      readiness: 42,
      bodyBattery: 42,
    } as never);

    await expect(getWellnessAction('2026-09-03')).resolves.toMatchObject({
      id: 'w1',
      bodyBattery: 42,
    });
  });

  it('does not manufacture Body Battery for single-day wellness', async () => {
    getWellnessMock.mockResolvedValue({
      id: 'w1',
      date: '2026-09-03',
      readiness: undefined,
      bodyBattery: undefined,
    } as never);

    const result = await getWellnessAction('2026-09-03');

    expect(result.bodyBattery).toBeUndefined();
  });

  it('does not manufacture Body Battery in wellness ranges', async () => {
    getWellnessMock.mockResolvedValue([
      {
        id: 'missing',
        date: '2026-09-02',
        readiness: undefined,
        bodyBattery: undefined,
      },
      {
        id: 'measured',
        date: '2026-09-03',
        readiness: 67,
        bodyBattery: 67,
      },
    ] as never);

    const result = await getWellnessRangeAction('2026-09-02', '2026-09-03');

    expect(result).toHaveLength(2);
    expect(result[0].bodyBattery).toBeUndefined();
    expect(result[1].bodyBattery).toBe(67);
  });
});
