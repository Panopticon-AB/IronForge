'use client';

import { toggleEquipAction } from '@/actions/economy/inventory';
import type { EquipmentType } from '@/types/prisma';
import { useState } from 'react';

interface InventoryItem {
  item: {
    id: string;
    name: string;
    description: string;
    image: string | null;
    power: number;
    rarity: string;
    equipmentType: EquipmentType | null;
  };
  equipped: boolean;
  equipmentId: string; // The Item ID
}

interface InventoryListProps {
  initialInventory: InventoryItem[];
}

export function InventoryList({ initialInventory }: InventoryListProps) {
  const [items, setItems] = useState(initialInventory);
  const [loading, setLoading] = useState<string | null>(null);

  const handleToggle = async (itemId: string, currentState: boolean) => {
    setLoading(itemId);
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.equipmentId === itemId ? { ...i, equipped: !currentState } : i))
    );

    const res = await toggleEquipAction({ equipmentId: itemId, isEquipping: !currentState });

    if (!res?.data?.success) {
      // Revert on failure
      setItems((prev) =>
        prev.map((i) => (i.equipmentId === itemId ? { ...i, equipped: currentState } : i))
      );
      alert(res?.serverError || 'Failed to update equipment');
    }
    setLoading(null);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((entry) => (
        <div
          key={entry.equipmentId}
          className={`
                        relative p-4 rounded-xl border-2 transition-all
                        ${
                          entry.equipped
                            ? 'border-amber-500 bg-amber-950/20 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                            : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                        }
                    `}
        >
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className={`font-bold ${getRarityColor(entry.item.rarity)}`}>
                {entry.item.name}
              </h3>
              <span className="text-xs text-zinc-500 uppercase tracking-wider">
                {entry.item.equipmentType?.replace('_', ' ') || 'No Effect'}
              </span>
            </div>
            <button
              onClick={() => handleToggle(entry.equipmentId, entry.equipped)}
              disabled={loading === entry.equipmentId}
              className={`
                                px-3 py-1 rounded-full text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-plasma focus-visible:outline-none
                                ${
                                  entry.equipped
                                    ? 'bg-amber-500 text-black hover:bg-amber-400'
                                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                }
                            `}
            >
              {loading === entry.equipmentId ? 'Syncing...' : entry.equipped ? 'EQUIPPED' : 'EQUIP'}
            </button>
          </div>

          <p className="text-sm text-zinc-400 mb-4 h-10 line-clamp-2">{entry.item.description}</p>

          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
            <span className="text-amber-500">⚡ {entry.item.power} PWR</span>
            {/* Add more stats here */}
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <div className="col-span-full text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
          <p>Your Armory is empty.</p>
        </div>
      )}
    </div>
  );
}

function getRarityColor(rarity: string) {
  switch (rarity.toLowerCase()) {
    case 'legendary':
      return 'text-orange-500';
    case 'epic':
      return 'text-purple-500';
    case 'rare':
      return 'text-blue-500';
    default:
      return 'text-zinc-300';
  }
}
