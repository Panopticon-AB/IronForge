import { buildWholeBodyTrainingContext } from '@/features/whole-body/wholeBodyTrainingContext';
import type { WholeBodyTrainingState } from '@/features/whole-body/wholeBodyTrainingState';
import type { ChatTrainingContext } from '@/features/training-context/chatTrainingContext';
import { describe, expect, it } from 'vitest';

const localState: Pick<
  WholeBodyTrainingState,
  'localRegions' | 'impactEccentric' | 'lifeLoad' | 'confidence'
> = {
  localRegions: [
    {
      regionId: 'quadriceps',
      load: 'HIGH',
      readiness: 'AMBER',
      confidence: 'HIGH',
      contributors: Array.from({ length: 8 }, (_, index) => ({
        source: 'IRONFORGE_STRENGTH' as const,
        sourceId: `strength-${index}`,
        magnitude: 'HIGH' as const,
        dimension: 'MUSCULAR' as const,
        reasons: ['belt squat'],
      })),
      reasons: ['recent strength', 'recent cycling', 'overlap', 'still recovering', 'warm-up gate', 'extra'],
    },
  ],
  impactEccentric: {
    state: 'LOW',
    confidence: 'MEDIUM',
    contributors: [],
    reasons: ['no recent hard running'],
  },
  lifeLoad: {
    energy: 'LOW',
    stress: 'HIGH',
    timeAvailableMinutes: 30,
    reasons: ['family/work context'],
  },
  confidence: 'HIGH',
};

const trainingContext: ChatTrainingContext = {
  asOf: '2026-09-22T18:00:00.000Z',
  source: 'INTERVALS_ICU',
  wellness: {
    fitnessCtl: 31,
    fatigueAtl: 38,
    formTsb: -7,
    sleepScore: 62,
    bodyBattery: 41,
  },
  recentActivities: [],
  freshness: 'FRESH',
  missingSignals: ['hrv'],
};

describe('buildWholeBodyTrainingContext', () => {
  it('composes bounded local state with existing Intervals-derived systemic context', () => {
    const result = buildWholeBodyTrainingContext({ localState, trainingContext });

    expect(result.asOf).toBe(trainingContext.asOf);
    expect(result.localRegions[0]?.contributors).toHaveLength(5);
    expect(result.localRegions[0]?.reasons).toHaveLength(5);
    expect(result.systemic).toMatchObject({ fitnessCtl: 31, fatigueAtl: 38, formTsb: -7 });
    expect(result.missingSignals).toContain('hrv');
    expect('contributors' in result).toBe(false);
  });

  it('degrades confidence when Intervals context is unavailable', () => {
    const result = buildWholeBodyTrainingContext({
      localState,
      trainingContext: null,
      asOf: '2026-09-22T18:00:00.000Z',
    });

    expect(result.systemic).toEqual({});
    expect(result.freshness).toBe('UNKNOWN');
    expect(result.confidence).toBe('LOW');
    expect(result.missingSignals).toEqual(['intervals_training_context']);
  });

  it('keeps stale provider evidence visible while reducing overconfidence', () => {
    const result = buildWholeBodyTrainingContext({
      localState,
      trainingContext: { ...trainingContext, freshness: 'STALE' },
    });

    expect(result.freshness).toBe('STALE');
    expect(result.confidence).toBe('MEDIUM');
    expect(result.systemic.sleepScore).toBe(62);
  });
});
