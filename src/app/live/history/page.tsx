import Link from 'next/link';
import { getStrengthSessionHistoryAction } from '@/actions/live-forge/core';
import { ArrowLeft, Calendar, CheckCircle2, Dumbbell } from 'lucide-react';

export const metadata = {
  title: 'Historik — Live Forge',
  description: 'Genomförda styrkepass från Live Forge',
};

export const dynamic = 'force-dynamic';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatCanonicalSet(set: any): string {
  const parts: string[] = [];

  if (set.side) {
    parts.push(set.side === 'LEFT' ? 'V' : set.side === 'RIGHT' ? 'H' : 'Bilateral');
  }

  switch (set.measurementMode) {
    case 'LOAD_AND_REPS': {
      const loadStr =
        set.load !== undefined ? `${set.load} ${set.loadUnit?.toLowerCase() || 'kg'}` : '';
      const repsStr = set.reps !== undefined ? `${set.reps}` : '';
      if (loadStr && repsStr) parts.push(`${loadStr} × ${repsStr}`);
      else if (repsStr) parts.push(`${repsStr} reps`);
      else if (loadStr) parts.push(loadStr);
      break;
    }
    case 'REPS_ONLY': {
      if (set.reps !== undefined) parts.push(`${set.reps} reps`);
      break;
    }
    case 'DURATION': {
      if (set.durationSeconds !== undefined) parts.push(`${set.durationSeconds} s`);
      break;
    }
    case 'DURATION_AND_LOAD': {
      const durStr = set.durationSeconds !== undefined ? `${set.durationSeconds} s` : '';
      const loadStr =
        set.load !== undefined ? `${set.load} ${set.loadUnit?.toLowerCase() || 'kg'}` : '';
      if (durStr && loadStr) parts.push(`${durStr} (${loadStr})`);
      else if (durStr) parts.push(durStr);
      break;
    }
    default: {
      if (set.reps !== undefined) parts.push(`${set.reps} reps`);
      break;
    }
  }

  if (set.rpe !== undefined) {
    parts.push(`@${set.rpe}`);
  }

  return parts.join(' ');
}

export default async function LiveForgeHistoryPage() {
  const history = await getStrengthSessionHistoryAction();

  return (
    <main className="min-h-screen bg-black text-white px-3 py-6 flex flex-col items-center">
      <div className="w-full max-w-md space-y-4">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/live"
            className="flex items-center gap-1 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Tillbaka till logg
          </Link>
          <span className="text-xs font-mono text-zinc-500">LIVE FORGE HISTORY</span>
        </div>

        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
            <Dumbbell className="w-6 h-6 text-orange-500" />
            Träningshistorik
          </h1>
          <p className="text-xs text-zinc-400">
            Sparade och fullbordade styrkepass från mobilloggen.
          </p>
        </div>

        {/* Sessions list */}
        {history.length === 0 ? (
          <div className="p-8 text-center bg-zinc-950 rounded-2xl border border-zinc-800 space-y-3">
            <p className="text-sm text-zinc-400">Inga sparade pass ännu.</p>
            <Link
              href="/live"
              className="inline-block py-2 px-4 bg-orange-600 hover:bg-orange-500 text-xs font-bold uppercase rounded-lg text-white transition-all"
            >
              Starta första passet
            </Link>
          </div>
        ) : (
          <div className="space-y-4" data-testid="completed-sessions-list">
            {history.map((sess) => (
              <div
                key={sess.id}
                data-testid={`history-session-${sess.sessionId}`}
                className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-all space-y-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-zinc-400 font-mono">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatDate(sess.startedAt)}</span>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/80 text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {sess.outcome}
                  </span>
                </div>

                <div className="flex items-baseline justify-between">
                  <h2 className="text-base font-bold text-white tracking-tight">{sess.title}</h2>
                  <span className="text-xs font-mono text-zinc-400">
                    {sess.totalSets} set sparade
                  </span>
                </div>

                {sess.exercises.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                    {sess.exercises.map((ex) => (
                      <div
                        key={ex.exerciseId}
                        data-testid={`history-exercise-${ex.exerciseId}`}
                        className="space-y-1"
                      >
                        <div className="text-xs font-bold text-zinc-300 font-mono flex items-center gap-1">
                          <span className="text-orange-500">•</span>
                          {ex.exerciseName}
                        </div>
                        <div className="flex flex-wrap gap-1.5 pl-3">
                          {ex.sets.map((set, setIdx) => (
                            <span
                              key={set.clientWriteId || set.id || setIdx}
                              data-testid="history-set-item"
                              className="text-xs bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-zinc-200 font-mono"
                            >
                              {formatCanonicalSet(set)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
