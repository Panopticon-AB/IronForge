import type { CardioLog } from '@/types/prisma';
import type { StravaActivity } from '@/types/schemas';

export type { StravaActivity, StravaTokenResponse, StravaUploadResponse } from '@/types/schemas';

/**
 * Maps a Strava activity to the IronForge CardioLog format.
 * Note: Does not create the record, just maps the data.
 */
export function mapStravaActivityToCardioLog(
  activity: StravaActivity,
  userId: string
): Omit<CardioLog, 'id'> {
  // Simple Load Calculation (TSS approximation) if suffer_score is missing
  // TSS = (sec x IntensityFactor x IntensityFactor) / (36 x 100)
  // This is a rough fallback.
  let load = activity.suffer_score || 0;

  if (!load) {
    // Very rough estimate based on duration if no HR data
    // 1 hour moderate = ~50 TSS
    load = (activity.moving_time / 3600) * 50;
  }

  return {
    userId,
    date: new Date(activity.start_date),
    intervalsId: `strava_${activity.id}`, // specific prefix to avoid collision
    type: activity.type,
    duration: activity.moving_time,
    load: load,
    averageHr: activity.average_heartrate || null,
  };
}
