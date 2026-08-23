'use server';

import { z } from 'zod';

import { processUserCardioActivity } from '@/actions/pvp/duel';
import prisma from '@/lib/prisma';
import { mapStravaActivityToCardioLog } from '@/lib/strava';
import { TerritoryService } from '@/services/game/TerritoryService';
import {
  StravaActivitySchema,
  StravaTokenResponseSchema,
  StravaUploadResponseSchema,
} from '@/types/schemas';
/**
 * Strava Integration Server Actions
 *
 * Handles the OAuth2 flow, token management (exchange & refresh),
 * and data synchronization between Strava and IronForge.
 *
 * @module actions/strava
 */
import { createClient } from '@/utils/supabase/server';
import axios from 'axios';
import { revalidatePath } from 'next/cache';

// Constants removed for lazy evaluation
// const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
// const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

/**
 * Generates the Strava OAuth2 authorization URL.
 *
 * dynamically determines the redirect URI based on the host header,
 * enabling support for both local development and production environments.
 *
 * @returns {Promise<string>} The full authorization URL.
 * @throws {Error} If STRAVA_CLIENT_ID is missing from environment variables.
 */
export async function getStravaAuthUrlAction() {
  const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
  if (!STRAVA_CLIENT_ID) throw new Error('Missing STRAVA_CLIENT_ID');

  const scope = 'read,activity:read_all,activity:write';
  // Dynamically determining host might be unreliable in server actions without headers(),
  // but we can try.
  const { headers } = await import('next/headers');
  const headersList = await headers();
  const host = headersList.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/settings`;

  const url = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&approval_prompt=force&scope=${scope}`;
  return url;
}

/**
 * Exchanges a Strava authorization code for an access token.
 *
 * Persists the access token, refresh token, and expiration time to the user's profile.
 *
 * @param {string} code - The authorization code returned from Strava.
 * @returns {Promise<{success: boolean, error?: string}>} Success status or error message.
 */
export async function exchangeStravaTokenAction(code: string) {
  const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
  const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    return {
      success: false,
      error: 'Strava credentials not configured on server',
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Unauthorized' };

  try {
    const response = await axios.post('https://www.strava.com/oauth/token', {
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    });

    const { access_token, refresh_token, expires_at, athlete } = StravaTokenResponseSchema.parse(
      response.data
    );

    await prisma.user.update({
      where: { id: user.id },
      data: {
        stravaAccessToken: access_token,
        stravaRefreshToken: refresh_token,
        stravaExpiresAt: expires_at,
        stravaAthleteId: athlete.id.toString(),
      },
    });

    revalidatePath('/settings');
    return { success: true };
  } catch (error: unknown) {
    let message = 'Unknown error';
    if (axios.isAxiosError(error)) {
      message = error.response?.data?.message || error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    console.error('Strava Token Exchange Error:', message);
    return { success: false, error: `Failed to exchange token: ${message}` };
  }
}

export async function disconnectStravaAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Unauthorized' };

  try {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });

    if (dbUser?.stravaAccessToken) {
      // Optional: Revoke token
      try {
        await axios.post('https://www.strava.com/oauth/deauthorize', {
          access_token: dbUser.stravaAccessToken,
        });
      } catch {
        // Ignore deauth failure
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        stravaAccessToken: null,
        stravaRefreshToken: null,
        stravaExpiresAt: null,
        stravaAthleteId: null,
      },
    });

    revalidatePath('/settings');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

async function getValidAccessToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.stravaAccessToken) return null;

  const now = Math.floor(Date.now() / 1000);

  // If expired or expiring soon (within 5 mins), refresh
  if (user.stravaExpiresAt && user.stravaExpiresAt < now + 300) {
    if (!user.stravaRefreshToken) return null;

    try {
      const response = await axios.post('https://www.strava.com/oauth/token', {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: user.stravaRefreshToken,
      });

      const { access_token, refresh_token, expires_at } = StravaTokenResponseSchema.parse(
        response.data
      );

      await prisma.user.update({
        where: { id: userId },
        data: {
          stravaAccessToken: access_token,
          stravaRefreshToken: refresh_token,
          stravaExpiresAt: expires_at,
        },
      });

      return access_token;
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : 'Unknown error';
      console.error('RefreshToken Error:', message);
      return null;
    }
  }

  return user.stravaAccessToken;
}

/**
 * Syncs recent activities from Strava to IronForge.
 *
 * Fetches the last 30 activities. Checks for duplicates using `intervalsId` (prefixed with 'strava_').
 * Creates new `CardioLog` entries for new activities and awards rewards (XP, Gold, Kinetic Energy).
 *
 * @returns {Promise<{success: boolean, count?: number, error?: string}>} Sync result and count of new activities.
 */
export async function syncStravaActivitiesAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Unauthorized' };

  const token = await getValidAccessToken(user.id);
  if (!token) return { success: false, error: 'Strava not connected or token invalid' };

  try {
    // Fetch last 30 activities
    const response = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
      headers: { Authorization: `Bearer ${token}` },
      params: { per_page: 30 },
    });

    const activities = z.array(StravaActivitySchema).parse(response.data);
    let syncedCount = 0;

    for (const activity of activities) {
      // Check if exists
      const existing = await prisma.cardioLog.findUnique({
        where: { intervalsId: `strava_${activity.id}` }, // Reusing this field for external ID
      });

      if (!existing) {
        const logData = mapStravaActivityToCardioLog(activity, user.id);

        // Create Log
        await prisma.cardioLog.create({
          data: logData,
        });

        // Trigger Duel Updates
        const distanceKm = activity.distance / 1000;
        const durationMin = activity.moving_time / 60;
        await processUserCardioActivity(user.id, activity.type, distanceKm, durationMin);

        // Award Rewards (Simple: 1 XP per minute, 1 Gold per minute)
        const minutes = Math.floor(logData.duration / 60);
        if (minutes > 0) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              totalExperience: { increment: minutes },
              gold: { increment: minutes },
              kineticEnergy: { increment: Math.floor(minutes / 2) },
            },
          });
        }

        // --- GUILD TERRITORIES ---
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { guildId: true },
        });

        if (dbUser?.guildId) {
          const volume = activity.distance / 1000; // volume = km for cardio
          await TerritoryService.recordGuildActivity(dbUser.guildId, volume);
        }

        syncedCount++;
      }
    }

    revalidatePath('/');
    return { success: true, count: syncedCount };
  } catch (error: unknown) {
    let message = 'Unknown error';
    if (axios.isAxiosError(error)) {
      message = error.response?.data?.message || error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    console.error('Sync Error:', message);
    return { success: false, error: `Sync failed: ${message}` };
  }
}

export async function uploadToStravaAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Unauthorized' };

  const token = await getValidAccessToken(user.id);
  if (!token) return { success: false, error: 'Strava not connected or token invalid' };

  const file = formData.get('file') as File;
  if (!file) return { success: false, error: 'No file provided' };

  try {
    // Convert File to Blob/Buffer for Axios
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const stravaFormData = new FormData();
    stravaFormData.append('file', new Blob([buffer]), file.name);
    stravaFormData.append('data_type', file.name.endsWith('.fit') ? 'fit' : 'gpx');

    const response = await fetch('https://www.strava.com/api/v3/uploads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: stravaFormData,
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Upload failed');
    }

    const uploadData = await response.json();
    const result = StravaUploadResponseSchema.parse(uploadData);
    return { success: true, uploadId: result.id, status: result.status };
  } catch (error: unknown) {
    console.error('Upload Error:', error);
    const message = error instanceof Error ? error.message : 'Upload failed';
    return { success: false, error: message };
  }
}
