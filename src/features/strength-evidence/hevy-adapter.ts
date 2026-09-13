import type { HevyWorkout } from '@/types/hevy';

import type { StrengthSessionEvidence } from './domain';

export function toHevyStrengthSessionEvidence(workout: HevyWorkout): StrengthSessionEvidence {
  return {
    provenance: {
      source: 'HEVY',
      ...(workout.id ? { providerSessionId: workout.id } : {}),
    },
    title: workout.title,
    startedAt: workout.start_time.toISOString(),
    ...(workout.end_time ? { endedAt: workout.end_time.toISOString() } : {}),
    ...(workout.duration_seconds !== undefined
      ? { durationSeconds: workout.duration_seconds }
      : {}),
    exercises: workout.exercises.map((exercise, exerciseIndex) => ({
      sequence: exerciseIndex,
      exerciseName: exercise.exercise_template.title,
      providerExerciseId: exercise.exercise_template_id,
      sets: exercise.sets.map((set, setIndex) => ({
        sequence: setIndex,
        ...(set.index !== undefined ? { providerSetIndex: set.index } : {}),
        loadKg: set.weight_kg,
        reps: set.reps,
      })),
    })),
  };
}
