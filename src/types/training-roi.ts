import type {
  PracticalFriction,
  RecoveryCost,
  SubjectiveUtility,
} from './daily-trainability';

export type TrainingRoiValue = 'LOW' | 'MODERATE' | 'HIGH';
export type TrainingRoiTimeFit = 'POOR' | 'ACCEPTABLE' | 'GOOD';
export type TrainingRoiRisk = 'LOW' | 'MODERATE' | 'HIGH';

/**
 * Stable explanation vocabulary for why one already-safe training candidate
 * offers better real-world return than another.
 *
 * Safety/readiness filtering must happen before this layer. These reasons are
 * descriptive; none of them may promote a candidate that was filtered out.
 */
export const TRAINING_ROI_REASON_CODES = [
  'SIMILAR_VALUE_LOWER_RECOVERY_COST',
  'BETTER_TIME_FIT',
  'LOWER_SETUP_FRICTION',
  'BETTER_GOAL_FIT',
  'UNIQUE_HIGH_VALUE_STIMULUS',
  'PRESERVES_NEXT_QUALITY_SESSION',
  'LOWER_ADHERENCE_RISK',
] as const;

export type TrainingRoiReasonCode =
  (typeof TRAINING_ROI_REASON_CODES)[number];

/**
 * Explicit value/cost components used to explain ROI decisions.
 *
 * Keep these dimensions inspectable. Do not replace them with a public opaque
 * scalar score: ranking logic may compare components, but callers should be
 * able to explain the decision in product language.
 */
export interface TrainingRoiComponents {
  goalFit: TrainingRoiValue;
  stimulusValue: TrainingRoiValue;
  continuityValue?: TrainingRoiValue;
  subjectiveUtility?: SubjectiveUtility;
  recoveryCost: RecoveryCost;
  timeFit: TrainingRoiTimeFit;
  setupFriction: PracticalFriction;
  contextFriction?: PracticalFriction;
  adherenceRisk?: TrainingRoiRisk;
  preservesNextQualitySession?: boolean;
}

/**
 * Explanation result for a candidate that already passed safety/readiness
 * filtering. Candidate generation, safety filtering and ranking remain owned
 * by the existing Daily Trainability / Challenge Director flows.
 */
export interface TrainingRoiResult {
  candidateId: string;
  components: TrainingRoiComponents;
  reasonCodes: TrainingRoiReasonCode[];
  rationale: string[];
}

const TRAINING_ROI_REASON_ORDER = new Map<TrainingRoiReasonCode, number>(
  TRAINING_ROI_REASON_CODES.map((reason, index) => [reason, index] as const),
);

/**
 * Produces stable, duplicate-free reason ordering for deterministic fixtures,
 * UI copy mapping and regression tests. It does not rank training candidates.
 */
export function normalizeTrainingRoiReasonCodes(
  reasonCodes: readonly TrainingRoiReasonCode[],
): TrainingRoiReasonCode[] {
  return [...new Set(reasonCodes)].sort(
    (left, right) =>
      (TRAINING_ROI_REASON_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (TRAINING_ROI_REASON_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
}
