import { describe, expect, it } from 'vitest';

import type { HevyWorkout } from '@/types/hevy';

import { toHevyStrengthSessionEvidence } from './hevy-adapter';

const workout: HevyWorkout = {
  id: 'hevy-workout-123',
  title: 'Hyper Pro strength',
  start_time: new Date('2026-09-02T18:00:00.000Z'),
  end_time: new Date('2026-09-02T18:40:00.000Z'),
  duration_seconds: 2400,
  exercises: [
    {
      exercise_template_id: 'belt-squat-template',
      exercise_template: {
        id: 'belt-squat-template',
        title: 'Belt Squat',
      },
      sets: [
        { index: 0, weight_kg: 60, reps: 8 },
        { index: 1, weight_kg: 70, reps: 6 },
      ],
    },
    {
      exercise_template_id: 'back-extension-template',
      exercise_template: {
        id: 'back-extension-template',
        title: 'Back Extension',
      },
      sets: [{ index: 0, weight_kg: 20, reps: 10 }],
    },
  ],
};

describe('toHevyStrengthSessionEvidence', () => {
  it('keeps workout identity at session level while preserving exercise and set identity', () => {
    const evidence = toHevyStrengthSessionEvidence(workout);

    expect(evidence.provenance).toEqual({
      source: 'HEVY',
      providerSessionId: 'hevy-workout-123',
    });
    expect(evidence.exercises).toHaveLength(2);
    expect(evidence.exercises[0]).toMatchObject({
      sequence: 0,
      exerciseName: 'Belt Squat',
      providerExerciseId: 'belt-squat-template',
    });
    expect(evidence.exercises[0].sets).toEqual([
      { sequence: 0, providerSetIndex: 0, loadKg: 60, reps: 8 },
      { sequence: 1, providerSetIndex: 1, loadKg: 70, reps: 6 },
    ]);
    expect(evidence.exercises[1]).toMatchObject({
      sequence: 1,
      exerciseName: 'Back Extension',
      providerExerciseId: 'back-extension-template',
    });
  });

  it('does not manufacture RPE or RIR when Hevy did not provide them', () => {
    const evidence = toHevyStrengthSessionEvidence(workout);
    const firstSet = evidence.exercises[0].sets[0];

    expect('rpe' in firstSet).toBe(false);
    expect('rir' in firstSet).toBe(false);
  });

  it('keeps missing provider workout identity unknown instead of inventing one', () => {
    const evidence = toHevyStrengthSessionEvidence({ ...workout, id: undefined });

    expect('providerSessionId' in evidence.provenance).toBe(false);
  });
});
