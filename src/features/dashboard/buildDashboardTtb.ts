import { AnalyticsService } from '@/services/analytics';
import type { IntervalsActivity, IntervalsWellness, TTBIndices } from '@/types';

/**
 * Builds the dashboard TTB snapshot from evidence available at this boundary.
 *
 * The dashboard does not currently have canonical Epic/PR strength evidence,
 * so strength intentionally remains unknown until that evidence is wired in.
 */
export function buildDashboardTtb(
  activities: IntervalsActivity[],
  wellness: IntervalsWellness | null
): TTBIndices {
  return AnalyticsService.calculateTTB([], activities, wellness ?? {});
}
