'use client';

import { unlockSkillNodeAction } from '@/actions/training/neural-lattice';
import { useState } from 'react';
import { toast } from 'sonner';
import { NEURAL_LATTICE_DATA } from '../data';
import { NeuralLatticeVisual } from './NeuralLatticeVisual';

interface NeuralLatticeClientProps {
  unlockedSkillIds: string[];
  currentKS: number;
  currentTP: number;
}

export const NeuralLatticeClient = ({
  unlockedSkillIds,
  currentKS,
  currentTP,
}: NeuralLatticeClientProps) => {
  const [optimisticUnlocks, setOptimisticUnlocks] = useState<Set<string>>(
    new Set(unlockedSkillIds)
  );
  const [pendingNode, setPendingNode] = useState<string | null>(null);

  const handleUnlock = async (nodeId: string) => {
    const node = NEURAL_LATTICE_DATA.find((n) => n.id === nodeId);
    if (!node) return;

    // Fast fail UI validations
    if (optimisticUnlocks.has(nodeId)) {
      toast.info('Node already unlocked.');
      return;
    }

    if (currentKS < node.costKS || currentTP < node.costTP) {
      toast.error('Insufficient resources.');
      return;
    }

    if (node.connections.length > 0) {
      const hasConnection = node.connections.some((c) => optimisticUnlocks.has(c));
      if (!hasConnection) {
        toast.error('Must unlock an adjacent node first.');
        return;
      }
    }

    setPendingNode(nodeId);

    // Server action
    const res = await unlockSkillNodeAction({ nodeId });

    if (res?.data?.success) {
      toast.success(`Unlocked ${node.name}!`);
      setOptimisticUnlocks((prev) => new Set([...prev, nodeId]));
    } else {
      toast.error(res?.serverError || 'Failed to unlock node.');
    }
    setPendingNode(null);
  };

  return (
    <div className="w-full h-full flex flex-col bg-void text-white relative">
      <div className="absolute top-4 left-4 z-10 p-4 border border-steel rounded-lg bg-black/60 backdrop-blur">
        <h2 className="text-xl font-bold mb-2 uppercase tracking-wide text-teal-glow">
          Neural Lattice
        </h2>
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between items-center gap-4">
            <span className="text-steel">Kinetic Shards (KS):</span>
            <span className="font-mono text-plasma">{currentKS}</span>
          </div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-steel">Talent Points (TP):</span>
            <span className="font-mono text-emerald-glow">{currentTP}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-[600px] overflow-hidden rounded-xl border border-steel/50 bg-black relative">
        <NeuralLatticeVisual
          nodes={NEURAL_LATTICE_DATA}
          unlockedIds={optimisticUnlocks}
          onNodeClick={handleUnlock}
          pendingNodeId={pendingNode}
        />
      </div>
    </div>
  );
};
