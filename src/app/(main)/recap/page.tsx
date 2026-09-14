'use client';

import { TitanWeeklyRecap } from '@/remotion/TitanWeeklyRecap';
import dynamic from 'next/dynamic';
import { useState } from 'react';

const Player = dynamic(() => import('@remotion/player').then((mod) => mod.Player), {
  ssr: false,
  loading: () => (
    <div className="w-[960px] max-w-[90vw] aspect-video bg-white/5 animate-pulse flex items-center justify-center rounded-2xl border border-white/10">
      <span className="text-zinc-500 font-mono text-sm tracking-widest uppercase">
        Initializing Titan Visuals...
      </span>
    </div>
  ),
});

// Mock data (will be replaced with real API data later)
const defaultRecapData = {
  username: 'Valhallan',
  weekNumber: 9,
  strengthGains: 2450,
  xpEarned: 12800,
  workoutsLogged: 5,
  monstersDefeated: 3,
  streakDays: 14,
};

export default function RecapPage() {
  const [_isPlaying, _setIsPlaying] = useState(false);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center gap-8 p-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-black bg-gradient-to-r from-green-400 to-cyan-400 bg-clip-text text-transparent">
          ⚔️ Titan Recap Studio
        </h1>
        <p className="text-slate-400 text-sm">
          Förhandsgranska din veckorapport — snart som delbar video.
        </p>
      </div>

      {/* Player Container */}
      <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-green-500/5">
        <Player
          component={TitanWeeklyRecap as React.FC<any>}
          inputProps={defaultRecapData}
          durationInFrames={150}
          compositionWidth={1280}
          compositionHeight={720}
          fps={30}
          style={{ width: '960px', maxWidth: '90vw' }}
          controls
          autoPlay={false}
          loop
        />
      </div>

      {/* Info Cards */}
      <div className="flex gap-4 text-sm text-slate-500 mt-4">
        <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">
          📐 1280×720 @ 30fps
        </div>
        <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">🎬 5 sekunder</div>
        <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">🔮 Remotion v4</div>
      </div>
    </div>
  );
}
