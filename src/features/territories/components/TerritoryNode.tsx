'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Castle, Shield, Target, Zap, Sword } from 'lucide-react';
import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

const TYPE_ICONS = {
  FORTRESS: Castle,
  RESOURCE_NODE: Zap,
  TRAINING_GROUNDS: Target,
  VANTAGE_POINT: Shield,
};

export const TerritoryNode = memo(({ data }: any) => {
  const Icon = TYPE_ICONS[data.type as keyof typeof TYPE_ICONS] || Target;
  const isControlled = !!data.controlledById;
  const contestCount = data.contestCount || 0;

  return (
    <div className="relative group">
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />

      <motion.div
        whileHover={{ scale: 1.05 }}
        className={cn(
          'relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all duration-500',
          'w-48 h-48 bg-slate-900/80 backdrop-blur-xl shadow-2xl',
          isControlled
            ? 'border-amber-500/50 shadow-amber-500/20'
            : 'border-slate-700/50 shadow-slate-900/50',
          contestCount > 0 && 'border-red-500/50 animate-pulse'
        )}
      >
        {/* Glow Effect */}
        <div
          className={cn(
            'absolute inset-0 rounded-2xl blur-xl transition-opacity duration-500 opacity-20',
            isControlled ? 'bg-amber-500' : 'bg-slate-700',
            contestCount > 0 && 'bg-red-500 opacity-40'
          )}
        />

        {/* Territory Icon */}
        <div
          className={cn(
            'p-3 rounded-xl mb-3 z-10',
            isControlled ? 'bg-amber-500/20 text-amber-500' : 'bg-slate-800 text-slate-400'
          )}
        >
          <Icon className="w-8 h-8" />
        </div>

        {/* Name & Region */}
        <div className="text-center z-10">
          <h3 className="font-bold text-slate-100 text-sm tracking-tight uppercase leading-tight">
            {data.name}
          </h3>
          <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest mt-1">
            {data.region}
          </p>
        </div>

        {/* Owner Info */}
        <div className="mt-4 z-10 flex flex-col items-center">
          {isControlled ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30">
              <span className="text-[10px] font-bold text-amber-500">[{data.controlledByTag}]</span>
              <span className="text-[9px] text-amber-200/70 font-medium truncate max-w-[80px]">
                {data.controlledByName}
              </span>
            </div>
          ) : (
            <span className="text-[10px] text-slate-600 font-bold tracking-widest italic">
              UNCLAIMED
            </span>
          )}
        </div>

        {/* Contest Badge */}
        {contestCount > 0 && (
          <div className="absolute -top-2 -right-2 flex items-center gap-1 bg-red-600 text-white px-2 py-1 rounded-lg shadow-lg z-20 border border-red-400/50">
            <Sword className="w-3 h-3" />
            <span className="text-[10px] font-black">{contestCount}</span>
          </div>
        )}

        {/* Selection Indicator */}
        {data.isSelected && (
          <motion.div
            layoutId="selection"
            className="absolute -inset-1 border-2 border-cyan-400 rounded-3xl z-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />
        )}
      </motion.div>
    </div>
  );
});

TerritoryNode.displayName = 'TerritoryNode';
