import { generateProgramAction } from '@/actions/training/program';
import { getSession } from '@/lib/auth';
import { getWellness } from '@/lib/intervals';
import prisma from '@/lib/prisma';
import { AnalyticsService } from '@/services/analytics';
import { EquipmentService } from '@/services/game/EquipmentService';
import { GeminiService } from '@/services/gemini';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/intervals', () => ({
  getWellness: vi.fn(),
}));

vi.mock('@/lib/prisma', () => {
  const mockPrisma = {
    user: { findUnique: vi.fn() },
    exerciseLog: { findMany: vi.fn() },
    cardioLog: { findMany: vi.fn() },
    titan: { findUnique: vi.fn() },
    weeklyPlan: { create: vi.fn() },
  };

  return {
    __esModule: true,
    default: mockPrisma,
    prisma: mockPrisma,
  };
});

vi.mock('@/services/analytics', () => ({
  AnalyticsService: {
    calculateTTB: vi.fn(),
  },
}));

vi.mock('@/services/game/EquipmentService', () => ({
  EquipmentService: {
    getUserCapabilities: vi.fn(),
  },
}));

vi.mock('@/services/gemini', () => ({
  GeminiService: {
    generateWeeklyPlanAI: vi.fn(),
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('generateProgramAction evidence mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user-1' },
    } as Awaited<ReturnType<typeof getSession>>);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      intervalsApiKey: null,
      intervalsAthleteId: null,
      heroName: 'Titan',
      level: 1,
      activePath: 'WARDEN',
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    vi.mocked(prisma.exerciseLog.findMany).mockResolvedValue([]);
    vi.mocked(prisma.cardioLog.findMany).mockResolvedValue([]);
    vi.mocked(prisma.titan.findUnique).mockResolvedValue(null);
    vi.mocked(EquipmentService.getUserCapabilities).mockResolvedValue([]);
    vi.mocked(AnalyticsService.calculateTTB).mockReturnValue({
      strength: 50,
      endurance: 50,
      wellness: 50,
      lowest: 'strength',
    });
    vi.mocked(GeminiService.generateWeeklyPlanAI).mockResolvedValue({ days: [] });
  });

  it('keeps recovery unknown when Intervals is not connected', async () => {
    await generateProgramAction({ intent: 'Strength', daysPerWeek: 3 });

    expect(getWellness).not.toHaveBeenCalled();

    const analyticsWellness = vi.mocked(AnalyticsService.calculateTTB).mock.calls[0]?.[2];
    expect(analyticsWellness).toEqual({});
    expect(analyticsWellness).not.toHaveProperty('bodyBattery');
    expect(analyticsWellness).not.toHaveProperty('sleepScore');

    const geminiContext = vi.mocked(GeminiService.generateWeeklyPlanAI).mock.calls[0]?.[1];
    expect(geminiContext?.wellness).toEqual({});
    expect(geminiContext?.wellness).not.toHaveProperty('bodyBattery');
    expect(geminiContext?.wellness).not.toHaveProperty('sleepScore');
  });

  it('preserves measured Intervals recovery while dropping provider-only fields', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      intervalsApiKey: 'intervals-key',
      intervalsAthleteId: 'athlete-1',
      heroName: 'Titan',
      level: 1,
      activePath: 'WARDEN',
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const measuredWellness = {
      date: '2026-09-03',
      bodyBattery: 27,
      sleepScore: 62,
      hrv: 48,
      tsb: 0,
    } as NonNullable<Awaited<ReturnType<typeof getWellness>>>;
    vi.mocked(getWellness).mockResolvedValue(measuredWellness);

    await generateProgramAction({ intent: 'Strength', daysPerWeek: 3 });

    expect(getWellness).toHaveBeenCalledTimes(1);

    const normalizedWellness = {
      bodyBattery: 27,
      sleepScore: 62,
      hrv: 48,
      tsb: 0,
    };
    const analyticsWellness = vi.mocked(AnalyticsService.calculateTTB).mock.calls[0]?.[2];
    expect(analyticsWellness).toEqual(normalizedWellness);

    const geminiContext = vi.mocked(GeminiService.generateWeeklyPlanAI).mock.calls[0]?.[1];
    expect(geminiContext?.wellness).toEqual(normalizedWellness);
  });

  it('passes only real strength recency and PR evidence to TTB', async () => {
    const loggedAt = new Date('2026-09-02T18:30:00.000Z');
    vi.mocked(prisma.exerciseLog.findMany).mockResolvedValue(
      [
        {
          date: loggedAt,
          isPersonalRecord: true,
        },
      ] as unknown as Awaited<ReturnType<typeof prisma.exerciseLog.findMany>>
    );

    await generateProgramAction({ intent: 'Strength', daysPerWeek: 3 });

    const strengthHistory = vi.mocked(AnalyticsService.calculateTTB).mock.calls[0]?.[0];
    expect(strengthHistory).toEqual([{ date: loggedAt.toISOString(), isEpic: true }]);
    expect(strengthHistory?.[0]).not.toHaveProperty('exerciseId');
    expect(strengthHistory?.[0]).not.toHaveProperty('e1rm');
    expect(strengthHistory?.[0]).not.toHaveProperty('rpe');
  });

  it('does not treat cardio load as intensity and keeps missing heart rate unknown', async () => {
    const firstAt = new Date('2026-09-03T06:00:00.000Z');
    const secondAt = new Date('2026-09-02T06:00:00.000Z');
    const thirdAt = new Date('2026-09-01T06:00:00.000Z');

    vi.mocked(prisma.cardioLog.findMany).mockResolvedValue(
      [
        {
          date: firstAt,
          duration: 3600,
          type: 'Ride',
          load: 120,
          averageHr: null,
        },
        {
          date: secondAt,
          duration: 1800,
          type: 'Run',
          load: 35,
          averageHr: 170,
        },
        {
          date: thirdAt,
          duration: 2400,
          type: 'Ride',
          load: 0,
          averageHr: 150,
        },
      ] as unknown as Awaited<ReturnType<typeof prisma.cardioLog.findMany>>
    );

    await generateProgramAction({ intent: 'Hybrid', daysPerWeek: 3 });

    const activities = vi.mocked(AnalyticsService.calculateTTB).mock.calls[0]?.[1];

    expect(activities?.[0]).toEqual({
      moving_time: 3600,
      type: 'Ride',
      start_date_local: firstAt.toISOString(),
    });
    expect(activities?.[0]).not.toHaveProperty('icu_intensity');
    expect(activities?.[0]).not.toHaveProperty('icu_training_load');

    expect(activities?.[1]?.icu_intensity).toBe(90);
    expect(activities?.[2]?.icu_intensity).toBe(60);
    expect(activities?.every((activity) => !('icu_training_load' in activity))).toBe(true);
  });
});