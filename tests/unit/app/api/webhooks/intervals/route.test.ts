import { POST } from '@/app/api/webhooks/intervals/route';
import prisma from '@/lib/prisma';
import { Progression } from '@/services/progression';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const mockPrisma = {
    user: { findFirst: vi.fn() },
    cardioLog: { upsert: vi.fn() },
  };

  return {
    __esModule: true,
    default: mockPrisma,
    prisma: mockPrisma,
  };
});

vi.mock('@/actions/pvp/duel', () => ({
  processUserCardioActivity: vi.fn(),
}));

vi.mock('@/services/game/TerritoryService', () => ({
  TerritoryService: {
    recordGuildActivity: vi.fn(),
  },
}));

vi.mock('@/services/progression', () => ({
  Progression: {
    awardGold: vi.fn(),
    addExperience: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function createRequest(payload: Record<string, unknown>) {
  return new Request('http://localhost:3000/api/webhooks/intervals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

const baseActivity = {
  id: 'intervals-1',
  type: 'Ride',
  start_date_local: '2026-09-03T06:00:00.000Z',
  moving_time: 3600,
  icu_athlete_id: 'athlete-1',
};

describe('Intervals activity webhook cardio load fidelity', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'user-1',
      intervalsApiKey: null,
      guildId: null,
    } as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    vi.mocked(prisma.cardioLog.upsert).mockResolvedValue({} as Awaited<
      ReturnType<typeof prisma.cardioLog.upsert>
    >);
    vi.mocked(Progression.awardGold).mockResolvedValue();
    vi.mocked(Progression.addExperience).mockResolvedValue();
  });

  it('persists missing provider training load as null', async () => {
    const response = await POST(createRequest(baseActivity) as never);

    expect(response.status).toBe(200);
    expect(prisma.cardioLog.upsert).toHaveBeenCalledTimes(1);

    const payload = vi.mocked(prisma.cardioLog.upsert).mock.calls[0]?.[0];
    expect(payload?.create.load).toBeNull();
    expect(payload?.update.load).toBeNull();
  });

  it('preserves a measured zero training load as zero', async () => {
    const response = await POST(createRequest({ ...baseActivity, training_load: 0 }) as never);

    expect(response.status).toBe(200);

    const payload = vi.mocked(prisma.cardioLog.upsert).mock.calls[0]?.[0];
    expect(payload?.create.load).toBe(0);
    expect(payload?.update.load).toBe(0);
  });

  it('preserves a measured positive training load unchanged', async () => {
    await POST(createRequest({ ...baseActivity, training_load: 47.5 }) as never);

    const payload = vi.mocked(prisma.cardioLog.upsert).mock.calls[0]?.[0];
    expect(payload?.create.load).toBe(47.5);
    expect(payload?.update.load).toBe(47.5);
  });
});
