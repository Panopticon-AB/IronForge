'use client';

import { Coins, Zap } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

interface QuickStatsHeaderProps {
  level: number;
  currentXP: number;
  maxXP: number;
  gold: number;
}

export function QuickStatsHeader({ level, currentXP, maxXP, gold }: QuickStatsHeaderProps) {
  const xpPercentage = Math.min((currentXP / maxXP) * 100, 100);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
        {/* Left: Level Badge */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-purple-900 border-2 border-purple-400 flex items-center justify-center shadow-lg shadow-purple-500/50">
              <span className="text-white font-black text-lg">{level}</span>
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full border-2 border-zinc-950 flex items-center justify-center">
              <Zap className="w-2.5 h-2.5 text-zinc-950" />
            </div>
          </div>

          {/* XP Bar */}
          <div className="flex flex-col gap-1 min-w-[100px] sm:min-w-[140px]">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] sm:text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Lvl {level}
              </span>
              <span className="text-[10px] sm:text-xs text-zinc-400 font-mono">
                {currentXP}/{maxXP}
              </span>
            </div>
            <div className="h-2 bg-zinc-900 rounded-full border border-zinc-700 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-purple-700 transition-all duration-500 ease-out shadow-[0_0_8px_rgba(168,85,247,0.6)]"
                style={{ width: `${xpPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Right: Gold */}
        <Link
          href="/armory"
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900/80 border border-zinc-700 rounded-lg hover:bg-zinc-800 hover:border-yellow-600/50 transition-all group"
        >
          <Coins className="w-5 h-5 text-yellow-500 group-hover:text-yellow-400 transition-colors" />
          <span className="font-bold text-yellow-500 group-hover:text-yellow-400 text-lg tabular-nums">
            {gold.toLocaleString()}
          </span>
        </Link>
      </div>
    </header>
  );
}
