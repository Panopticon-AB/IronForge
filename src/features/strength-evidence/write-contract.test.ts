import { describe, expect, it } from 'vitest';
import {
  CanonicalStrengthSetSchema,
  type CanonicalStrengthSetInput,
} from './write-contract';

describe('CanonicalStrengthSetSchema', () => {
  const baseValidSet = {
    id: 'set-1',
    performedExerciseId: 'perf-ex-1',
    clientWriteId: 'client-write-123',
    completedAt: '2026-09-24T18:00:00.000Z',
    setType: 'NORMAL' as const,
  };

  it('validates a weighted-rep set with load, unit, and semantics', () => {
    const input: CanonicalStrengthSetInput = {
      ...baseValidSet,
      measurementMode: 'LOAD_AND_REPS',
      load: 80,
      loadUnit: 'KG',
      loadSemantics: 'TOTAL_EXTERNAL_LOAD',
      reps: 8,
    };

    const parsed = CanonicalStrengthSetSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.load).toBe(80);
    expect(parsed.data.reps).toBe(8);
  });

  it('preserves unknown RPE/RIR as undefined without synthesis', () => {
    const input: CanonicalStrengthSetInput = {
      ...baseValidSet,
      measurementMode: 'LOAD_AND_REPS',
      load: 80,
      loadUnit: 'KG',
      loadSemantics: 'TOTAL_EXTERNAL_LOAD',
      reps: 8,
    };

    const parsed = CanonicalStrengthSetSchema.parse(input);
    expect(parsed.rpe).toBeUndefined();
    expect(parsed.rir).toBeUndefined();
    expect('rpe' in parsed).toBe(false);
  });

  it('accepts explicit optional RPE/RIR when provided', () => {
    const input: CanonicalStrengthSetInput = {
      ...baseValidSet,
      measurementMode: 'LOAD_AND_REPS',
      load: 80,
      loadUnit: 'KG',
      loadSemantics: 'TOTAL_EXTERNAL_LOAD',
      reps: 8,
      rpe: 8.5,
      rir: 2,
    };

    const parsed = CanonicalStrengthSetSchema.parse(input);
    expect(parsed.rpe).toBe(8.5);
    expect(parsed.rir).toBe(2);
  });

  it('rejects LOAD_AND_REPS missing load or reps', () => {
    const missingLoad: CanonicalStrengthSetInput = {
      ...baseValidSet,
      measurementMode: 'LOAD_AND_REPS',
      reps: 8,
    };
    expect(CanonicalStrengthSetSchema.safeParse(missingLoad).success).toBe(false);

    const missingReps: CanonicalStrengthSetInput = {
      ...baseValidSet,
      measurementMode: 'LOAD_AND_REPS',
      load: 80,
      loadUnit: 'KG',
      loadSemantics: 'TOTAL_EXTERNAL_LOAD',
    };
    expect(CanonicalStrengthSetSchema.safeParse(missingReps).success).toBe(false);
  });

  it('rejects load without loadUnit or loadSemantics', () => {
    const missingSemantics: CanonicalStrengthSetInput = {
      ...baseValidSet,
      measurementMode: 'LOAD_AND_REPS',
      load: 80,
      loadUnit: 'KG',
      reps: 8,
    };
    expect(CanonicalStrengthSetSchema.safeParse(missingSemantics).success).toBe(false);
  });

  it('validates a REPS_ONLY set and rejects load on REPS_ONLY', () => {
    const validRepsOnly: CanonicalStrengthSetInput = {
      ...baseValidSet,
      measurementMode: 'REPS_ONLY',
      reps: 12,
    };
    expect(CanonicalStrengthSetSchema.safeParse(validRepsOnly).success).toBe(true);

    const invalidRepsOnly: CanonicalStrengthSetInput = {
      ...baseValidSet,
      measurementMode: 'REPS_ONLY',
      reps: 12,
      load: 10,
    };
    expect(CanonicalStrengthSetSchema.safeParse(invalidRepsOnly).success).toBe(false);
  });

  it('validates a DURATION set and rejects reps or load on DURATION', () => {
    const validDuration: CanonicalStrengthSetInput = {
      ...baseValidSet,
      measurementMode: 'DURATION',
      durationSeconds: 45,
    };
    expect(CanonicalStrengthSetSchema.safeParse(validDuration).success).toBe(true);

    const invalidDuration: CanonicalStrengthSetInput = {
      ...baseValidSet,
      measurementMode: 'DURATION',
      durationSeconds: 45,
      reps: 5,
    };
    expect(CanonicalStrengthSetSchema.safeParse(invalidDuration).success).toBe(false);
  });

  it('validates a DURATION_AND_LOAD set and requires both duration and load metadata', () => {
    const validDurationAndLoad: CanonicalStrengthSetInput = {
      ...baseValidSet,
      measurementMode: 'DURATION_AND_LOAD',
      durationSeconds: 30,
      load: 15,
      loadUnit: 'KG',
      loadSemantics: 'ADDED_LOAD',
    };
    expect(CanonicalStrengthSetSchema.safeParse(validDurationAndLoad).success).toBe(true);
  });

  it('supports optional side for unilateral movements', () => {
    const unilateralSet: CanonicalStrengthSetInput = {
      ...baseValidSet,
      measurementMode: 'LOAD_AND_REPS',
      load: 24,
      loadUnit: 'KG',
      loadSemantics: 'PER_HAND',
      reps: 10,
      side: 'LEFT',
    };
    const parsed = CanonicalStrengthSetSchema.parse(unilateralSet);
    expect(parsed.side).toBe('LEFT');
  });
});
