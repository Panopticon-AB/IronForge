import { buildChatTrainingContext } from '@/features/training-context/chatTrainingContext';
import type { IntervalsActivity, WellnessData } from '@/lib/intervals';
import { describe, expect, it } from 'vitest';

const AS_OF = new Date('2026-09-04T18:00:00Z');

describe('ChatTrainingContext sustainable coaching scenarios', () => {
  it('preserves positive form and depleted recovery as separate simultaneous signals', () => {
    const wellness: WellnessData = {
      date: '2026-09-04',
      bodyBattery: 18,
      readiness: 18,
      sleepScore: 42,
      hrv: 31,
      ctl: 52,
      atl: 40,
      tsb: 12,
    };

    const context = buildChatTrainingContext({ wellness, asOf: AS_OF });

    expect(context.wellness.formTsb).toBe(12);
    expect(context.wellness.bodyBattery).toBe(18);
    expect(context.wellness.sleepScore).toBe(42);
    expect(context.wellness.hrv).toBe(31);
    expect(context.missingSignals).not.toContain('formTsb');
    expect(context.missingSignals).not.toContain('bodyBattery');
    expect(context).not.toHaveProperty('readiness');
    expect(context.wellness).not.toHaveProperty('readiness');
  });

  it('represents missing wellness as explicit uncertainty without neutral replacement values', () => {
    const context = buildChatTrainingContext({ wellness: undefined, activities: [], asOf: AS_OF });

    expect(context.freshness).toBe('UNKNOWN');
    expect(context.wellness).toEqual({});
    expect(context.missingSignals).toEqual(
      expect.arrayContaining(['bodyBattery', 'sleepScore', 'hrv', 'fitnessCtl', 'fatigueAtl', 'formTsb'])
    );
    expect(context.wellness.bodyBattery).toBeUndefined();
    expect(context.wellness.formTsb).toBeUndefined();
  });

  it('keeps measured zero distinct from missing evidence', () => {
    const wellness: WellnessData = {
      date: '2026-09-04',
      readiness: 0,
      bodyBattery: 0,
      sleepScore: 0,
      hrv: 0,
      ctl: 0,
      atl: 0,
      tsb: 0,
    };

    const context = buildChatTrainingContext({ wellness, asOf: AS_OF });

    expect(context.wellness.bodyBattery).toBe(0);
    expect(context.wellness.sleepScore).toBe(0);
    expect(context.wellness.hrv).toBe(0);
    expect(context.wellness.fitnessCtl).toBe(0);
    expect(context.wellness.fatigueAtl).toBe(0);
    expect(context.wellness.formTsb).toBe(0);
    expect(context.missingSignals).not.toContain('bodyBattery');
    expect(context.missingSignals).not.toContain('formTsb');
  });

  it('keeps recent run and ride evidence together while excluding old activity history', () => {
    const activities: IntervalsActivity[] = [
      {
        id: 'ride-recent',
        type: 'Ride',
        start_date_local: '2026-09-04T08:00:00Z',
        moving_time: 3_600,
        icu_training_load: 48,
        icu_intensity: 71,
      },
      {
        id: 'run-recent',
        type: 'Run',
        start_date_local: '2026-09-03T17:30:00Z',
        moving_time: 2_100,
        icu_training_load: 35,
        icu_intensity: 68,
      },
      {
        id: 'ride-old',
        type: 'Ride',
        start_date_local: '2026-09-01T08:00:00Z',
        moving_time: 4_500,
        icu_training_load: 60,
      },
    ];

    const context = buildChatTrainingContext({ activities, asOf: AS_OF });

    expect(context.recentActivities.map((activity) => activity.id)).toEqual([
      'ride-recent',
      'run-recent',
    ]);
    expect(context.recentActivities.map((activity) => activity.type)).toEqual(['Ride', 'Run']);
    expect(context.recentActivities.find((activity) => activity.id === 'ride-old')).toBeUndefined();
  });

  it('retains stale wellness evidence while marking its freshness explicitly', () => {
    const wellness: WellnessData = {
      date: '2026-09-01',
      readiness: 34,
      bodyBattery: 34,
      sleepScore: 58,
      hrv: 36,
      tsb: -8,
    };

    const context = buildChatTrainingContext({ wellness, asOf: AS_OF });

    expect(context.freshness).toBe('STALE');
    expect(context.wellness.bodyBattery).toBe(34);
    expect(context.wellness.sleepScore).toBe(58);
    expect(context.wellness.formTsb).toBe(-8);
    expect(context.missingSignals).not.toContain('bodyBattery');
    expect(context.missingSignals).not.toContain('formTsb');
  });
});
