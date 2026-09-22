import { mapIntervalsActivityToLocalLoad } from '@/features/whole-body/intervalsLocalLoadAdapter';
import type { IntervalsActivity } from '@/lib/intervals';
import { describe, expect, it } from 'vitest';

function activity(overrides: Partial<IntervalsActivity> = {}): IntervalsActivity {
  return {
    id: 'activity-1',
    type: 'Ride',
    start_date_local: '2026-09-22T12:00:00Z',
    moving_time: 3_600,
    icu_intensity: 65,
    ...overrides,
  };
}

describe('mapIntervalsActivityToLocalLoad', () => {
  it('maps a short recovery ride to low local lower-body load', () => {
    const result = mapIntervalsActivityToLocalLoad(
      activity({ moving_time: 1_500, icu_intensity: 50 })
    );

    expect(result.find((item) => item.regionId === 'quadriceps')?.magnitude).toBe('LOW');
    expect(result.every((item) => item.dimension === 'MUSCULAR')).toBe(true);
  });

  it('maps endurance cycling to moderate quads/glutes when Intervals intensity supports it', () => {
    const result = mapIntervalsActivityToLocalLoad(activity({ icu_intensity: 72 }));

    expect(result.find((item) => item.regionId === 'quadriceps')?.magnitude).toBe('MODERATE');
    expect(result.find((item) => item.regionId === 'glutes')?.magnitude).toBe('MODERATE');
  });

  it('maps hard cycling to high quads/glutes without recalculating endurance load', () => {
    const result = mapIntervalsActivityToLocalLoad(
      activity({ icu_intensity: 92, icu_training_load: 88 })
    );

    expect(result.find((item) => item.regionId === 'quadriceps')?.magnitude).toBe('HIGH');
    expect(result[0]?.reasons).toContain('Intervals intensity 92');
  });

  it('uses duration as a conservative fallback when intensity is missing', () => {
    const result = mapIntervalsActivityToLocalLoad(
      activity({ moving_time: 6_000, icu_intensity: null })
    );

    expect(result.find((item) => item.regionId === 'quadriceps')?.magnitude).toBe('MODERATE');
    expect(result[0]?.confidence).toBe('MEDIUM');
    expect(result[0]?.reasons).toContain('intensity unavailable; duration-only fallback');
  });

  it('maps easy running to local muscle load plus separate impact/eccentric evidence', () => {
    const result = mapIntervalsActivityToLocalLoad(
      activity({ type: 'Run', moving_time: 1_800, icu_intensity: 62 })
    );

    expect(result.find((item) => item.regionId === 'quadriceps')?.magnitude).toBe('LOW');
    expect(result.find((item) => item.dimension === 'IMPACT_ECCENTRIC')?.magnitude).toBe('LOW');
  });

  it('maps hard running to high local and impact/eccentric load', () => {
    const result = mapIntervalsActivityToLocalLoad(
      activity({ type: 'Run', moving_time: 2_700, icu_intensity: 91 })
    );

    expect(result.find((item) => item.regionId === 'calves')?.magnitude).toBe('HIGH');
    expect(result.find((item) => item.dimension === 'IMPACT_ECCENTRIC')?.magnitude).toBe('HIGH');
  });

  it('maps a long easy run to elevated impact/eccentric cost', () => {
    const result = mapIntervalsActivityToLocalLoad(
      activity({ type: 'Run', moving_time: 6_000, icu_intensity: 66 })
    );

    expect(result.find((item) => item.dimension === 'IMPACT_ECCENTRIC')?.magnitude).toBe('HIGH');
  });

  it('ignores unsupported activity types instead of inventing a mapping', () => {
    const result = mapIntervalsActivityToLocalLoad(activity({ type: 'Swim' }));

    expect(result).toEqual([]);
  });
});
