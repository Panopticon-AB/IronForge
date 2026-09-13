import { buildDashboardTtb } from '@/features/dashboard/buildDashboardTtb';
import type { IntervalsActivity, IntervalsWellness } from '@/types';
import { describe, expect, it } from 'vitest';

describe('buildDashboardTtb', () => {
  it('keeps all TTB domains unknown when provider evidence is absent', () => {
    expect(buildDashboardTtb([], null)).toEqual({
      strength: null,
      endurance: null,
      wellness: null,
      lowest: null,
    });
  });

  it('derives only evidence-backed endurance and wellness while strength stays unknown', () => {
    const activities: IntervalsActivity[] = [
      {
        moving_time: 30 * 60,
        icu_intensity: 90,
      },
    ];
    const wellness: IntervalsWellness = {
      hrv: 60,
      tsb: 0,
    };

    expect(buildDashboardTtb(activities, wellness)).toEqual({
      strength: null,
      endurance: 100,
      wellness: 100,
      lowest: null,
    });
  });

  it('preserves a measured zero endurance score instead of treating it as unknown', () => {
    const activities: IntervalsActivity[] = [
      {
        moving_time: 30 * 60,
        icu_intensity: 60,
      },
    ];
    const wellness: IntervalsWellness = {
      hrv: 60,
      tsb: 0,
    };

    expect(buildDashboardTtb(activities, wellness)).toEqual({
      strength: null,
      endurance: 0,
      wellness: 100,
      lowest: null,
    });
  });
});
