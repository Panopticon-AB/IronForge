'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ActiveStrengthSession } from '@/features/live-forge/active-strength-session';
import type { CanonicalStrengthSetInput } from '@/features/strength-evidence/write-contract';
import { MobileStrengthLogger } from '@/components/logger/MobileStrengthLogger';
import {
  finishStrengthSessionAction,
  logStrengthSetAction,
  startStrengthSessionAction,
} from '@/actions/live-forge/core';
import { Dumbbell, History, Play, Sparkles, CheckCircle2 } from 'lucide-react';

interface LiveForgeContainerProps {
  initialSession: ActiveStrengthSession | null;
}

export function LiveForgeContainer({ initialSession }: LiveForgeContainerProps) {
  const router = useRouter();
  const [session, setSession] = useState<ActiveStrengthSession | null>(initialSession);
  const [activeExerciseIndex, setActiveExerciseIndex] = useState<number>(
    initialSession?.activeExerciseIndex ?? 0
  );
  const [isStarting, setIsStarting] = useState(false);
  const [isSavingSet, setIsSavingSet] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isMinimumVariant, setIsMinimumVariant] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If no active session, show the start workout picker (A1 prominent)
  if (!session || session.status !== 'ACTIVE') {
    return (
      <div className="flex flex-col min-h-[580px] max-w-sm mx-auto bg-zinc-950 text-white p-5 rounded-2xl border border-zinc-800 shadow-2xl justify-between">
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
            <span>LIVE FORGE • STRENGTH</span>
            <Link
              href="/live/history"
              className="flex items-center gap-1 text-orange-400 hover:text-orange-300 transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              Historik
            </Link>
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <Dumbbell className="w-6 h-6 text-orange-500" />
              Styrkelogg
            </h1>
            <p className="text-xs text-zinc-400">
              Välj pass för att starta eller återuppta en session. Alla genomförda set sparas direkt
              och säkert.
            </p>
          </div>

          {errorMessage && (
            <div className="text-xs bg-red-950/80 border border-red-800 text-red-300 p-2.5 rounded-lg">
              {errorMessage}
            </div>
          )}

          {/* Primary Recommended: A1 */}
          <div className="p-4 rounded-xl bg-gradient-to-b from-zinc-900 to-zinc-900/60 border border-orange-500/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-orange-400 bg-orange-950/50 border border-orange-800/60 px-2 py-0.5 rounded">
                REKOMMENDERAT
              </span>
              <span className="text-xs text-zinc-400 font-mono">5 ÖVNINGAR</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">A1 — Belt Squat + Base Upper Body</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Knee-dominant lower body plus simple push/pull/core.
              </p>
            </div>

            {/* Minimum Variant Toggle */}
            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={isMinimumVariant}
                onChange={(e) => setIsMinimumVariant(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-orange-600 focus:ring-orange-500"
              />
              <span>Minimum-variant (kortare pass vid tidsbrist)</span>
            </label>

            <button
              type="button"
              data-testid="start-a1-button"
              disabled={isStarting}
              onClick={async () => {
                setIsStarting(true);
                setErrorMessage(null);
                try {
                  const started = await startStrengthSessionAction({
                    templateCode: 'A1',
                    isMinimumVariant,
                  });
                  setSession(started);
                  setActiveExerciseIndex(started.activeExerciseIndex);
                } catch (err: any) {
                  setErrorMessage(err?.message || 'Kunde inte starta A1');
                } finally {
                  setIsStarting(false);
                }
              }}
              className="w-full py-3.5 bg-orange-600 hover:bg-orange-500 active:scale-[0.98] text-white font-black text-sm uppercase tracking-wide rounded-xl shadow-lg shadow-orange-950/40 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-white" />
              {isStarting ? 'Startar A1...' : 'Starta A1'}
            </button>
          </div>

          {/* Secondary templates */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {(['B1', 'A2', 'B2'] as const).map((code) => (
              <button
                key={code}
                type="button"
                disabled={isStarting}
                onClick={async () => {
                  setIsStarting(true);
                  setErrorMessage(null);
                  try {
                    const started = await startStrengthSessionAction({
                      templateCode: code,
                      isMinimumVariant,
                    });
                    setSession(started);
                    setActiveExerciseIndex(started.activeExerciseIndex);
                  } catch (err: any) {
                    setErrorMessage(err?.message || `Kunde inte starta ${code}`);
                  } finally {
                    setIsStarting(false);
                  }
                }}
                className="py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-xs font-mono font-bold text-zinc-300 hover:text-white transition-all text-center disabled:opacity-50"
              >
                Pass {code}
              </button>
            ))}
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500 font-mono">
          <span>Durable PostgreSQL sync</span>
          <span className="flex items-center gap-1 text-emerald-400/80">
            <CheckCircle2 className="w-3.5 h-3.5" /> Redo
          </span>
        </div>
      </div>
    );
  }

  // Active workout view
  const currentExercise = session.performedExercises[activeExerciseIndex];
  if (!currentExercise) {
    return (
      <div className="max-w-sm mx-auto p-4 bg-zinc-950 text-white rounded-xl border border-zinc-800 text-center">
        <p className="text-sm text-zinc-400">Övning saknas eller index ur synk.</p>
        <button
          type="button"
          onClick={() => setActiveExerciseIndex(0)}
          className="mt-3 px-3 py-1.5 bg-orange-600 rounded text-xs"
        >
          Återställ övning
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {errorMessage && (
        <div className="max-w-sm mx-auto text-xs bg-red-950/80 border border-red-800 text-red-300 p-2.5 rounded-lg">
          {errorMessage}
        </div>
      )}

      <MobileStrengthLogger
        exercise={currentExercise}
        exerciseIndex={activeExerciseIndex}
        totalExercises={session.performedExercises.length}
        isSaving={isSavingSet}
        onSaveSet={async (setInput: CanonicalStrengthSetInput) => {
          setIsSavingSet(true);
          setErrorMessage(null);
          try {
            const result = await logStrengthSetAction({
              sessionId: session.sessionId,
              exerciseIndex: activeExerciseIndex,
              performedExerciseId: currentExercise.exerciseId,
              exerciseName: currentExercise.exerciseName,
              setInput,
            });

            if (result.status === 'INVALID_INPUT') {
              throw new Error(result.error);
            }

            // If persisted, update state optimistically with the canonical set
            if (result.status === 'PERSISTED') {
              const updatedSet = result.set;
              setSession((prev) => {
                if (!prev) return null;
                const nextExercises = prev.performedExercises.map((e, idx) => {
                  if (idx !== activeExerciseIndex) return e;
                  return {
                    ...e,
                    sets: [...e.sets, updatedSet],
                  };
                });
                return {
                  ...prev,
                  performedExercises: nextExercises,
                  updatedAt: updatedSet.completedAt,
                  revision: prev.revision + 1,
                };
              });
            }
          } catch (err: any) {
            setErrorMessage(err?.message || 'Ett fel uppstod vid sparande av set');
            throw err;
          } finally {
            setIsSavingSet(false);
          }
        }}
        onKlarForIdag={async () => {
          if (isFinishing) return;
          setIsFinishing(true);
          setErrorMessage(null);
          try {
            const finished = await finishStrengthSessionAction({
              sessionId: session.sessionId,
              explicitKlarForIdag: true,
            });
            setSession(finished);
            router.push('/live/history');
          } catch (err: any) {
            setErrorMessage(err?.message || 'Kunde inte avsluta passet');
            setIsFinishing(false);
          }
        }}
        onNextExercise={() => {
          if (activeExerciseIndex < session.performedExercises.length - 1) {
            setActiveExerciseIndex((prev) => prev + 1);
          }
        }}
        onPreviousExercise={() => {
          if (activeExerciseIndex > 0) {
            setActiveExerciseIndex((prev) => prev - 1);
          }
        }}
      />
    </div>
  );
}
