'use client';

import React, { useState, useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Panel,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { setGuildTerritoryTarget } from '@/actions/guild-territories';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AnimatePresence, motion } from 'framer-motion';
import { Crosshair, Info, Shield, Sword, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { TerritoryNode } from './TerritoryNode';

const nodeTypes = {
  territory: TerritoryNode,
};

interface TerritoryMapProps {
  territories: any[];
  userGuildId?: string;
  isLeader?: boolean;
}

export const TerritoryMap = ({ territories, userGuildId, isLeader }: TerritoryMapProps) => {
  const [selectedTerritory, setSelectedTerritory] = useState<any>(null);
  const [isSettingTarget, setIsSettingTarget] = useState(false);

  const initialNodes = useMemo(
    () =>
      territories.map((t) => ({
        id: t.id,
        type: 'territory',
        position: { x: t.coordX * 20, y: t.coordY * 20 }, // Scaling coordinates
        data: {
          ...t,
          controlledByName: t.controlledBy?.name,
          controlledByTag: t.controlledBy?.tag,
          contestCount: t._count?.contestEntries || 0,
          isSelected: selectedTerritory?.id === t.id,
        },
      })),
    [territories, selectedTerritory]
  );

  const [nodes, _setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, _setEdges, _onEdgesChange] = useEdgesState([]);

  // Handle node click
  const onNodeClick = useCallback((_: any, node: any) => {
    setSelectedTerritory(node.data);
  }, []);

  const handleSetTarget = async () => {
    if (!selectedTerritory || !userGuildId) return;

    setIsSettingTarget(true);
    try {
      const result = await setGuildTerritoryTarget(
        userGuildId,
        selectedTerritory.id,
        'current-user-id'
      ); // We'll need the real userId
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.error);
      }
    } catch (_e) {
      toast.error('Failed to set target.');
    } finally {
      setIsSettingTarget(false);
    }
  };

  return (
    <div className="relative w-full h-[700px] bg-slate-950 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        fitView
        className="bg-dot-pattern"
      >
        <Background color="#1e293b" gap={20} />
        <Controls className="!bg-slate-900 !border-slate-800 !text-slate-100" />

        <Panel position="top-left" className="m-4">
          <div className="bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-slate-800 shadow-xl">
            <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
              <Crosshair className="text-red-500" />
              GLOBAL CONQUEST
            </h2>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
              Strategic Operations Center
            </p>
          </div>
        </Panel>

        <Panel position="top-right" className="m-4">
          <div className="flex flex-col gap-2">
            <div className="bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-800 flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">
                Claimed Sector
              </span>
            </div>
            <div className="bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-800 flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)] animate-pulse" />
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">
                Active Contest
              </span>
            </div>
          </div>
        </Panel>
      </ReactFlow>

      {/* Territory Detail Overlay */}
      <AnimatePresence>
        {selectedTerritory && (
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            className="absolute top-0 right-0 h-full w-[350px] bg-slate-900/95 backdrop-blur-2xl border-l border-slate-800 p-6 shadow-2xl z-50 flex flex-col"
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-black text-slate-100 uppercase italic">
                  {selectedTerritory.name}
                </h3>
                <p className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">
                  Sector {selectedTerritory.region}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedTerritory(null)}
                className="hover:bg-white/10"
              >
                <Info className="w-5 h-5 text-slate-500" />
              </Button>
            </div>

            <div className="space-y-6 flex-1">
              {/* Stats Section */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-slate-800/50 border-slate-700 p-3 flex flex-col items-center">
                  <Shield className="w-4 h-4 text-amber-500 mb-1" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Owner</span>
                  <span className="text-xs font-black text-amber-500">
                    {selectedTerritory.controlledByTag
                      ? `[${selectedTerritory.controlledByTag}]`
                      : 'WILD'}
                  </span>
                </Card>
                <Card className="bg-slate-800/50 border-slate-700 p-3 flex flex-col items-center">
                  <Sword className="w-4 h-4 text-red-500 mb-1" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase">
                    Contestants
                  </span>
                  <span className="text-xs font-black text-red-500">
                    {selectedTerritory.contestCount} Guilds
                  </span>
                </Card>
              </div>

              {/* Bonuses Section */}
              <div className="bg-slate-800/30 rounded-2xl p-4 border border-slate-700/50">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Trophy className="w-3 h-3 text-cyan-400" />
                  Territory Bonuses
                </h4>
                <div className="space-y-2">
                  {Object.entries(selectedTerritory.bonuses || {}).map(([key, val]: any) => (
                    <div
                      key={key}
                      className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-lg"
                    >
                      <span className="text-[10px] font-bold text-slate-300 uppercase">{key}</span>
                      <span className="text-xs font-black text-cyan-400">+{val}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contest Leaderboard (Placeholder) */}
              <div className="flex-1 overflow-y-auto">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Sword className="w-3 h-3 text-red-400" />
                  Current Contest
                </h4>
                {selectedTerritory.contestCount === 0 ? (
                  <p className="text-[10px] text-slate-600 italic">
                    No active contests for this sector.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {/* Leaderboard entries would go here */}
                    <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-200 uppercase">
                        Dominion Elite
                      </span>
                      <span className="text-[10px] font-black text-red-400">12.4M PR</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action Section */}
            <div className="mt-6 pt-6 border-t border-slate-800">
              {isLeader ? (
                <Button
                  className="w-full bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest h-12 rounded-xl group shadow-[0_0_20px_rgba(220,38,38,0.3)]"
                  disabled={isSettingTarget}
                  onClick={handleSetTarget}
                >
                  <Sword className="w-4 h-4 mr-2 group-hover:rotate-12 transition-transform" />
                  {isSettingTarget ? 'COMMITTING...' : 'TARGET THIS SECTOR'}
                </Button>
              ) : (
                <div className="text-center p-3 rounded-xl bg-slate-800/50 border border-slate-700">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">
                    Only Guild Leaders can set targets
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
