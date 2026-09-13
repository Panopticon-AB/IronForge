import type { IntervalsActivity, WellnessData } from '@/lib/intervals';

export type ChatTrainingContextFreshness = 'FRESH' | 'STALE' | 'UNKNOWN';

export interface ChatTrainingContextWellness {
  bodyBattery?: number;
  sleepScore?: number;
  sleepSeconds?: number;
  hrv?: number;
  restingHr?: number;
  fitnessCtl?: number;
  fatigueAtl?: number;
  formTsb?: number;
  rampRate?: number;
  stress?: number;
  fatigue?: number;
  soreness?: number;
}

export interface ChatTrainingContextActivity {
  id?: string;
  type?: string;
  startedAt: string;
  durationSeconds: number;
  trainingLoad?: number;
  intensity?: number;
  averageHr?: number;
  averageWatts?: number;
}

export interface ChatTrainingContext {
  asOf: string;
  source: 'INTERVALS_ICU';
  wellness: ChatTrainingContextWellness;
  recentActivities: ChatTrainingContextActivity[];
  freshness: ChatTrainingContextFreshness;
  missingSignals: string[];
}

export interface BuildChatTrainingContextInput {
  wellness?: WellnessData | null;
  activities?: IntervalsActivity[];
  asOf?: Date;
  activityWindowHours?: number;
}

const DEFAULT_ACTIVITY_WINDOW_HOURS = 72;
const FRESH_WELLNESS_MAX_AGE_HOURS = 36;
const MAX_RECENT_ACTIVITIES = 12;

const CORE_WELLNESS_SIGNALS: Array<keyof ChatTrainingContextWellness> = [
  'bodyBattery',
  'sleepScore',
  'sleepSeconds',
  'hrv',
  'restingHr',
  'fitnessCtl',
  'fatigueAtl',
  'formTsb',
  'rampRate',
  'stress',
  'fatigue',
  'soreness',
];

function numberOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseWellnessDate(date: string | undefined): Date | null {
  if (!date) return null;

  // Intervals wellness dates are normally date-only. Noon UTC avoids accidental
  // stale classification around midnight while keeping freshness deterministic.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00Z` : date;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getFreshness(
  wellness: WellnessData | null | undefined,
  asOf: Date
): ChatTrainingContextFreshness {
  const wellnessDate = parseWellnessDate(wellness?.date);
  if (!wellnessDate) return 'UNKNOWN';

  const ageHours = (asOf.getTime() - wellnessDate.getTime()) / 3_600_000;
  return ageHours <= FRESH_WELLNESS_MAX_AGE_HOURS ? 'FRESH' : 'STALE';
}

function summarizeWellness(wellness: WellnessData | null | undefined): ChatTrainingContextWellness {
  if (!wellness) return {};

  return {
    // `WellnessData.bodyBattery` is now the honest normalized Intervals readiness
    // value. Missing provider readiness remains undefined; measured zero is valid.
    bodyBattery: numberOrUndefined(wellness.bodyBattery),
    sleepScore: numberOrUndefined(wellness.sleepScore),
    sleepSeconds: numberOrUndefined(wellness.sleepSecs),
    hrv: numberOrUndefined(wellness.hrv),
    restingHr: numberOrUndefined(wellness.restingHR),
    fitnessCtl: numberOrUndefined(wellness.ctl),
    fatigueAtl: numberOrUndefined(wellness.atl),
    formTsb: numberOrUndefined(wellness.tsb),
    rampRate: numberOrUndefined(wellness.rampRate),
    stress: numberOrUndefined(wellness.stress),
    fatigue: numberOrUndefined(wellness.fatigue),
    soreness: numberOrUndefined(wellness.soreness),
  };
}

function summarizeActivities(
  activities: IntervalsActivity[],
  asOf: Date,
  activityWindowHours: number
): ChatTrainingContextActivity[] {
  const oldestAllowed = asOf.getTime() - activityWindowHours * 3_600_000;
  const newestAllowed = asOf.getTime();

  return activities
    .map((activity) => ({ activity, startedAtMs: new Date(activity.start_date_local).getTime() }))
    .filter(
      ({ startedAtMs }) =>
        Number.isFinite(startedAtMs) && startedAtMs >= oldestAllowed && startedAtMs <= newestAllowed
    )
    .sort((a, b) => b.startedAtMs - a.startedAtMs)
    .slice(0, MAX_RECENT_ACTIVITIES)
    .map(({ activity }) => ({
      id: activity.id,
      type: activity.type,
      startedAt: activity.start_date_local,
      durationSeconds: activity.moving_time,
      trainingLoad: numberOrUndefined(activity.icu_training_load),
      intensity: numberOrUndefined(activity.icu_intensity),
      averageHr: numberOrUndefined(activity.average_heartrate),
      averageWatts: numberOrUndefined(activity.average_watts),
    }));
}

export function buildChatTrainingContext({
  wellness,
  activities = [],
  asOf = new Date(),
  activityWindowHours = DEFAULT_ACTIVITY_WINDOW_HOURS,
}: BuildChatTrainingContextInput): ChatTrainingContext {
  const wellnessSummary = summarizeWellness(wellness);

  return {
    asOf: asOf.toISOString(),
    source: 'INTERVALS_ICU',
    wellness: wellnessSummary,
    recentActivities: summarizeActivities(activities, asOf, activityWindowHours),
    freshness: getFreshness(wellness, asOf),
    missingSignals: CORE_WELLNESS_SIGNALS.filter((signal) => wellnessSummary[signal] === undefined),
  };
}
