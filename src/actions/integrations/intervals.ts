'use server';

import {
  buildChatTrainingContext,
  type ChatTrainingContext,
} from '@/features/training-context/chatTrainingContext';
import { getErrorMessage } from '@/lib/error-message';
import { getActivities, getAthleteSettings, getEvents, getWellness } from '@/lib/intervals';
import prisma from '@/lib/prisma';
import type { IntervalsActivity, IntervalsEvent, IntervalsWellness } from '@/types';
import { createClient } from '@/utils/supabase/server';

async function getIntervalsCredentials() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { intervalsApiKey: true, intervalsAthleteId: true },
  });

  if (!dbUser?.intervalsApiKey || !dbUser?.intervalsAthleteId) {
    throw new Error('Intervals.icu not connected');
  }

  return {
    apiKey: dbUser.intervalsApiKey,
    athleteId: dbUser.intervalsAthleteId,
  };
}

export async function getChatTrainingContextAction(): Promise<ChatTrainingContext> {
  const asOf = new Date();

  try {
    const { apiKey, athleteId } = await getIntervalsCredentials();
    const endDate = asOf.toISOString().slice(0, 10);
    const wellnessStartDate = new Date(asOf.getTime() - 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const activityStartDate = new Date(asOf.getTime() - 72 * 3_600_000)
      .toISOString()
      .slice(0, 10);

    const [wellnessResult, activities] = await Promise.all([
      getWellness(wellnessStartDate, apiKey, athleteId, endDate),
      getActivities(activityStartDate, endDate, apiKey, athleteId),
    ]);

    const wellness = Array.isArray(wellnessResult)
      ? [...wellnessResult].sort((a, b) => b.date.localeCompare(a.date))[0]
      : (wellnessResult ?? undefined);

    return buildChatTrainingContext({ wellness, activities, asOf });
  } catch (error) {
    console.warn('Server Action Chat Training Context Error:', getErrorMessage(error));
    return buildChatTrainingContext({ wellness: undefined, activities: [], asOf });
  }
}

export async function getWellnessAction(date: string): Promise<IntervalsWellness> {
  try {
    const { apiKey, athleteId } = await getIntervalsCredentials();
    const data = await getWellness(date, apiKey, athleteId);

    if (!data || Array.isArray(data)) return {} as IntervalsWellness;

    // Map Lib type (WellnessData) to App type (IntervalsWellness).
    // Missing provider values stay missing so downstream consumers can handle uncertainty explicitly.
    return {
      id: data?.id,
      hrv: data?.hrv,
      restingHR: data?.restingHR,
      sleepScore: data?.sleepScore,
      sleepSecs: data?.sleepSecs,
      bodyBattery: data?.bodyBattery,
      vo2max: data?.vo2max,
      ctl: data?.ctl,
      atl: data?.atl,
      tsb: data?.tsb,
      ramp_rate: data?.rampRate,
    } as IntervalsWellness;
  } catch (error) {
    console.warn('Server Action Intervals Wellness Error:', getErrorMessage(error));
    return {} as IntervalsWellness;
  }
}

export async function getWellnessRangeAction(
  startDate: string,
  endDate: string
): Promise<IntervalsWellness[]> {
  try {
    const { apiKey, athleteId } = await getIntervalsCredentials();
    const data = await getWellness(startDate, apiKey, athleteId, endDate);

    if (!Array.isArray(data)) return [];

    return data.map(
      (d) =>
        ({
          id: d.id,
          hrv: d.hrv,
          restingHR: d.restingHR,
          sleepScore: d.sleepScore,
          sleepSecs: d.sleepSecs,
          bodyBattery: d.bodyBattery,
          vo2max: d.vo2max,
          ctl: d.ctl,
          atl: d.atl,
          tsb: d.tsb,
          ramp_rate: d.rampRate,
        }) as IntervalsWellness
    );
  } catch (error) {
    console.error('Server Action Intervals Wellness Range Error:', getErrorMessage(error));
    return [];
  }
}

export async function getActivitiesAction(
  startDate: string,
  endDate: string
): Promise<IntervalsActivity[]> {
  try {
    const { apiKey, athleteId } = await getIntervalsCredentials();
    const data = await getActivities(startDate, endDate, apiKey, athleteId);
    return data as unknown as IntervalsActivity[];
  } catch (error) {
    console.error('Server Action Intervals Activities Error:', getErrorMessage(error));
    return [];
  }
}

export async function getEventsAction(
  startDate: string,
  endDate: string
): Promise<IntervalsEvent[]> {
  try {
    const { apiKey, athleteId } = await getIntervalsCredentials();
    const data = await getEvents(startDate, endDate, apiKey, athleteId);
    return data as unknown as IntervalsEvent[];
  } catch {
    return [];
  }
}

export async function getAthleteSettingsAction() {
  try {
    const { apiKey, athleteId } = await getIntervalsCredentials();
    const data = await getAthleteSettings(apiKey, athleteId);
    return data;
  } catch (error) {
    console.error('Server Action Intervals Settings Error:', getErrorMessage(error));
    return null;
  }
}
