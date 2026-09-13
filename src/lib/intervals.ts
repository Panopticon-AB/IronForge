import { z } from 'zod';

const BASE_URL = 'https://intervals.icu/api/v1';

// --- ZOD SCHEMAS ---

const WellnessDataSchema = z
  .object({
    id: z.string().optional(),
    date: z.string(),
    // Core
    hrv: z.number().optional().nullable(),
    restingHR: z.number().optional().nullable(),
    readiness: z.number().optional().nullable(), // Body Battery
    sleepScore: z.number().optional().nullable(),
    sleepSecs: z.number().optional().nullable(),
    ctl: z.number().optional().nullable(),
    atl: z.number().optional().nullable(),
    tsb: z.number().optional().nullable(),
    rampRate: z.number().optional().nullable(),
    vo2max: z.number().optional().nullable(),

    // Phase 2: Maximum Data Utilization
    // Recovery
    avgSleepingHR: z.number().optional().nullable(),
    sleepQuality: z.number().optional().nullable(), // 0-100
    hydration: z.number().optional().nullable(), // 0-100

    // Stress & Mood
    hrvSDNN: z.number().optional().nullable(),
    baevskySI: z.number().optional().nullable(), // Stress index
    stress: z.number().optional().nullable(), // Subjective life stress 1-10
    mood: z.number().optional().nullable(), // -5 to +5
    fatigue: z.number().optional().nullable(), // 0-100

    // Cycle Sync
    menstrualPhase: z.string().optional().nullable(), // FOLLICULAR, LUTEAL, etc.
    menstrualPhasePredicted: z.boolean().optional().nullable(),

    // Health
    weight: z.number().optional().nullable(), // kg
    spO2: z.number().optional().nullable(), // % (pulse ox)
    respiration: z.number().optional().nullable(), // breaths/min
    bloodGlucose: z.number().optional().nullable(), // mg/dL

    // Safety (Hard locks)
    injury: z.string().optional().nullable(), // Free text injury note
    soreness: z.number().optional().nullable(), // 1-10 subjective

    // Steps (active recovery indicator)
    steps: z.number().optional().nullable(),

    // Allow snake_case input keys
    resting_hr: z.number().optional().nullable(),
    sleep_score: z.number().optional().nullable(),
    sleep_secs: z.number().optional().nullable(),
    ramp_rate: z.number().optional().nullable(),
    avg_sleeping_hr: z.number().optional().nullable(),
    sleep_quality: z.number().optional().nullable(),
    hrv_sdnn: z.number().optional().nullable(),
    baevsky_si: z.number().optional().nullable(),
    menstrual_phase: z.string().optional().nullable(),
    menstrual_phase_predicted: z.boolean().optional().nullable(),
    blood_glucose: z.number().optional().nullable(),
    sp_o2: z.number().optional().nullable(),
  })
  .transform((data) => ({
    id: data.id,
    date: data.date,
    hrv: data.hrv,
    restingHR: data.restingHR || data.resting_hr,
    readiness: data.readiness, // Export readiness so it's available in mapped types
    bodyBattery: data.readiness,
    sleepScore: data.sleepScore || data.sleep_score,
    sleepSecs: data.sleepSecs || data.sleep_secs,
    ctl: data.ctl,
    atl: data.atl,
    tsb: data.tsb,
    rampRate: data.rampRate || data.ramp_rate,
    vo2max: data.vo2max,
    // Phase 2 fields
    avgSleepingHR: data.avgSleepingHR || data.avg_sleeping_hr,
    sleepQuality: data.sleepQuality || data.sleep_quality,
    hydration: data.hydration,
    hrvSDNN: data.hrvSDNN || data.hrv_sdnn,
    baevskySI: data.baevskySI || data.baevsky_si,
    stress: data.stress,
    mood: data.mood,
    fatigue: data.fatigue,
    menstrualPhase: data.menstrualPhase || data.menstrual_phase,
    menstrualPhasePredicted: data.menstrualPhasePredicted || data.menstrual_phase_predicted,
    weight: data.weight,
    spO2: data.spO2 || data.sp_o2,
    respiration: data.respiration,
    bloodGlucose: data.bloodGlucose || data.blood_glucose,
    injury: data.injury,
    soreness: data.soreness,
    steps: data.steps,
  }));

export type WellnessData = z.infer<typeof WellnessDataSchema>;

const AthleteSettingsSchema = z.object({
  id: z.string(),
  name: z.string(),
  timezone: z.string(),
  resting_hr: z.number().optional().nullable(),
  max_hr: z.number().optional().nullable(),
  lthr: z.number().optional().nullable(),
  ftp: z.number().optional().nullable(),
  run_ftp: z.number().optional().nullable(),
  heart_rate_zones: z.array(z.unknown()).optional().nullable(),
  power_zones: z.array(z.unknown()).optional().nullable(),
});

export type AthleteSettings = z.infer<typeof AthleteSettingsSchema>;

// --- API CLIENT ---

import { MOCK_ACTIVITIES, MOCK_EVENTS, MOCK_WELLNESS } from './mock-data';

/**
 * Standard fetch wrapper for Intervals.icu
 * Throws standard Error objects on failure.
 * Returns null ONLY on 404 (Not Found).
 */
