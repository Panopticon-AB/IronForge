import { AnalyticsService } from '@/services/analytics';
import type { IntervalsActivity } from '@/types';
import { describe, expect, it } from 'vitest';

function activity(intensity?: number): IntervalsActivity {
  return {
    start_date_local: '2026-09-03T06:00:00.000Z',
    moving_time: 30 * 60,
    ...(intensity === undefined ? {} : { icu_intensity: intensity }),
  };
}

describe('AnalyticsService.calculateTTB unknown evidence semantics', () => {
  it('returns unknown scores when no evidence exists', () => {
    expect(AnalyticsService.calculateTTB([], [], {})).toEqual({
      strength: null,
      endurance: null,
      wellness: null,
      lowest: null,
    });
  });

  it('preserves measured zero endurance when intensity evidence is complete', () => {
    const ttb = AnalyticsService.calculateTTB([], [activity(60)], {});

    expect(ttb.endurance).toBe(0);
    expect(ttb.lowest).toBeNull();
  });

  it('keeps endurance unknown when an activity has no intensity evidence', () => {
    const ttb = AnalyticsService.calculateTTB([], [activity()], {});

    expect(ttb.endurance).toBeNull();
  });

  it('requires both HRV and TSB for the current wellness formula', () => {
    expect(AnalyticsService.calculateTTB([], [], { hrv: 60, tsb: 0 }).wellness).toBe(100);
    expect(AnalyticsService.calculateTTB([], [], { hrv: 60 }).wellness).toBeNull();
    expect(AnalyticsService.calculateTTB([], [], { tsb: 0 }).wellness).toBeNull();
  });

  it('selects a lowest domain only when all three scores are known', () => {
    const ttb = AnalyticsService.calculateTTB(
      [{ date: new Date().toISOString(), isEpic: true }],
      [activity(60)],
      { hrv: 60, tsb: 0 }
    );

    expect(ttb.strength).toBe(100);
    expect(ttb.endurance).toBe(0);
    expect(ttb.wellness).toBe(100);
    expect(ttb.lowest).toBe('endurance');
  });
});
