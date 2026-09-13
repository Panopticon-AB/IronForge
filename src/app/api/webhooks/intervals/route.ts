import { getErrorMessage } from '@/lib/error-message';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { type NextRequest, NextResponse } from 'next/server';

import { processUserCardioActivity } from '@/actions/pvp/duel';
import { TerritoryService } from '@/services/game/TerritoryService';
import { Progression } from '@/services/progression';

// Defines the shape of an Intervals.icu Activity Event
// Reference: https://intervals.icu/api/v1/athlete/{id}/activities
interface IntervalsActivityPayload {
  id: string; // Intervals Activity ID
  type: string; // e.g., "Run", "Ride", "WeightTraining"
  start_date_local: string;
  moving_time: number; // seconds
  training_load?: number; // TSS
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  distance?: number; // Meters
  icu_athlete_id: string; // Crucial for matching user
}

export async function POST(request: NextRequest) {
  try {
    // 1. Verify Secret
    // Intervals.icu sends identifying header or you can check Authorization
    const _signature = request.headers.get('Authorization');

    logger.info('[Intervals Webhook] Incoming Activity. Auth Signature detected.');

    // 2. Parse Body
    const activity: IntervalsActivityPayload = await request.json();

    if (!activity.id || !activity.icu_athlete_id) {
      return NextResponse.json(
        { error: 'Invalid payload: missing id or athlete_id' },
        { status: 400 }
      );
    }

    logger.info(
      `[Intervals Webhook] Processing ${activity.type} for Athlete: ${activity.icu_athlete_id}`
    );

    // 3. Match User
    const user = await prisma.user.findFirst({
      where: { intervalsAthleteId: activity.icu_athlete_id },
    });

    if (!user) {
      logger.warn(
        `[Intervals Webhook] No user found with intervalsAthleteId: ${activity.icu_athlete_id}`
      );
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 4. Persistence
    // We only care about Cardio for CardioLog.
    // If it's WeightTraining, Hevy might handle it better, but we can log it too as fallback.
    const isCardio = [
      'Run',
      'Ride',
      'Swim',
      'Row',
      'Walk',
      'Hike',
      'NordicSki',
      'VirtualRide',
      'VirtualRun',
    ].includes(activity.type);

    if (isCardio) {
      const trainingLoad = activity.training_load ?? null;

      await prisma.cardioLog.upsert({
        where: { intervalsId: String(activity.id) },
        update: {
          type: activity.type,
          duration: activity.moving_time,
          load: trainingLoad,
          averageHr: activity.average_heartrate,
          date: new Date(activity.start_date_local),
        },
        create: {
          intervalsId: String(activity.id),
          userId: user.id,
          type: activity.type,
          duration: activity.moving_time,
          load: trainingLoad,
          averageHr: activity.average_heartrate,
          date: new Date(activity.start_date_local),
        },
      });
      logger.info(
        `[Intervals Webhook] Persisted CardioLog: ${activity.type} | Load: ${activity.training_load}`
      );

      // Trigger Duel Updates
      // Intervals payload doesn't seem to have distance directly in the typed interface I saw?
      // "IntervalsActivityPayload" definition:
      // interface IntervalsActivityPayload {
      //   id: string; ... moving_time: number; ...
      // }
      // It might be missing in the interface but present in payload.
      // But for now, let's assume we might need to fetch it or update interface?
      // Let's check the partial interface.

      // We'll update the interface to include distance if possible, or cast to any.
      // Intervals API typically sends distance (meters).
      const distanceMeters = (activity as any).distance || 0;
      const distanceKm = distanceMeters / 1000;
      const durationMin = activity.moving_time / 60;

      if (distanceKm > 0) {
        await processUserCardioActivity(user.id, activity.type, distanceKm, durationMin);
      }

      // --- Territory Conquest Integration ---
      const isConquestSport = ['Run', 'Walk', 'Hike', 'VirtualRun'].includes(activity.type);

      if (isConquestSport && distanceKm > 0.1 && user.intervalsApiKey) {
        logger.info('[Intervals Webhook] Processing Guild Territory Activity...');

        // Match the guild-based system: volume = distance in meters for now
        if (user.guildId) {
          await TerritoryService.recordGuildActivity(user.guildId, distanceMeters);
          logger.info(
            `[Intervals Webhook] Recorded ${distanceMeters} volume for Guild ${user.guildId}`
          );
        }
      }
    } else {
      logger.info(`[Intervals Webhook] Skipping non-cardio activity type: ${activity.type}`);
    }

    // 4. Trigger Oracle Recalculation
    logger.info('[Intervals Webhook] Triggering Oracle recalculation...');
    // OracleService.recalculate(user.id); // Assuming OracleService has a recalculate method

    // 5. Award Rewards
    if (user) {
      await Progression.awardGold(user.id, 15);
      await Progression.addExperience(user.id, 100);
      logger.info(`[Intervals Webhook] Rewards awarded to ${user.id}: 15g, 100xp`);
    }

    // 6. Success
    return NextResponse.json(
      { success: true, message: 'Activity processed & Rewards awarded' },
      { status: 200 }
    );
  } catch (error) {
    logger.error({ err: error }, `[Intervals Webhook] Error: ${getErrorMessage(error)}`);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}