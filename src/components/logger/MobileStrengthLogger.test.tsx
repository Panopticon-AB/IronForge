import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MobileStrengthLogger } from './MobileStrengthLogger';
import type { PerformedExerciseState } from '@/features/live-forge/active-strength-session';

describe('MobileStrengthLogger', () => {
  const sampleBeltSquat: PerformedExerciseState = {
    exerciseId: 'belt-squat',
    exerciseName: 'Belt Squat',
    sequence: 0,
    measurementMode: 'LOAD_AND_REPS',
    prescribedSetsCount: 3,
    sets: [],
  };

  const sampleAbWheel: PerformedExerciseState = {
    exerciseId: 'ab-wheel',
    exerciseName: 'Ab Wheel',
    sequence: 4,
    measurementMode: 'REPS_ONLY',
    prescribedSetsCount: 2,
    sets: [],
  };

  it('renders single primary CTA and relevant fields for LOAD_AND_REPS', () => {
    const handleSaveSet = vi.fn();
    const handleKlar = vi.fn();

    render(
      <MobileStrengthLogger
        exercise={sampleBeltSquat}
        exerciseIndex={0}
        totalExercises={5}
        onSaveSet={handleSaveSet}
        onKlarForIdag={handleKlar}
        onNextExercise={vi.fn()}
        onPreviousExercise={vi.fn()}
      />
    );

    expect(screen.getByText('Belt Squat')).toBeDefined();
    expect(screen.getByLabelText(/Vikt \(kg\)/i)).toBeDefined();
    expect(screen.getByLabelText(/Reps/i)).toBeDefined();
    expect(screen.queryByLabelText(/Sekunder/i)).toBeNull();
    expect(screen.getByTestId('save-set-button')).toBeDefined();
    expect(screen.getByTestId('klar-for-idag-button')).toBeDefined();
  });

  it('renders reps-only mode without load input for REPS_ONLY movements', () => {
    render(
      <MobileStrengthLogger
        exercise={sampleAbWheel}
        exerciseIndex={4}
        totalExercises={5}
        onSaveSet={vi.fn()}
        onKlarForIdag={vi.fn()}
        onNextExercise={vi.fn()}
        onPreviousExercise={vi.fn()}
      />
    );

    expect(screen.getByText('Ab Wheel')).toBeDefined();
    expect(screen.getByLabelText(/Reps/i)).toBeDefined();
    expect(screen.queryByLabelText(/Vikt \(kg\)/i)).toBeNull();
  });

  it('logs a set with clientWriteId and does not fabricate missing RPE', async () => {
    const handleSaveSet = vi.fn();

    render(
      <MobileStrengthLogger
        exercise={sampleBeltSquat}
        exerciseIndex={0}
        totalExercises={5}
        onSaveSet={handleSaveSet}
        onKlarForIdag={vi.fn()}
        onNextExercise={vi.fn()}
        onPreviousExercise={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/Vikt \(kg\)/i), { target: { value: '85' } });
    fireEvent.change(screen.getByLabelText(/Reps/i), { target: { value: '8' } });

    fireEvent.click(screen.getByTestId('save-set-button'));

    expect(handleSaveSet).toHaveBeenCalledTimes(1);
    const setArg = handleSaveSet.mock.calls[0][0];
    expect(setArg.load).toBe(85);
    expect(setArg.reps).toBe(8);
    expect(setArg.clientWriteId).toBeDefined();
    expect(setArg.rpe).toBeUndefined(); // Unknown RPE remains undefined
  });

  it('triggers Klar för idag directly when selected', () => {
    const handleKlar = vi.fn();

    render(
      <MobileStrengthLogger
        exercise={sampleBeltSquat}
        exerciseIndex={0}
        totalExercises={5}
        onSaveSet={vi.fn()}
        onKlarForIdag={handleKlar}
        onNextExercise={vi.fn()}
        onPreviousExercise={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('klar-for-idag-button'));
    expect(handleKlar).toHaveBeenCalledTimes(1);
  });
});
