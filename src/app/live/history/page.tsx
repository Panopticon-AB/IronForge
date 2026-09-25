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
          <div className="space-y-3" data-testid="completed-sessions-list">
            {history.map((sess) => (
              <div
                key={sess.id}
                data-testid={`history-session-${sess.sessionId}`}
                className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-all space-y-2.5"
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
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-zinc-800/80">
                    {sess.exercises.map((ex) => (
                      <span
                        key={ex.exerciseName}
                        className="text-[11px] bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-zinc-300 font-mono"
                      >
                        {ex.exerciseName}: {ex.setsCount} set
                      </span>
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
