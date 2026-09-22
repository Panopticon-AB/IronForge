import type { ChatTrainingContext } from '@/features/training-context/chatTrainingContext';
import type {
  BodyRegionState,
  ImpactEccentricContext,
  LifeLoadContext,
  SystemicTrainingContext,
  WholeBodyConfidence,
  WholeBodyFreshness,
  WholeBodyTrainingState,
} from './wholeBodyTrainingState';

const MAX_LOCAL_REGIONS = 16;
const MAX_CONTRIBUTORS_PER_REGION = 5;
const MAX_REASONS_PER_REGION = 5;

export type WholeBodyTrainingContext = Omit<WholeBodyTrainingState, 'contributors'>;

export interface BuildWholeBodyTrainingContextInput {
  localState: Pick<
    WholeBodyTrainingState,
    'localRegions' | 'impactEccentric' | 'lifeLoad' | 'confidence'
  >;
  trainingContext?: ChatTrainingContext | null;
  asOf?: string;
}

function toSystemicContext(trainingContext: ChatTrainingContext | null | undefined): SystemicTrainingContext {
  if (!trainingContext) return {};

  const { wellness } = trainingContext;

  return {
    fitnessCtl: wellness.fitnessCtl,
    fatigueAtl: wellness.fatigueAtl,
    formTsb: wellness.formTsb,
    rampRate: wellness.rampRate,
    sleepScore: wellness.sleepScore,
    sleepSeconds: wellness.sleepSeconds,
    hrv: wellness.hrv,
    restingHr: wellness.restingHr,
    bodyBattery: wellness.bodyBattery,
  };
}

function boundRegion(region: BodyRegionState): BodyRegionState {
  return {
    ...region,
    contributors: region.contributors.slice(0, MAX_CONTRIBUTORS_PER_REGION),
    reasons: region.reasons.slice(0, MAX_REASONS_PER_REGION),
  };
}

function boundImpactContext(
  impact: ImpactEccentricContext | undefined
): ImpactEccentricContext | undefined {
  if (!impact) return undefined;

  return {
    ...impact,
    contributors: impact.contributors.slice(0, MAX_CONTRIBUTORS_PER_REGION),
    reasons: impact.reasons.slice(0, MAX_REASONS_PER_REGION),
  };
}

function deriveFreshness(trainingContext: ChatTrainingContext | null | undefined): WholeBodyFreshness {
  return trainingContext?.freshness ?? 'UNKNOWN';
}

function deriveConfidence(
  localConfidence: WholeBodyConfidence,
  trainingContext: ChatTrainingContext | null | undefined
): WholeBodyConfidence {
  if (!trainingContext || trainingContext.freshness === 'UNKNOWN') return 'LOW';
  if (trainingContext.freshness === 'STALE' && localConfidence === 'HIGH') return 'MEDIUM';
  return localConfidence;
}

function deriveMissingSignals(trainingContext: ChatTrainingContext | null | undefined): string[] {
  if (!trainingContext) return ['intervals_training_context'];
  return [...trainingContext.missingSignals];
}

/**
 * Builds the small read model intended for Oracle/conversational clients.
 * Raw provider payloads and unbounded historical evidence deliberately stay out.
 */
export function buildWholeBodyTrainingContext({
  localState,
  trainingContext,
  asOf,
}: BuildWholeBodyTrainingContextInput): WholeBodyTrainingContext {
  return {
    asOf: asOf ?? trainingContext?.asOf ?? new Date().toISOString(),
    localRegions: localState.localRegions.slice(0, MAX_LOCAL_REGIONS).map(boundRegion),
    systemic: toSystemicContext(trainingContext),
    impactEccentric: boundImpactContext(localState.impactEccentric),
    lifeLoad: localState.lifeLoad as LifeLoadContext | undefined,
    confidence: deriveConfidence(localState.confidence, trainingContext),
    freshness: deriveFreshness(trainingContext),
    missingSignals: deriveMissingSignals(trainingContext),
  };
}
