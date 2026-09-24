import type { IntervalsActivity } from '@/lib/intervals';
import type {
  WholeBodyConfidence,
  WholeBodyLoad,
  WholeBodyLoadDimension,
} from './wholeBodyTrainingState';

export interface LocalLoadContribution {
  regionId: string;
  magnitude: WholeBodyLoad;
  dimension: WholeBodyLoadDimension;
  sourceActivityId: string;
  reasons: string[];
  confidence: WholeBodyConfidence;
}

type ActivityInput = Pick<
  IntervalsActivity,
  'id' | 'type' | 'start_date_local' | 'moving_time' | 'icu_intensity' | 'icu_training_load'
>;

const MAGNITUDE_ORDER: WholeBodyLoad[] = ['VERY_LOW', 'LOW', 'MODERATE', 'HIGH'];

function sourceActivityId(activity: ActivityInput): string {
  return activity.id ?? `intervals:${activity.start_date_local}`;
}

function increaseMagnitude(value: WholeBodyLoad): WholeBodyLoad {
  const index = MAGNITUDE_ORDER.indexOf(value);
  return MAGNITUDE_ORDER[Math.min(index + 1, MAGNITUDE_ORDER.length - 1)] ?? value;
}

function lowerMagnitude(value: WholeBodyLoad): WholeBodyLoad {
  const index = MAGNITUDE_ORDER.indexOf(value);
  return MAGNITUDE_ORDER[Math.max(index - 1, 0)] ?? value;
}

function classifyEnduranceMagnitude(activity: ActivityInput): {
  magnitude: WholeBodyLoad;
  confidence: WholeBodyConfidence;
  reasons: string[];
} {
  const durationMinutes = Math.max(0, activity.moving_time) / 60;
  const intensity = activity.icu_intensity;
  const reasons = [`${Math.round(durationMinutes)} min duration`];

  let magnitude: WholeBodyLoad = 'LOW';
  let confidence: WholeBodyConfidence = 'MEDIUM';

  if (typeof intensity === 'number' && Number.isFinite(intensity)) {
    confidence = 'HIGH';
    reasons.push(`Intervals intensity ${Math.round(intensity)}`);

    if (intensity >= 85) magnitude = 'HIGH';
    else if (intensity >= 70) magnitude = 'MODERATE';
    else magnitude = 'LOW';
  } else {
    reasons.push('intensity unavailable; duration-only fallback');
  }

  if (durationMinutes >= 90 && magnitude !== 'HIGH') {
    magnitude = increaseMagnitude(magnitude);
    reasons.push('long-duration modifier');
  }

  if (durationMinutes >= 150) {
    magnitude = 'HIGH';
    reasons.push('very-long-duration modifier');
  }

  return { magnitude, confidence, reasons };
}

function cyclingContributions(activity: ActivityInput): LocalLoadContribution[] {
  const classified = classifyEnduranceMagnitude(activity);
  const sourceId = sourceActivityId(activity);

  return [
    {
      regionId: 'quadriceps',
      magnitude: classified.magnitude,
      dimension: 'MUSCULAR',
      sourceActivityId: sourceId,
      reasons: ['cycling activity', ...classified.reasons],
      confidence: classified.confidence,
    },
    {
      regionId: 'glutes',
      magnitude: classified.magnitude,
      dimension: 'MUSCULAR',
      sourceActivityId: sourceId,
      reasons: ['cycling activity', ...classified.reasons],
      confidence: classified.confidence,
    },
    {
      regionId: 'calves',
      magnitude: lowerMagnitude(classified.magnitude),
      dimension: 'MUSCULAR',
      sourceActivityId: sourceId,
      reasons: ['cycling activity', 'lower expected contribution than quads/glutes', ...classified.reasons],
      confidence: classified.confidence,
    },
  ];
}

function runningContributions(activity: ActivityInput): LocalLoadContribution[] {
  const classified = classifyEnduranceMagnitude(activity);
  const sourceId = sourceActivityId(activity);
  const durationMinutes = Math.max(0, activity.moving_time) / 60;
  const intensity = activity.icu_intensity;
  const impactMagnitude: WholeBodyLoad =
    (typeof intensity === 'number' && intensity >= 85) || durationMinutes >= 75
      ? 'HIGH'
      : durationMinutes <= 35 && (typeof intensity !== 'number' || intensity < 70)
        ? 'LOW'
        : 'MODERATE';

  const localRegions = ['quadriceps', 'hamstrings', 'glutes', 'calves'];
  const local = localRegions.map<LocalLoadContribution>((regionId) => ({
    regionId,
    magnitude: classified.magnitude,
    dimension: 'MUSCULAR',
    sourceActivityId: sourceId,
    reasons: ['running activity', ...classified.reasons],
    confidence: classified.confidence,
  }));

  return [
    ...local,
    {
      regionId: 'lower-body-impact',
      magnitude: impactMagnitude,
      dimension: 'IMPACT_ECCENTRIC',
      sourceActivityId: sourceId,
      reasons: ['running impact/eccentric cost', ...classified.reasons],
      confidence: classified.confidence,
    },
  ];
}

/**
 * Maps Intervals endurance evidence into deliberately coarse local contributions.
 * Intervals remains authoritative for endurance/systemic load; this adapter only
 * adds the body-location dimension needed by IronForge cross-activity logic.
 */
export function mapIntervalsActivityToLocalLoad(
  activity: ActivityInput
): LocalLoadContribution[] {
  const normalizedType = activity.type?.toLowerCase() ?? '';

  if (normalizedType.includes('ride') || normalizedType.includes('cycling')) {
    return cyclingContributions(activity);
  }

  if (normalizedType.includes('run')) {
    return runningContributions(activity);
  }

  return [];
}