async function fetchIntervals<T>(
  endpoint: string,
  apiKey: string,
  schema?: z.ZodType<any>
): Promise<T | null> {
  // E2E Mock Bypass: Prevent external fetch during CI if mock key is used
  if (apiKey === 'mock-e2e-api-key') {
    console.log(`[Intervals-Mock] Intercepting ${endpoint}`);

    // Return appropriate mock data based on endpoint
    if (endpoint.includes('/wellness')) {
      // Return array if range, single object otherwise
      if (endpoint.includes('oldest=')) {
        return [MOCK_WELLNESS] as unknown as T;
      }
      return MOCK_WELLNESS as unknown as T;
    }
    if (endpoint.includes('/activities')) {
      return MOCK_ACTIVITIES as unknown as T;
    }
    if (endpoint.includes('/events')) {
      return MOCK_EVENTS as unknown as T;
    }
    if (endpoint.includes('/athlete')) {
      return {
        id: 'i123456',
        name: 'Mock Titan',
        timezone: 'UTC',
        resting_hr: 48,
        max_hr: 190,
        ftp: 300,
      } as unknown as T;
    }
  }

  if (!apiKey) {
    throw new Error('Intervals API Key is missing');
  }

  const authHeader = `Basic ${btoa(`API_KEY:${apiKey}`)}`;

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        Authorization: authHeader,
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Intervals API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (schema) {
      // Validate array responses if schema is array
      if (Array.isArray(data) && schema instanceof z.ZodArray) {
        const parsed = schema.safeParse(data);
        if (!parsed.success) {
          console.warn('Intervals Parsing Warning (Array):', parsed.error);
          // We might choose to return partial data or throw. For now, throw to detect drifts.
          throw new Error(`Intervals Data Validation Failed: ${parsed.error.message}`);
        }
        return parsed.data as T;
      }

      // Single object validation
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        console.warn('Intervals Parsing Warning:', parsed.error);
        throw new Error(`Intervals Data Validation Failed: ${parsed.error.message}`);
      }
      return parsed.data;
    }

    return data as T;
  } catch (error: unknown) {
    // Enhance error message with endpoint context
    throw new Error(
      `FetchIntervals Failed [${endpoint}]: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// --- EXPORTED METHODS ---

export async function getWellness(
  date: string,
  apiKey: string,
  athleteId: string,
  endDate?: string
): Promise<WellnessData | WellnessData[] | null> {
  if (endDate) {
    // Range Query - returns array
    return await fetchIntervals<WellnessData[]>(
      `/athlete/${athleteId}/wellness?oldest=${date}&newest=${endDate}`,
      apiKey,
      z.array(WellnessDataSchema)
    );
  }
  // Single Day
  return await fetchIntervals<WellnessData>(
    `/athlete/${athleteId}/wellness/${date}`,
    apiKey,
    WellnessDataSchema
  );
}

export async function getAthleteSettings(
  apiKey: string,
  athleteId: string
): Promise<AthleteSettings | null> {
  return await fetchIntervals(`/athlete/${athleteId}`, apiKey, AthleteSettingsSchema);
}

const IntervalsActivitySchema = z.object({
  id: z.string().optional(),
  icu_intensity: z.number().optional().nullable(),
  icu_training_load: z.number().optional().nullable(),
  type: z.string().optional(),
  start_date_local: z.string(),
  moving_time: z.number(),
  distance: z.number().optional(), // Often useful
  zone_times: z.array(z.number()).optional(),
  average_heartrate: z.number().optional().nullable(),
  average_watts: z.number().optional().nullable(),
});

export type IntervalsActivity = z.infer<typeof IntervalsActivitySchema>;

const IntervalsEventSchema = z.object({
  id: z.number(), // API returns number for events
  start_date_local: z.string(),
  name: z.string(),
  description: z.string().optional().nullable(),
  category: z.enum(['RACE', 'WORKOUT', 'NOTE']).or(z.string()), // Flexible enum
  type: z.string().optional().nullable(),
});

export type IntervalsEvent = z.infer<typeof IntervalsEventSchema>;

export async function getActivities(
  startDate: string,
  endDate: string,
  apiKey: string,
  athleteId: string
): Promise<IntervalsActivity[]> {
  return (
    (await fetchIntervals(
      `/athlete/${athleteId}/activities?oldest=${startDate}&newest=${endDate}`,
      apiKey,
      z.array(IntervalsActivitySchema)
    )) || []
  );
}

export async function getEvents(
  startDate: string,
  endDate: string,
  apiKey: string,
  athleteId: string
): Promise<IntervalsEvent[]> {
  return (
    (await fetchIntervals(
      `/athlete/${athleteId}/events?oldest=${startDate}&newest=${endDate}`,
      apiKey,
      z.array(IntervalsEventSchema)
    )) || []
  );
}

/**
 * Fetch GPS stream for an activity
 */
export async function getActivityStream(
  activityId: string,
  apiKey: string
): Promise<Array<{ lat: number; lng: number }> | null> {
  // We don't use strict schema here yet due to complex stream structure
  const data = await fetchIntervals<{ type: string; data: [number, number][] }[]>(
    `/activity/${activityId}/streams?types=latlng`,
    apiKey
  );

  if (!data) return null;

  const latlngStream = data.find((s) => s.type === 'latlng');
  if (!latlngStream || !latlngStream.data) return null;

  return latlngStream.data.map((point: [number, number]) => ({
    lat: point[0],
    lng: point[1],
  }));
}
