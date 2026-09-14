import {
  TRAINING_ROI_REASON_CODES,
  normalizeTrainingRoiReasonCodes,
  type TrainingRoiResult,
} from '@/types/training-roi';
import { describe, expect, it } from 'vitest';

const ROI_FIXTURES = [
  {
    candidateId: 'easy-cycle-25',
    components: {
      goalFit: 'HIGH',
      stimulusValue: 'MODERATE',
      continuityValue: 'HIGH',
      subjectiveUtility: 'HIGH',
      recoveryCost: 'LOW',
      timeFit: 'GOOD',
      setupFriction: 'LOW',
      adherenceRisk: 'LOW',
      preservesNextQualitySession: true,
    },
    reasonCodes: [
      'SIMILAR_VALUE_LOWER_RECOVERY_COST',
      'PRESERVES_NEXT_QUALITY_SESSION',
    ],
    rationale: [
      'Advances aerobic volume with low recovery cost.',
      'Preserves capacity for the next quality session.',
    ],
  },
  {
    candidateId: 'home-strength-15',
    components: {
      goalFit: 'MODERATE',
      stimulusValue: 'MODERATE',
      recoveryCost: 'LOW',
      timeFit: 'GOOD',
      setupFriction: 'VERY_LOW',
      contextFriction: 'VERY_LOW',
      adherenceRisk: 'LOW',
    },
    reasonCodes: ['BETTER_TIME_FIT', 'LOWER_SETUP_FRICTION'],
    rationale: [
      'Fits the available time window.',
      'Requires almost no setup in the current context.',
    ],
  },
  {
    candidateId: 'planned-vo2',
    components: {
      goalFit: 'HIGH',
      stimulusValue: 'HIGH',
      recoveryCost: 'HIGH',
      timeFit: 'GOOD',
      setupFriction: 'LOW',
      adherenceRisk: 'MODERATE',
    },
    reasonCodes: ['BETTER_GOAL_FIT', 'UNIQUE_HIGH_VALUE_STIMULUS'],
    rationale: [
      'This is the planned quality stimulus for the current training objective.',
    ],
  },
  {
    candidateId: 'minimum-walk',
    components: {
      goalFit: 'LOW',
      stimulusValue: 'LOW',
      continuityValue: 'HIGH',
      recoveryCost: 'VERY_LOW',
      timeFit: 'GOOD',
      setupFriction: 'VERY_LOW',
      adherenceRisk: 'LOW',
    },
    reasonCodes: ['LOWER_ADHERENCE_RISK'],
    rationale: ['Small enough to remain executable on a constrained day.'],
  },
] satisfies TrainingRoiResult[];

describe('Training ROI contract', () => {
  it('keeps the reason-code vocabulary unique', () => {
    expect(new Set(TRAINING_ROI_REASON_CODES).size).toBe(
      TRAINING_ROI_REASON_CODES.length,
    );
  });

  it('normalizes reasons into stable product order without duplicates', () => {
    expect(
      normalizeTrainingRoiReasonCodes([
        'LOWER_SETUP_FRICTION',
        'BETTER_TIME_FIT',
        'LOWER_SETUP_FRICTION',
        'SIMILAR_VALUE_LOWER_RECOVERY_COST',
      ]),
    ).toEqual([
      'SIMILAR_VALUE_LOWER_RECOVERY_COST',
      'BETTER_TIME_FIT',
      'LOWER_SETUP_FRICTION',
    ]);
  });

  it('represents different ROI explanations without an opaque scalar score', () => {
    expect(ROI_FIXTURES).toHaveLength(4);

    for (const result of ROI_FIXTURES) {
      expect(result.candidateId).toBeTruthy();
      expect(result.reasonCodes.length).toBeGreaterThan(0);
      expect(result.rationale.length).toBeGreaterThan(0);
      expect('roiScore' in result).toBe(false);
      expect(result.components.goalFit).toBeTruthy();
      expect(result.components.stimulusValue).toBeTruthy();
      expect(result.components.recoveryCost).toBeTruthy();
      expect(result.components.timeFit).toBeTruthy();
      expect(result.components.setupFriction).toBeTruthy();
    }
  });

  it('covers recovery, time, friction, hard-stimulus and adherence semantics', () => {
    const reasons = new Set(ROI_FIXTURES.flatMap((fixture) => fixture.reasonCodes));

    expect(reasons).toEqual(new Set(TRAINING_ROI_REASON_CODES));
  });
});
