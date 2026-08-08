export type TrainingModality =
  | 'STRENGTH'
  | 'CYCLING'
  | 'RUNNING'
  | 'SWIMMING'
  | 'WALKING'
  | 'MOBILITY'
  | 'RECOVERY';

export type LoadLevel = 'NONE' | 'LOW' | 'MODERATE' | 'HIGH';

export type RecoveryCost = 'VERY_LOW' | 'LOW' | 'MODERATE' | 'HIGH';

export type SubjectiveUtility = 'LOW' | 'MODERATE' | 'HIGH';

export type PracticalFriction = 'VERY_LOW' | 'LOW' | 'MODERATE' | 'HIGH';

/**
 * Coarse, explainable load dimensions used to compare training candidates.
 * Keep these dimensions separate: Daily Trainability must not hide materially
 * different recovery costs behind one opaque readiness score.
 */
export interface TrainingLoadVector {
  localMuscular: LoadLevel;
  systemicCardiorespiratory: LoadLevel;
  impactEccentric: LoadLevel;
  coordinationTechnical: LoadLevel;
}

/**
 * Describes a muscle/tissue contribution without attempting biomechanical
 * precision. `region` intentionally stays a string so the cross-activity
 * recovery model (#537) can own the canonical region taxonomy.
 */
export interface TargetContribution {
  region: string;
  load: LoadLevel;
}

export type ReadinessGateKind =
  | 'STRENGTH_WARMUP'
  | 'CYCLING_WARMUP'
  | 'RUNNING_WARMUP'
  | 'SWIMMING_WARMUP';

export interface ReadinessGateRequirement {
  required: boolean;
  kind?: ReadinessGateKind;
}

/**
 * A finite activity option that Oracle may evaluate for today's mission.
 *
 * This is deliberately not a recovery model or a DailyMission replacement.
 * Recovery state comes from #537; later slices filter/rank candidates and map
 * them into the existing Minimum / Standard / Boss mission semantics.
 */
export interface TrainingCandidate {
  id: string;
  label: string;
  modality: TrainingModality;
  targets: TargetContribution[];
  load: TrainingLoadVector;
  recoveryCost: RecoveryCost;
  friction: PracticalFriction;
  subjectiveUtilityHint?: SubjectiveUtility;
  readinessGate: ReadinessGateRequirement;
}
