import {
  RECOVERY_SYSTEM_METRIC_KEYS,
  resolveRecoverySystemMetricsEvidence,
} from '@/features/system-metrics/evidence';
import { describe, expect, it } from 'vitest';

describe('resolveRecoverySystemMetricsEvidence', () => {
  it('keeps fully missing recovery evidence unknown without assumptions', () => {
    const resolution = resolveRecoverySystemMetricsEvidence({});

    expect(resolution.metrics).toEqual({});
    expect(resolution.missingSignals).toEqual([...RECOVERY_SYSTEM_METRIC_KEYS]);
    expect(resolution.confidence).toBe('LOW');
    expect(resolution.assumptions).toEqual([]);
  });

  it('preserves measured zero instead of treating it as missing', () => {
    const resolution = resolveRecoverySystemMetricsEvidence({
      hrv: 0,
      hrvBaseline: 0,
      tsb: 0,
      sleepScore: 0,
      bodyBattery: 0,
      soreness: 0,
      mood: 'EXHAUSTED',
    });

    expect(resolution.metrics).toEqual({
      hrv: 0,
      hrvBaseline: 0,
      tsb: 0,
      sleepScore: 0,
      bodyBattery: 0,
      soreness: 0,
      mood: 'EXHAUSTED',
    });
    expect(resolution.missingSignals).toEqual([]);
    expect(resolution.confidence).toBe('HIGH');
  });

  it('treats null as missing while retaining real observed values', () => {
    const resolution = resolveRecoverySystemMetricsEvidence({
      hrv: 58,
      hrvBaseline: 62,
      tsb: -12,
      sleepScore: 81,
      bodyBattery: null,
      soreness: 3,
      mood: 'NORMAL',
    });

    expect(resolution.metrics).toEqual({
      hrv: 58,
      hrvBaseline: 62,
      tsb: -12,
      sleepScore: 81,
      soreness: 3,
      mood: 'NORMAL',
    });
    expect(resolution.missingSignals).toEqual(['bodyBattery']);
    expect(resolution.confidence).toBe('MEDIUM');
  });

  it('lowers confidence when multiple critical recovery signals are absent', () => {
    const resolution = resolveRecoverySystemMetricsEvidence({
      hrvBaseline: 60,
      bodyBattery: 45,
      soreness: 2,
      mood: 'NORMAL',
    });

    expect(resolution.missingSignals).toEqual(['hrv', 'tsb', 'sleepScore']);
    expect(resolution.confidence).toBe('LOW');
    expect(resolution.assumptions).toEqual([]);
  });
});
