'use server';

import {
  claimStrengthEvidenceEffects,
  markStrengthEvidenceEffectsApplied,
} from '@/features/strength-evidence/effect-gate';
import { toHevyStrengthSessionEvidence } from '@/features/strength-evidence/hevy-adapter';
import { getHevyTemplates } from '@/lib/hevy';
import prisma from '@/lib/prisma';
import { TerritoryService } from '@/services/game/TerritoryService';
import type { HevyRoutine, HevyWorkout } from '@/types/hevy';
import { createClient } from '@/utils/supabase/server';
import type { Prisma } from '@prisma/client';
import axios from 'axios';

import { HevyHelperSchema, ImportHevyHistorySchema } from '@/types/schemas';

export async function getHevyTemplatesAction(apiKey: string) {
  try {
    const { apiKey: _validatedKey } = HevyHelperSchema.pick({
      apiKey: true,
    }).parse({ apiKey });
    const allExercises = await getHevyTemplates(_validatedKey);
    return {
      exercise_templates: allExercises,
      page: 1,
      total_pages: 1,
      total_records: allExercises.length,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Server Action Hevy Error:', message);
    if (error && typeof error === 'object' && 'issues' in error) {
      throw new Error('Hevy API Key is required.');
    }
    throw new Error(`Failed to fetch Hevy templates: ${message}`);
  }
}

export async function getHevyRoutinesAction(apiKey: string, page = 1, pageSize = 10) {
  HevyHelperSchema.pick({ apiKey: true, page: true, pageSize: true }).parse({
    apiKey,
    page,
    pageSize,
  });

  try {
    const response = await axios.get('https://api.hevyapp.com/v1/routines', {
      headers: { 'api-key': apiKey },
      params: { page, pageSize },
    });
    return response.data as {
      page: number;
      page_count: number;
      routines: HevyRoutine[];
    };
  } catch (error: unknown) {
    let message = 'Unknown error';
    if (axios.isAxiosError(error)) {
      message = error.response?.data?.error || error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    console.error('Server Action Hevy Routines Error:', message);
    throw new Error(`Failed to fetch Hevy routines: ${message}`);
  }
}

export async function getHevyWorkoutHistoryAction(apiKey: string, count = 30) {
  HevyHelperSchema.pick({
    apiKey: true,
    count: true,
  }).parse({ apiKey, count });

  const pageSize = 10;
  const numPagesToFetch = Math.ceil(count / pageSize);
  const allWorkouts: HevyWorkout[] = [];

  try {
    for (let page = 1; page <= numPagesToFetch; page++) {
      const response = await axios.get('https://api.hevyapp.com/v1/workouts', {
        headers: { 'api-key': apiKey },
        params: { page, pageSize },
      });

      if (response.status === 200 && response.data.workouts) {
        allWorkouts.push(...response.data.workouts);
        if (response.data.workouts.length < pageSize) {
          break;
        }
      } else {
        console.warn(
          `Warning: Could not fetch page ${page} of Hevy workout history. Status: ${response.status}`
        );
      }
    }
    return { workouts: allWorkouts.slice(0, count) };
  } catch (error: unknown) {
    let message = 'Unknown error';
    if (axios.isAxiosError(error)) {
      message = error.response?.data?.error || error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    console.error('Server Action Hevy History Error:', message);
    throw new Error(`Failed to fetch Hevy history: ${message}`);
  }
}

export async function saveWorkoutAction(apiKey: string, payload: { workout?: HevyWorkout }) {
  HevyHelperSchema.pick({
    apiKey: true,
  }).parse({ apiKey });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  try {
    const response = await axios.post('https://api.hevyapp.com/v1/workouts', payload, {
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    // --- PERFORMANCE COACH: Award Kinetic Energy ---
    if (user && payload.workout) {
      const exercises = payload.workout.exercises || [];
      let totalVolume = 0;
      for (const ex of exercises) {
        if (ex.sets) {
          for (const s of ex.sets) {
            totalVolume += (s.weight_kg || 0) * (s.reps || 0);
          }
        }
      }

      const energyGain = Math.max(10, Math.floor(totalVolume / 100));

      await prisma.user.update({
        where: { id: user.id },
        data: {
          kineticEnergy: { increment: energyGain },
          totalExperience: { increment: energyGain * 2 },
        },
      });

      const { recalculatePowerRatingAction } = await import('@/actions/titan/power-rating');
      await recalculatePowerRatingAction(user.id);

      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { guildId: true },
      });

      if (dbUser?.guildId) {
        await TerritoryService.recordGuildActivity(dbUser.guildId, totalVolume);
      }

      response.data.rewards = { energy: energyGain };
    }

    return response.data;
  } catch (error: unknown) {
    let message = 'Unknown error';
    if (axios.isAxiosError(error)) {
      message = error.response?.data?.error || error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    console.error('Server Action Hevy Save Error:', message);
    throw new Error(`Failed to save workout: ${message}`);
  }
}

async function createLegacyHevyWorkoutLogs(
  tx: Prisma.TransactionClient,
  userId: string,
  workout: HevyWorkout,
): Promise<number> {
  const logsToCreate: Prisma.ExerciseLogCreateManyInput[] = [];
  const existingExercises = await tx.exercise.findMany({
    select: { id: true, name: true },
  });
  const exerciseMap = new Map(existingExercises.map((exercise) => [exercise.name.toLowerCase(), exercise.id]));
  const date = new Date(workout.start_time);

  for (const exercise of workout.exercises) {
    const title = exercise.exercise_template.title || 'Unknown Exercise';
    let exerciseId = exerciseMap.get(title.toLowerCase());

    if (!exerciseId) {
      const newExercise = await tx.exercise.create({
        data: {
          name: title,
          muscleGroup: 'Other',
          equipment: 'Grid',
          secondaryMuscles: [],
        },
      });
      exerciseId = newExercise.id;
      exerciseMap.set(title.toLowerCase(), exerciseId);
    }

    if (exercise.sets.length > 0) {
      logsToCreate.push({
        userId,
        date,
        exerciseId,
        sets: exercise.sets as Prisma.InputJsonValue,
      });
    }
  }

  if (logsToCreate.length > 0) {
    await tx.exerciseLog.createMany({
      data: logsToCreate,
      skipDuplicates: true,
    });
  }

  return logsToCreate.length;
}

export async function importHevyHistoryAction(workouts: unknown[]) {
  const { workouts: validatedWorkouts } = ImportHevyHistorySchema.parse({
    workouts,
  });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  try {
    let logsCreated = 0;
    let importedWorkouts = 0;
    let duplicateWorkouts = 0;
    let unidentifiedWorkouts = 0;

    for (const workout of validatedWorkouts) {
      const evidence = toHevyStrengthSessionEvidence(workout);

      if (!evidence.provenance.providerSessionId) {
        const legacyLogs = await prisma.$transaction((tx) =>
          createLegacyHevyWorkoutLogs(tx, user.id, workout)
        );
        logsCreated += legacyLogs;
        importedWorkouts++;
        unidentifiedWorkouts++;
        continue;
      }

      const result = await prisma.$transaction(async (tx) => {
        const claim = await claimStrengthEvidenceEffects(tx, user.id, evidence);

        if (claim.status === 'ALREADY_APPLIED') {
          return { status: 'DUPLICATE' as const, logs: 0 };
        }

        if (claim.status === 'SKIP_MISSING_PROVIDER_SESSION_ID') {
          const logs = await createLegacyHevyWorkoutLogs(tx, user.id, workout);
          return { status: 'UNIDENTIFIED' as const, logs };
        }

        const logs = await createLegacyHevyWorkoutLogs(tx, user.id, workout);
        await markStrengthEvidenceEffectsApplied(tx, claim.sessionId);
        return { status: 'IMPORTED' as const, logs };
      });

      logsCreated += result.logs;
      if (result.status === 'DUPLICATE') {
        duplicateWorkouts++;
      } else {
        importedWorkouts++;
        if (result.status === 'UNIDENTIFIED') unidentifiedWorkouts++;
      }
    }

    return {
      success: true,
      count: validatedWorkouts.length,
      logs: logsCreated,
      importedWorkouts,
      duplicateWorkouts,
      unidentifiedWorkouts,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Server Action Hevy Import Error:', message);
    throw new Error(`Failed to import history: ${message}`);
  }
}

export async function importHevyRoutineToTemplateAction(routine: HevyRoutine) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  try {
    const mappedExercises =
      routine.exercises?.map((ex) => ({
        name: ex.exercise_template.title,
        exerciseId: ex.exercise_template_id,
        sets: ex.sets.map((s) => ({
          reps: s.reps,
          weight: s.weight_kg,
          type: s.type || 'normal',
        })),
        notes: ex.notes,
      })) || [];

    const template = await prisma.workoutTemplate.create({
      data: {
        userId: user.id,
        name: routine.title,
        exercises: mappedExercises,
      },
    });

    return { success: true, templateId: template.id };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Server Action Hevy Import Routine Error:', message);
    throw new Error(`Failed to import routine: ${message}`);
  }
}
