import { z } from 'zod';

export type MeasurementMode =
  | 'LOAD_AND_REPS'
  | 'REPS_ONLY'
  | 'DURATION'
  | 'DURATION_AND_LOAD';

export type LoadUnit = 'KG' | 'LBS';

export type LoadSemantics =
  | 'TOTAL_EXTERNAL_LOAD'
  | 'ADDED_LOAD'
  | 'PER_HAND'
  | 'BODYWEIGHT'
  | 'ASSISTED_BODYWEIGHT';

export type SetSide = 'LEFT' | 'RIGHT' | 'BILATERAL';

export type SetType = 'NORMAL' | 'WARMUP' | 'DROPSET' | 'FAILURE' | 'MYOREPS';

export interface CanonicalStrengthSet {
  id: string;
  performedExerciseId: string;
  measurementMode: MeasurementMode;
  load?: number;
  loadUnit?: LoadUnit;
  loadSemantics?: LoadSemantics;
  reps?: number;
  durationSeconds?: number;
  side?: SetSide;
  rpe?: number;
  rir?: number;
  setType: SetType;
  completedAt: string;
  clientWriteId: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export const CanonicalStrengthSetSchema = z
  .object({
    id: z.string().min(1),
    performedExerciseId: z.string().min(1),
    measurementMode: z.enum([
      'LOAD_AND_REPS',
      'REPS_ONLY',
      'DURATION',
      'DURATION_AND_LOAD',
    ]),
    load: z.number().nonnegative().optional(),
    loadUnit: z.enum(['KG', 'LBS']).optional(),
    loadSemantics: z
      .enum([
        'TOTAL_EXTERNAL_LOAD',
        'ADDED_LOAD',
        'PER_HAND',
        'BODYWEIGHT',
        'ASSISTED_BODYWEIGHT',
      ])
      .optional(),
    reps: z.number().int().positive().optional(),
    durationSeconds: z.number().int().positive().optional(),
    side: z.enum(['LEFT', 'RIGHT', 'BILATERAL']).optional(),
    rpe: z.number().min(1).max(10).optional(),
    rir: z.number().min(0).max(10).optional(),
    setType: z
      .enum(['NORMAL', 'WARMUP', 'DROPSET', 'FAILURE', 'MYOREPS'])
      .default('NORMAL'),
    completedAt: z.string().datetime(),
    clientWriteId: z.string().min(1),
    note: z.string().max(500).optional(),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
  })
  .superRefine((data, ctx) => {
    switch (data.measurementMode) {
      case 'LOAD_AND_REPS': {
        if (data.load === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Load is required for LOAD_AND_REPS',
            path: ['load'],
          });
        }
        if (data.reps === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Reps are required for LOAD_AND_REPS',
            path: ['reps'],
          });
        }
        if (data.load !== undefined && !data.loadUnit) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Load unit is required when load is present',
            path: ['loadUnit'],
          });
        }
        if (data.load !== undefined && !data.loadSemantics) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Load semantics are required when load is present',
            path: ['loadSemantics'],
          });
        }
        break;
      }
      case 'REPS_ONLY': {
        if (data.reps === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Reps are required for REPS_ONLY',
            path: ['reps'],
          });
        }
        if (data.load !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Load is not permitted for REPS_ONLY',
            path: ['load'],
          });
        }
        break;
      }
      case 'DURATION': {
        if (data.durationSeconds === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Duration is required for DURATION',
            path: ['durationSeconds'],
          });
        }
        if (data.load !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Load is not permitted for DURATION',
            path: ['load'],
          });
        }
        if (data.reps !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Reps are not permitted for DURATION',
            path: ['reps'],
          });
        }
        break;
      }
      case 'DURATION_AND_LOAD': {
        if (data.durationSeconds === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Duration is required for DURATION_AND_LOAD',
            path: ['durationSeconds'],
          });
        }
        if (data.load === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Load is required for DURATION_AND_LOAD',
            path: ['load'],
          });
        }
        if (data.load !== undefined && !data.loadUnit) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Load unit is required when load is present',
            path: ['loadUnit'],
          });
        }
        if (data.load !== undefined && !data.loadSemantics) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Load semantics are required when load is present',
            path: ['loadSemantics'],
          });
        }
        break;
      }
    }
  });

export type CanonicalStrengthSetInput = z.input<typeof CanonicalStrengthSetSchema>;
export type ValidatedCanonicalStrengthSet = z.infer<typeof CanonicalStrengthSetSchema>;

/**
 * Explicit schema for user corrections to an existing canonical set.
 * Identity fields (id, clientWriteId, performedExerciseId, createdAt) are strictly prohibited.
 * completedAt is immutable by default (a recorded set's timestamp reflects when it occurred).
 */
export const CorrectStrengthSetSchema = z
  .object({
    load: z.number().nonnegative().optional(),
    loadUnit: z.enum(['KG', 'LBS']).optional(),
    loadSemantics: z
      .enum([
        'TOTAL_EXTERNAL_LOAD',
        'ADDED_LOAD',
        'PER_HAND',
        'BODYWEIGHT',
        'ASSISTED_BODYWEIGHT',
      ])
      .optional(),
    reps: z.number().int().positive().optional(),
    durationSeconds: z.number().int().positive().optional(),
    side: z.enum(['LEFT', 'RIGHT', 'BILATERAL']).optional(),
    rpe: z.number().min(1).max(10).optional(),
    rir: z.number().min(0).max(10).optional(),
    setType: z.enum(['NORMAL', 'WARMUP', 'DROPSET', 'FAILURE', 'MYOREPS']).optional(),
    note: z.string().max(500).optional(),
  })
  .strict();

export type CorrectStrengthSetInput = z.infer<typeof CorrectStrengthSetSchema>;
