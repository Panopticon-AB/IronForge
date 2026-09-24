import type { MeasurementMode, SetSide, SetType } from '@/features/strength-evidence/write-contract';

export interface TemplateSetPrescription {
  targetRepsMin?: number;
  targetRepsMax?: number;
  targetDurationSeconds?: number;
  targetRpe?: number;
  suggestedLoadKg?: number;
}

export interface TemplateExerciseDefinition {
  exerciseId: string;
  exerciseName: string;
  sequence: number;
  measurementMode: MeasurementMode;
  isOptionalAccessory?: boolean;
  prescribedSetsCount: number;
  defaultPrescription?: TemplateSetPrescription;
  unilateral?: boolean;
  equipmentProfileId?: string;
  setupMode?: string;
}

export interface StrengthTemplateDefinition {
  id: string;
  code: 'A1' | 'B1' | 'A2' | 'B2' | string;
  name: string;
  description: string;
  exercises: TemplateExerciseDefinition[];
  minimumExerciseIds: string[];
  minimumSetsPerExercise?: number;
}

/**
 * Canonical A1, B1, A2, B2 training templates as pure data.
 * Each template includes an explicit minimum fallback variant reusing the same generic schema.
 */
export const CANONICAL_STRENGTH_TEMPLATES: Record<'A1' | 'B1' | 'A2' | 'B2', StrengthTemplateDefinition> = {
  A1: {
    id: 'template-a1-belt-squat-upper',
    code: 'A1',
    name: 'A1 — Belt Squat + Base Upper Body',
    description: 'Knee-dominant lower body plus simple push/pull/core.',
    minimumExerciseIds: ['belt-squat', 'bench-press', 'barbell-row'],
    minimumSetsPerExercise: 2,
    exercises: [
      {
        exerciseId: 'belt-squat',
        exerciseName: 'Belt Squat',
        sequence: 0,
        measurementMode: 'LOAD_AND_REPS',
        prescribedSetsCount: 3,
        defaultPrescription: { targetRepsMin: 6, targetRepsMax: 10 },
      },
      {
        exerciseId: 'calf-raise',
        exerciseName: 'Calf Raise',
        sequence: 1,
        measurementMode: 'LOAD_AND_REPS',
        isOptionalAccessory: true,
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 10, targetRepsMax: 15 },
      },
      {
        exerciseId: 'bench-press',
        exerciseName: 'Bench Press',
        sequence: 2,
        measurementMode: 'LOAD_AND_REPS',
        prescribedSetsCount: 3,
        defaultPrescription: { targetRepsMin: 6, targetRepsMax: 10 },
      },
      {
        exerciseId: 'barbell-row',
        exerciseName: 'Barbell Row',
        sequence: 3,
        measurementMode: 'LOAD_AND_REPS',
        prescribedSetsCount: 3,
        defaultPrescription: { targetRepsMin: 6, targetRepsMax: 10 },
      },
      {
        exerciseId: 'ab-wheel',
        exerciseName: 'Ab Wheel',
        sequence: 4,
        measurementMode: 'REPS_ONLY',
        isOptionalAccessory: true,
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 5, targetRepsMax: 10 },
      },
    ],
  },

  B1: {
    id: 'template-b1-machine-support',
    code: 'B1',
    name: 'B1 — Machine / Support Day',
    description: 'Low-friction accessory/support work with simple lower-body machines plus back/shoulders/arms.',
    minimumExerciseIds: ['leg-extension', 'hamstring-curl', 'seated-row', 'face-pull'],
    minimumSetsPerExercise: 2,
    exercises: [
      {
        exerciseId: 'leg-extension',
        exerciseName: 'Leg Extension',
        sequence: 0,
        measurementMode: 'LOAD_AND_REPS',
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 10, targetRepsMax: 15 },
      },
      {
        exerciseId: 'hamstring-curl',
        exerciseName: 'Hamstring Curl',
        sequence: 1,
        measurementMode: 'LOAD_AND_REPS',
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 10, targetRepsMax: 15 },
      },
      {
        exerciseId: 'seated-row',
        exerciseName: 'Seated Row',
        sequence: 2,
        measurementMode: 'LOAD_AND_REPS',
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 8, targetRepsMax: 15 },
      },
      {
        exerciseId: 'face-pull',
        exerciseName: 'Face Pull',
        sequence: 3,
        measurementMode: 'LOAD_AND_REPS',
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 12, targetRepsMax: 20 },
      },
      {
        exerciseId: 'curl',
        exerciseName: 'Curl',
        sequence: 4,
        measurementMode: 'LOAD_AND_REPS',
        isOptionalAccessory: true,
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 10, targetRepsMax: 15 },
      },
      {
        exerciseId: 'skullcrusher',
        exerciseName: 'Skullcrusher',
        sequence: 5,
        measurementMode: 'LOAD_AND_REPS',
        isOptionalAccessory: true,
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 10, targetRepsMax: 15 },
      },
      {
        exerciseId: 'lateral-raise',
        exerciseName: 'Lateral Raise',
        sequence: 6,
        measurementMode: 'LOAD_AND_REPS',
        isOptionalAccessory: true,
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 12, targetRepsMax: 20 },
      },
    ],
  },

  A2: {
    id: 'template-a2-ghd-posterior-upper',
    code: 'A2',
    name: 'A2 — Upper Body + Posterior Chain / GHD',
    description: 'Simple push/pull plus Hyper Pro/GHD posterior-chain work.',
    minimumExerciseIds: ['bench-press', 'barbell-row', 'reverse-hyper'],
    minimumSetsPerExercise: 2,
    exercises: [
      {
        exerciseId: 'bench-press',
        exerciseName: 'Bench Press',
        sequence: 0,
        measurementMode: 'LOAD_AND_REPS',
        prescribedSetsCount: 3,
        defaultPrescription: { targetRepsMin: 6, targetRepsMax: 10 },
      },
      {
        exerciseId: 'barbell-row',
        exerciseName: 'Barbell Row',
        sequence: 1,
        measurementMode: 'LOAD_AND_REPS',
        prescribedSetsCount: 3,
        defaultPrescription: { targetRepsMin: 6, targetRepsMax: 10 },
      },
      {
        exerciseId: 'reverse-hyper',
        exerciseName: 'Reverse Hyper',
        sequence: 2,
        measurementMode: 'LOAD_AND_REPS',
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 10, targetRepsMax: 15 },
      },
      {
        exerciseId: 'dumbbell-pullover',
        exerciseName: 'Dumbbell Pullover on GHD pad',
        sequence: 3,
        measurementMode: 'LOAD_AND_REPS',
        isOptionalAccessory: true,
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 8, targetRepsMax: 15 },
      },
      {
        exerciseId: 'decline-dumbbell-fly',
        exerciseName: 'Decline Dumbbell Fly',
        sequence: 4,
        measurementMode: 'LOAD_AND_REPS',
        isOptionalAccessory: true,
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 8, targetRepsMax: 12 },
      },
      {
        exerciseId: 'ab-wheel',
        exerciseName: 'Ab Wheel',
        sequence: 5,
        measurementMode: 'REPS_ONLY',
        isOptionalAccessory: true,
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 5, targetRepsMax: 10 },
      },
    ],
  },

  B2: {
    id: 'template-b2-hip-thrust-bulgarian',
    code: 'B2',
    name: 'B2 — Hip Thrust / Bulgarian Support Day',
    description: 'Learn and maintain Hip Thrust + Bulgarian Split Squat skill pattern with moderate supporting upper-body work.',
    minimumExerciseIds: ['hip-thrust', 'bulgarian-split-squat', 'one-arm-db-row'],
    minimumSetsPerExercise: 2,
    exercises: [
      {
        exerciseId: 'hip-thrust',
        exerciseName: 'Hip Thrust',
        sequence: 0,
        measurementMode: 'LOAD_AND_REPS',
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 8, targetRepsMax: 12, targetRpe: 6 },
      },
      {
        exerciseId: 'bulgarian-split-squat',
        exerciseName: 'Bulgarian Split Squat',
        sequence: 1,
        measurementMode: 'LOAD_AND_REPS',
        unilateral: true,
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 6, targetRepsMax: 10, targetRpe: 6 },
      },
      {
        exerciseId: 'one-arm-db-row',
        exerciseName: 'One-arm Dumbbell Row',
        sequence: 2,
        measurementMode: 'LOAD_AND_REPS',
        unilateral: true,
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 8, targetRepsMax: 12 },
      },
      {
        exerciseId: 'high-incline-db-press',
        exerciseName: 'High-incline Dumbbell Press',
        sequence: 3,
        measurementMode: 'LOAD_AND_REPS',
        isOptionalAccessory: true,
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 8, targetRepsMax: 12 },
      },
      {
        exerciseId: 'lateral-raise',
        exerciseName: 'Lateral Raise',
        sequence: 4,
        measurementMode: 'LOAD_AND_REPS',
        isOptionalAccessory: true,
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 12, targetRepsMax: 20 },
      },
      {
        exerciseId: 'db-curl',
        exerciseName: 'Dumbbell Curl',
        sequence: 5,
        measurementMode: 'LOAD_AND_REPS',
        isOptionalAccessory: true,
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 10, targetRepsMax: 15 },
      },
      {
        exerciseId: 'db-skullcrusher',
        exerciseName: 'Dumbbell Skullcrusher',
        sequence: 6,
        measurementMode: 'LOAD_AND_REPS',
        isOptionalAccessory: true,
        prescribedSetsCount: 2,
        defaultPrescription: { targetRepsMin: 10, targetRepsMax: 15 },
      },
    ],
  },
};

/**
 * Creates an immutable snapshot of a template when starting a session.
 * Protects historical sessions from future template modifications.
 */
export function snapshotTemplateForSession(
  template: StrengthTemplateDefinition,
  isMinimumVariant = false
): StrengthTemplateDefinition {
  const cloned = structuredClone(template);
  if (isMinimumVariant) {
    const minSet = new Set(template.minimumExerciseIds);
    cloned.exercises = cloned.exercises
      .filter((ex) => minSet.has(ex.exerciseId))
      .map((ex) => ({
        ...ex,
        prescribedSetsCount: template.minimumSetsPerExercise ?? 2,
      }));
  }
  return cloned;
}
