import { AnalyticsService } from '@/services/analytics';
import { describe, expect, it } from 'vitest';

describe('AnalyticsService.calculateTSBForecast missing baseline semantics', () => {
  it('returns no forecast when CTL is missing', () => {
    expect(AnalyticsService.calculateTSBForecast({ atl: 50 })).toEqual([]);
  });

  it('returns no forecast when ATL is missing', () => {
    expect(AnalyticsService.calculateTSBForecast({ ctl: 45 })).toEqual([]);
  });

  it('preserves measured zero CTL/ATL as a real baseline', () => {
    const forecast = AnalyticsService.calculateTSBForecast({ ctl: 0, atl: 0 });

    expect(forecast).toHaveLength(7);
    expect(forecast.every((day) => day.tsb === 0)).toBe(true);
    expect(forecast[0]).toEqual({
      dayOffset: 0,
      tsb: 0,
      label: 'Maintenance',
    });
  });

  it('keeps existing forecast behavior for measured real values', () => {
    const forecast = AnalyticsService.calculateTSBForecast({ ctl: 45, atl: 55 });

    expect(forecast).toHaveLength(7);
    expect(forecast[0]).toEqual({
      dayOffset: 0,
      tsb: -10,
      label: 'Productive Training',
    });
  });
});
