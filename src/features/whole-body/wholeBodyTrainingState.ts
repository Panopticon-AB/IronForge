export type WholeBodyLoad = 'VERY_LOW' | 'LOW' | 'MODERATE' | 'HIGH';
export type WholeBodyReadiness = 'GREEN' | 'AMBER' | 'RED' | 'UNKNOWN';
export type WholeBodyConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type WholeBodyFreshness = 'FRESH' | 'STALE' | 'UNKNOWN';

export type WholeBodyEvidenceSource =
  | 'IRONFORGE_STRENGTH'
  | 'HEVY_STRENGTH'
  | 'INTERVALS_ACTIVITY'
  | 'INTERVALS_WELLNESS'
  | 'MANUAL_CONTEXT';

export type WholeBodyLoadDimension = 'MUSCULAR' | 'IMPACT_ECCENTRIC';

export interface WholeBodyContributorRef {
  source: WholeBodyEvidenceSource;
  sourceId?: string;
  startedAt?: string;
  dimension?: WholeBodyLoadDimension;
  magnitude?: WholeBodyLoad;
  reasons: string[];
}

export interface WholeBodyRecoveryWindow {
  earliest?: string;
  latest?: string;
}

export interface BodyRegionState {
  regionId: string;
  load: WholeBodyLoad;
  readiness: WholeBodyReadiness;
  estimatedRecoveryWindow?: WholeBodyRecoveryWindow;
  confidence: WholeBodyConfidence;
  contributors: WholeBodyContributorRef[];
  reasons: string[];
}

export interface SystemicTrainingContext {
  fitnessCtl?: number;
  fatigueAtl?: number;
  formTsb?: number;
  rampRate?: number;
  sleepScore?: number;
  sleepSeconds?: number;
  hrv?: number;
  restingHr?: number;
  bodyBattery?: number;
  subjectiveEnergy?: 'LOW' | 'NORMAL' | 'HIGH';
  subjectiveStress?: 'LOW' | 'NORMAL' | 'HIGH';
}

export interface ImpactEccentricContext {
  state: 'LOW' | 'MODERATE' | 'HIGH' | 'UNKNOWN';
  confidence: WholeBodyConfidence;
  contributors: WholeBodyContributorRef[];
  reasons: string[];
}

export interface LifeLoadContext {
  energy?: 'LOW' | 'NORMAL' | 'HIGH';
  stress?: 'LOW' | 'NORMAL' | 'HIGH';
  timeAvailableMinutes?: number;
  reasons: string[];
}

/**
 * Provider-neutral evidence model for whole-body training decisions.
 *
 * Deliberately decomposes local muscular load, systemic/endurance context,
 * impact/eccentric cost and life load instead of creating a second opaque
 * Intervals-style readiness or training-load score.
 */
export interface WholeBodyTrainingState {
  asOf: string;
  localRegions: BodyRegionState[];
  systemic: SystemicTrainingContext;
  impactEccentric?: ImpactEccentricContext;
  lifeLoad?: LifeLoadContext;
  confidence: WholeBodyConfidence;
  freshness: WholeBodyFreshness;
  contributors: WholeBodyContributorRef[];
  missingSignals: string[];
}
