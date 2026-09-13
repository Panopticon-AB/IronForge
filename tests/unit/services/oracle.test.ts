import { getActivities, getWellness } from '@/lib/intervals';
import prisma from '@/lib/prisma';
import { OracleService as Oracle } from '@/services/oracle';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  default: {
    user: { findUnique: vi.fn() },
    cardioLog: { findMany: vi.fn() },
    exerciseLog: { findMany: vi.fn() },
    duelChallenge: { findFirst: vi.fn() }, // NEW
    userEquipment: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/intervals', () => ({
  getWellness: vi.fn(),
  getActivities: vi.fn(),
}));

vi.mock('@/lib/hevy', () => ({
  getHevyWorkouts: vi.fn(),
}));

vi.mock('@/services/game/EquipmentService', () => ({
  EquipmentService: {
    getUserCapabilities: vi.fn().mockResolvedValue(['BARBELL', 'MACHINE']),
  },
}));

describe('Oracle V3', () => {
  const mockUser = {
    id: 'u1',
    intervalsApiKey: 'key',
    intervalsAthleteId: 'id',
    titan: { isInjured: false },
    activePath: 'WARDEN',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.cardioLog.findMany).mockResolvedValue([]);
    vi.mocked(prisma.exerciseLog.findMany).mockResolvedValue([]);
    vi.mocked(prisma.duelChallenge.findFirst).mockResolvedValue(null); // Default no duel
    vi.mocked(getWellness).mockResolvedValue({});
    vi.mocked(getActivities).mockResolvedValue([]);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
  });

  it('should return V3 structure with codes', async () => {
    vi.mocked(getWellness).mockResolvedValue({ bodyBattery: 50, sleepScore: 50 });
    const decree = await Oracle.generateDailyDecree('u1');
    expect(decree.code).toBeDefined();
    expect(decree.actions).toBeDefined();
    expect(decree.code).toBe('BASELINE_GRIND');
  });

  it('should not force recovery when Body Battery is missing', async () => {
    const decree = await Oracle.generateDailyDecree('u1');

    expect(decree.code).toBe('BASELINE_GRIND');
  });

  it('should return INJURY_PRESERVATION if injured', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      titan: { isInjured: true },
    });

    const decree = await Oracle.generateDailyDecree('u1');

    expect(decree.code).toBe('INJURY_PRESERVATION');
    expect(decree.actions.lockFeatures).toContain('HEAVY_LIFT');
    expect(decree.actions.urgency).toBe('HIGH');
  });

  it('should return REST_FORCED if Body Battery is measured zero', async () => {
    vi.mocked(getWellness).mockResolvedValue({ bodyBattery: 0 });
    const decree = await Oracle.generateDailyDecree('u1');

    expect(decree.code).toBe('REST_FORCED');
    expect(decree.actions.lockFeatures).toContain('HEAVY_LIFT');
  });

  it('should return REST_FORCED if bio-metrics are critical', async () => {
    vi.mocked(getWellness).mockResolvedValue({ bodyBattery: 20 }); // Low
    const decree = await Oracle.generateDailyDecree('u1');

    expect(decree.code).toBe('REST_FORCED');
    expect(decree.actions.lockFeatures).toContain('HEAVY_LIFT');
  });

  it('should return PVP_RALLY if duel ending soon', async () => {
    vi.mocked(getWellness).mockResolvedValue({ bodyBattery: 50, sleepScore: 60 });

    // Mock Active Duel ending tomorrow
    vi.mocked(prisma.duelChallenge.findFirst).mockResolvedValue({
      id: 'd1',
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day left
      targetDistance: 50,
      challengerDistance: 40, // 10km gap from target
      defenderDistance: 40,
      challengerId: 'u1',
    });

    const decree = await Oracle.generateDailyDecree('u1');

    expect(decree.code).toBe('PVP_CRISIS');
    expect(decree.actions.urgency).toBe('HIGH');
    expect(decree.actions.notifyUser).toBe(true);
  });
});
