'use client';

import { motion } from 'framer-motion';
import { Play, Settings2 } from 'lucide-react';
import type React from 'react';

interface TodaysMissionProps {
  missionTitle?: string;
  missionTime?: string;
  equipmentSetup?: string;
  exerciseName?: string;
  isQuietMode?: boolean;
  onLaunch: () => void;
  onToggleMode: () => void;
}

export const TodaysMission: React.FC<TodaysMissionProps> = ({
  missionTitle = 'BATTLE READY',
  missionTime = '06:15',
  equipmentSetup = 'Red 8',
  exerciseName = 'Back Extension',
  isQuietMode = false,
  onLaunch,
  onToggleMode,
}) => {
  return (
    <div
      className="flex flex-col items-center justify-center space-y-8 py-10 animate-fade-in max-w-lg mx-auto"
      data-testid="todays-mission"
    >
      {/* Mechanical Header */}
      <div className="w-full border-b border-slate-800 pb-4 text-center">
        <h2 className="text-slate-500 font-mono text-xs tracking-[0.3em] uppercase mb-1">
          {missionTime} Mission Status: Active
        </h2>
        <h1 className="text-3xl font-black text-white tracking-widest uppercase italic">
          {missionTitle}
        </h1>
      </div>

      {/* Central Launch Core */}
      <div className="relative group">
        {/* Pulsing Aura */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 3,
            repeat: Number.POSITIVE_INFINITY,
            ease: 'easeInOut',
          }}
          className={`absolute inset-0 rounded-full blur-2xl ${
            isQuietMode ? 'bg-emerald-500/20' : 'bg-orange-600/30'
          }`}
        />

        <button
          onClick={onLaunch}
          className={`
            relative z-10 w-48 h-48 rounded-full border-4 flex flex-col items-center justify-center transition-all duration-500
            ${
              isQuietMode
                ? 'bg-emerald-950/80 border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:shadow-[0_0_50px_rgba(16,185,129,0.5)]'
                : 'bg-orange-950/80 border-orange-600 shadow-[0_0_30px_rgba(234,88,12,0.3)] hover:shadow-[0_0_50px_rgba(234,88,12,0.5)]'
            }
          `}
        >
          <motion.div
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="flex flex-col items-center"
          >
            <Play
              className={`w-12 h-12 mb-2 ${isQuietMode ? 'text-emerald-400' : 'text-orange-500'}`}
              fill="currentColor"
            />
            <span className="text-xs font-mono font-bold tracking-widest text-white uppercase">
              Launch Sequence
            </span>
          </motion.div>
        </button>
      </div>

      {/* Equipment Bezel */}
      <div className="w-full bg-slate-900/50 border border-slate-800 rounded-lg p-6 backdrop-blur-sm relative overflow-hidden">
        {/* Bezel Corner accents */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-slate-600" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-slate-600" />
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-slate-600" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-slate-600" />

        <div className="flex items-start gap-4">
          <div
            className={`p-2 rounded bg-slate-800 ${isQuietMode ? 'text-emerald-400' : 'text-orange-500'}`}
          >
            <Settings2 size={20} />
          </div>
          <div className="flex-1">
            <h3 className="text-slate-400 text-[10px] font-mono uppercase tracking-wider mb-1">
              Ready Setup: 01
            </h3>
            <p className="text-lg font-bold text-white uppercase tracking-tight">{exerciseName}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-2 py-0.5 rounded bg-red-950 text-red-500 text-[10px] font-mono font-bold border border-red-900/50">
                SETTING: {equipmentSetup}
              </span>
              <span className="text-slate-600 text-[10px] font-mono">|</span>
              <span className="text-slate-500 text-[10px] font-mono">Standard Bezel v2</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex items-center gap-4 w-full">
        <button
          onClick={onToggleMode}
          className={`
            flex-1 p-3 rounded border text-[10px] font-mono uppercase tracking-widest transition-all
            ${
              isQuietMode
                ? 'bg-slate-900 border-emerald-500 text-emerald-400'
                : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'
            }
          `}
        >
          {isQuietMode ? 'Quiet Mode Active' : 'Ready for Combat'}
        </button>
        <div className="flex gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <div
            className={`w-2 h-2 rounded-full ${isQuietMode ? 'bg-slate-800' : 'bg-orange-600 animate-pulse'}`}
          />
        </div>
      </div>

      {/* Compliance Indicator */}
      <div className="flex justify-between w-full opacity-40">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className={`w-3 h-1 ${i < 5 ? (isQuietMode ? 'bg-emerald-500' : 'bg-orange-600') : 'bg-slate-800'}`}
            />
          ))}
        </div>
        <span className="text-[8px] font-mono text-slate-500 uppercase">
          AuDHD Optimization Unit v4.2
        </span>
      </div>
    </div>
  );
};
