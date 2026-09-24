import type { WholeBodyTrainingState } from '@/features/whole-body/wholeBodyTrainingState';
import { describe, expect, it } from 'vitest';

describe('WholeBodyTrainingState contract', () => {
  it('keeps local, systemic, impact and life-load evidence decomposed', () => {
    const state = {
      asOf: '2026-09-22T18:00:00.000Z',
      localRegions: [
        {
          regionId: 'quadriceps',
          load: 'HIGH',
          readiness: 'AMBER',
          confidence: 'HIGH',
          contributors: [
            {
              source: 'IRONFORGE_STRENGTH',
              sourceId: 'belt-squat-session',
              dimension: 'MUSCULAR',
              magnitude: 'HIGH',
              reasons: ['recent hard belt-squat work'],
            },
          ],
          reasons: ['recent overlapping lower-body load'],
        },
      ],
      systemic: {
        fitnessCtl: 31,
        fatigueAtl: 38,
        formTsb: -7,
        sleepScore: 62,
      },
      impactEccentric: {
        state: 'LOW',
        confidence: 'MEDIUM',
        contributors: [],
        reasons: ['no recent high-impact running evidence'],
      },
      lifeLoad: {
        energy: 'LOW',
        stress: 'HIGH',
        timeAvailableMinutes: 30,
        reasons: ['subjective context supplied by user'],
      },
      confidence: 'MEDIUM',
      freshness: 'FRESH',
      contributors: [],
      missingSignals: ['hrv'],
    } satisfies WholeBodyTrainingState;

    expect(state.localRegions[0]?.readiness).toBe('AMBER');
    expect(state.systemic.formTsb).toBe(-7);
    expect(state.impactEccentric?.state).toBe('LOW');
    expect(state.lifeLoad?.energy).toBe('LOW');
    expect('readinessScore' in state).toBe(false);
  });
});
