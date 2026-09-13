import { getWellness } from '@/lib/intervals';
import prisma from '@/lib/prisma';
import { AnalyticsService } from '@/services/analytics';
import { OracleService } from '@/services/oracle';
import { PlannerService } from '@/services/planner';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@/lib/prisma', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
    },
    weeklyPlan: {
      create: vi.fn(),
    },
  };
  return {
    __esModule: true,
    default: mockPrisma,
    prisma: mockPrisma,
  };
});
vi.mock('@/services/auditor-orchestrator', () => {
  return {
    __esModule: true,
    runFullAudit: vi.fn(() =>
      Promise.resolve({
        highestPriorityGap: null,
        muscleAudits: [],
        ratios: [],
        overallScore: 100,
        timestamp: new Date().toISOString(),
      })
    ),
  };
});
vi.mock('@/lib/intervals', () => ({
  getWellness: vi.fn(),
}));
vi.mock('@/services/analytics', () => ({
  AnalyticsService: {
    calculateTTB: vi.fn().mockReturnValue({
      strength: 50,
      endurance: 50,
      wellness: 50,
      lowest: 'strength',
    }),
  },
}));
vi.mock('@/services/oracle', () => ({
  OracleService: {
    consult: vi.fn().mockResolvedValue({
      id: 'mock-rec',
      title: 'mock-title',
      rationale: 'mock-rationale',
      playlist: [],
      generatedSession: null,
    }),
  },
}));

type AsyncMock = {
  mockResolvedValue: (value: unknown) => void;
};

const findUniqueMock = prisma.user.findUnique as unknown as AsyncMock;
const getWellnessMock = getWellness as unknown as AsyncMock;

describe('PlannerService', () => {
  it('should generate a plan for a valid user and preserve measured zero wellness evidence', async () => {
    getWellnessMock.mockResolvedValue({
      id: 'wellness-1',
      bodyBattery: 0,
      sleepScore: 0,
      hrv: 60,
      restingHR: 0,
      vo2max: 0,
      ctl: 0,
      atl: 0,
      tsb: 0,
      sleepSecs: 0,
      rampRate: 0,
    });

    // Setup mock user
    findUniqueMock.mockResolvedValue({
      id: 'user1',
      hevyApiKey: 'test-key',
      intervalsApiKey: 'test-key',
      intervalsAthleteId: 'test-id',
      exerciseLogs: [],
      cardioLogs: [],
      activePath: 'IRON_JUGGERNAUT',
    });

    const plan = await PlannerService.triggerWeeklyPlanGeneration('user1');

    expect(plan).toBeDefined();
    expect(plan.id).toMatch(/^plan_/);
    expect(prisma.weeklyPlan.create).toHaveBeenCalled();

    const calls = vi.mocked(AnalyticsService.calculateTTB).mock.calls;
    const wellnessEvidence = calls[calls.length - 1]?.[2];
    expect(wellnessEvidence).toEqual({ hrv: 60, tsb: 0 });
    expect(wellnessEvidence).not.toHaveProperty('ctl');
    expect(wellnessEvidence).not.toHaveProperty('atl');

    const oracleCalls = vi.mocked(OracleService.consult).mock.calls;
    const oracleWellness = oracleCalls[oracleCalls.length - 1]?.[0];
    expect(oracleWellness).toEqual({
      id: 'wellness-1',
      bodyBattery: 0,
      sleepScore: 0,
      hrv: 60,
      restingHR: 0,
      vo2max: 0,
      ctl: 0,
      atl: 0,
      tsb: 0,
      sleepSecs: 0,
      ramp_rate: 0,
    });
  });

  it('passes only real strength evidence to TTB without synthetic RPE or e1RM', async () => {
    const loggedAt = new Date('2026-09-01T18:30:00.000Z');
    findUniqueMock.mockResolvedValue({
      id: 'user1',
      intervalsApiKey: null,
      intervalsAthleteId: null,
      exerciseLogs: [
        {
          id: 'log-1',
          date: loggedAt,
          isPersonalRecord: true,
        },
      ],
      cardioLogs: [],
      activePath: 'HYBRID_WARDEN',
    });

    await PlannerService.triggerWeeklyPlanGeneration('user1');

    const calls = vi.mocked(AnalyticsService.calculateTTB).mock.calls;
    const latestCall = calls[calls.length - 1];
    const strengthHistory = latestCall?.[0];
    const wellnessEvidence = latestCall?.[2];

    expect(strengthHistory).toEqual([{ date: loggedAt.toISOString(), isEpic: true }]);
    expect(strengthHistory?.[0]).not.toHaveProperty('rpe');
    expect(strengthHistory?.[0]).not.toHaveProperty('e1rm');
    expect(wellnessEvidence).toEqual({});

    const oracleCalls = vi.mocked(OracleService.consult).mock.calls;
    const oracleWellness = oracleCalls[oracleCalls.length - 1]?.[0];
    expect(oracleWellness).toEqual({});
  });

  it('keeps unknown cardio load absent while preserving measured zero and HR evidence', async () => {
    const loggedAt = new Date('2026-09-02T18:30:00.000Z');
    findUniqueMock.mockResolvedValue({
      id: 'user1',
      intervalsApiKey: null,
      intervalsAthleteId: null,
      exerciseLogs: [],
      cardioLogs: [
        {
          intervalsId: 'cardio-unknown-load',
          date: loggedAt,
          type: 'Ride',
          duration: 1800,
          load: null,
          averageHr: null,
        },
        {
          intervalsId: 'cardio-zero-load',
          date: loggedAt,
          type: 'Ride',
          duration: 900,
          load: 0,
          averageHr: null,
        },
        {
          intervalsId: 'cardio-high-hr',
          date: loggedAt,
          type: 'Run',
          duration: 1200,
          load: 42,
          averageHr: 170,
        },
        {
          intervalsId: 'cardio-zero-hr',
          date: loggedAt,
          type: 'Walk',
          duration: 600,
          load: 5,
          averageHr: 0,
        },
      ],
      activePath: 'HYBRID_WARDEN',
    });

    await PlannerService.triggerWeeklyPlanGeneration('user1');

    const calls = vi.mocked(AnalyticsService.calculateTTB).mock.calls;
    const activities = calls[calls.length - 1]?.[1];

    expect(activities?.[0]).toEqual({
      id: 'cardio-unknown-load',
      start_date_local: loggedAt.toISOString(),
      type: 'Ride',
      moving_time: 1800,
    });
    expect(activities?.[0]).not.toHaveProperty('icu_intensity');
    expect(activities?.[0]).not.toHaveProperty('icu_training_load');

    expect(activities?.[1]).toEqual({
      id: 'cardio-zero-load',
      start_date_local: loggedAt.toISOString(),
      type: 'Ride',
      moving_time: 900,
      icu_training_load: 0,
    });
    expect(activities?.[1]).not.toHaveProperty('icu_intensity');

    expect(activities?.[2]?.icu_intensity).toBe(90);
    expect(activities?.[2]?.icu_training_load).toBe(42);

    expect(activities?.[3]?.icu_intensity).toBe(60);
    expect(activities?.[3]?.icu_training_load).toBe(5);
  });
});
