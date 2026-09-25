'use client';

import { useState } from 'react';
import type { PerformedExerciseState } from '@/features/live-forge/active-strength-session';
import type {
  CanonicalStrengthSetInput,
  MeasurementMode,
  SetSide,
} from '@/features/strength-evidence/write-contract';
import { Dumbbell, Check, ArrowRight, X } from 'lucide-react';

interface MobileStrengthLoggerProps {
  exercise: PerformedExerciseState;
  exerciseIndex: number;
  totalExercises: number;
  onSaveSet: (setInput: CanonicalStrengthSetInput) => Promise<void> | void;
  onKlarForIdag: () => void;
  onNextExercise: () => void;
  onPreviousExercise: () => void;
  previousPerformance?: { load?: number; reps?: number } | null;
  isSaving?: boolean;
}

function generateClientWriteId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `write-${Date.now()}-${Math.random()}`;
}

export function MobileStrengthLogger({
  exercise,
  exerciseIndex,
  totalExercises,
  onSaveSet,
  onKlarForIdag,
  onNextExercise,
  onPreviousExercise,
  previousPerformance,
  isSaving = false,
}: MobileStrengthLoggerProps) {
  // Input fields dynamically presented based on measurementMode
  const mode: MeasurementMode = exercise.measurementMode;
  const isWeighted = mode === 'LOAD_AND_REPS' || mode === 'DURATION_AND_LOAD';
  const hasReps = mode === 'LOAD_AND_REPS' || mode === 'REPS_ONLY';
  const hasDuration = mode === 'DURATION' || mode === 'DURATION_AND_LOAD';
  const isUnilateral = Boolean(exercise.unilateral);

  const [load, setLoad] = useState<string>(
    previousPerformance?.load !== undefined ? String(previousPerformance.load) : ''
  );
  const [reps, setReps] = useState<string>(
    previousPerformance?.reps !== undefined ? String(previousPerformance.reps) : ''
  );
  const [duration, setDuration] = useState<string>('30');
  const [side, setSide] = useState<SetSide>('LEFT');
  const [rpe, setRpe] = useState<string>(''); // Optional, default empty
  const [showRpeInput, setShowRpeInput] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Maintain a stable clientWriteId per pending set attempt
  const [pendingClientWriteId, setPendingClientWriteId] = useState<string>(() =>
    generateClientWriteId()
  );

  const nextSetNumber = exercise.sets.length + 1;

  async function handleSaveSet() {
    setErrorMessage(null);

    const setInput: CanonicalStrengthSetInput = {
      performedExerciseId: exercise.exerciseId,
      clientWriteId: pendingClientWriteId,
      measurementMode: mode,
      completedAt: new Date().toISOString(),
      setType: 'NORMAL',
    };


    if (isWeighted) {
      const parsedLoad = Number.parseFloat(load);
      if (Number.isNaN(parsedLoad) || parsedLoad < 0) {
        setErrorMessage('Ange en giltig belastning (kg)');
        return;
      }
      setInput.load = parsedLoad;
      setInput.loadUnit = 'KG';
      setInput.loadSemantics = 'TOTAL_EXTERNAL_LOAD';
    }

    if (hasReps) {
      const parsedReps = Number.parseInt(reps, 10);
      if (Number.isNaN(parsedReps) || parsedReps <= 0) {
        setErrorMessage('Ange antal reps');
        return;
      }
      setInput.reps = parsedReps;
    }

    if (hasDuration) {
      const parsedDuration = Number.parseInt(duration, 10);
      if (Number.isNaN(parsedDuration) || parsedDuration <= 0) {
        setErrorMessage('Ange sekunder');
        return;
      }
      setInput.durationSeconds = parsedDuration;
    }

    if (isUnilateral) {
      setInput.side = side;
    }

    // Optional RPE: unknown stays undefined / null
    if (rpe.trim() !== '') {
      const parsedRpe = Number.parseFloat(rpe);
      if (!Number.isNaN(parsedRpe) && parsedRpe >= 1 && parsedRpe <= 10) {
        setInput.rpe = parsedRpe;
      }
    }

    try {
      await onSaveSet(setInput);
      // Upon successful save, regenerate the clientWriteId for the next set
      setPendingClientWriteId(generateClientWriteId());
      // Toggle side for next unilateral set
      if (isUnilateral) {
        setSide((prev) => (prev === 'LEFT' ? 'RIGHT' : 'LEFT'));
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Kunde inte spara set');
    }
  }

  return (
    <div
      data-testid="mobile-strength-logger"
      className="flex flex-col min-h-[520px] max-w-sm mx-auto bg-zinc-950 text-white p-4 rounded-2xl border border-zinc-800 shadow-2xl justify-between"
    >
      {/* Top Header / Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
          <span>
            ÖVNING {exerciseIndex + 1} AV {totalExercises}
          </span>
          <span className="bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">
            SET {nextSetNumber} / {exercise.prescribedSetsCount}
          </span>
        </div>

        <h2 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
          <Dumbbell className="w-5 h-5 text-orange-500" />
          {exercise.exerciseName}
        </h2>

        {/* Completed Sets Summary */}
        {exercise.sets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {exercise.sets.map((s, idx) => (
              <span
                key={s.clientWriteId || idx}
                className="text-xs bg-zinc-900 border border-zinc-700/60 px-2 py-1 rounded font-mono text-zinc-300"
              >
                {s.side ? (s.side === 'LEFT' ? 'V ' : 'H ') : ''}
                {s.load !== undefined ? `${s.load}kg × ` : ''}
                {s.reps !== undefined ? `${s.reps}r` : ''}
                {s.durationSeconds !== undefined ? `${s.durationSeconds}s` : ''}
                {s.rpe !== undefined ? ` @${s.rpe}` : ''}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Main Single-Action Logging Form */}
      <div className="py-4 space-y-4">
        {errorMessage && (
          <div className="text-xs bg-red-950/80 border border-red-800 text-red-300 p-2 rounded">
            {errorMessage}
          </div>
        )}

        {/* Unilateral toggle if applicable */}
        {isUnilateral && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSide('LEFT')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                side === 'LEFT'
                  ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              }`}
            >
              Vänster sida
            </button>
            <button
              type="button"
              onClick={() => setSide('RIGHT')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                side === 'RIGHT'
                  ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              }`}
            >
              Höger sida
            </button>
          </div>
        )}

        {/* Fields based on mode: load / reps / duration */}
        <div className="grid grid-cols-2 gap-3">
          {isWeighted && (
            <div className={hasReps ? 'col-span-1' : 'col-span-2'}>
              <label htmlFor="input-load" className="block text-xs uppercase font-mono text-zinc-400 mb-1">
                Vikt (kg)
              </label>
              <input
                id="input-load"
                type="number"
                inputMode="decimal"
                value={load}
                onChange={(e) => setLoad(e.target.value)}
                placeholder="0"
                className="w-full text-2xl font-bold bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center focus:outline-none focus:border-orange-500 font-mono"
              />
            </div>
          )}

          {hasReps && (
            <div className={isWeighted ? 'col-span-1' : 'col-span-2'}>
              <label htmlFor="input-reps" className="block text-xs uppercase font-mono text-zinc-400 mb-1">
                Reps
              </label>
              <input
                id="input-reps"
                type="number"
                inputMode="numeric"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                placeholder="0"
                className="w-full text-2xl font-bold bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center focus:outline-none focus:border-orange-500 font-mono"
              />
            </div>
          )}

          {hasDuration && (
            <div className="col-span-2">
              <label htmlFor="input-duration" className="block text-xs uppercase font-mono text-zinc-400 mb-1">
                Sekunder
              </label>
              <input
                id="input-duration"
                type="number"
                inputMode="numeric"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="Sekunder"
                className="w-full text-2xl font-bold bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center focus:outline-none focus:border-orange-500 font-mono"
              />
            </div>
          )}
        </div>

        {/* Optional RPE accordion */}
        <div className="pt-1">
          {!showRpeInput ? (
            <button
              type="button"
              onClick={() => setShowRpeInput(true)}
              className="text-xs text-zinc-500 hover:text-zinc-300 underline font-mono"
            >
              + Valfri ansträngning (RPE)
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <label htmlFor="input-rpe" className="text-xs font-mono text-zinc-400">
                RPE (1-10):
              </label>
              <input
                id="input-rpe"
                type="number"
                inputMode="decimal"
                step="0.5"
                min="1"
                max="10"
                value={rpe}
                onChange={(e) => setRpe(e.target.value)}
                placeholder="t.ex. 8"
                className="w-20 bg-zinc-900 border border-zinc-800 rounded p-1 text-center font-mono text-sm focus:border-orange-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setRpe('');
                  setShowRpeInput(false);
                }}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Primary Single CTA */}
        <button
          type="button"
          onClick={handleSaveSet}
          disabled={isSaving}
          data-testid="save-set-button"
          className="w-full py-4 bg-orange-600 hover:bg-orange-500 active:scale-[0.98] text-white font-black text-lg uppercase tracking-wide rounded-xl shadow-lg shadow-orange-950/40 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
        >
          <Check className="w-6 h-6 stroke-[3]" />
          {isSaving ? 'Sparar set...' : 'Spara Set'}
        </button>
      </div>

      {/* Bottom Secondary Actions */}
      <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs font-semibold">
        {/* Navigation between exercises */}
        <div className="flex gap-2">
          {exerciseIndex > 0 && (
            <button
              type="button"
              onClick={onPreviousExercise}
              className="text-zinc-400 hover:text-white px-2 py-1 bg-zinc-900 rounded"
            >
              Föregående
            </button>
          )}
          {exerciseIndex < totalExercises - 1 && (
            <button
              type="button"
              onClick={onNextExercise}
              className="text-zinc-300 hover:text-white px-2 py-1 bg-zinc-800 rounded flex items-center gap-1"
            >
              Nästa övning <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Always visible secondary Klar för idag */}
        <button
          type="button"
          onClick={onKlarForIdag}
          data-testid="klar-for-idag-button"
          className="text-zinc-400 hover:text-amber-400 py-1 px-2 font-mono transition-colors"
        >
          Klar för idag
        </button>
      </div>
    </div>
  );
}
