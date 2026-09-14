'use server';

import { prisma } from '@/lib/prisma';

// ============================================
// UNIFIED TITAN SOUL - STATE SCHEMA
// Authoritative server-side Titan state management
// ============================================

import { type TitanState } from '@/types/schemas';

/**
 * Get authoritative Titan state from server.
 */
export async function getAuthoritativeTitanState(userId: string): Promise<TitanState | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { titan: true },
  });

  if (!user || !user.titan) return null;

  const titan = user.titan;

  return {
    id: titan.id,
    userId: user.id,
    version: 1,
    lastModified: new Date(),
    name: titan.name,
    class: 'TITAN' as TitanState['class'], // Default class since Titan model has no class field
    level: user.level,
    prestige: 0,
    stats: {
      strength: titan.strength,
      vitality: titan.vitality,
      endurance: titan.endurance,
      agility: titan.agility,
      willpower: titan.willpower,
      intelligence: 10,
    },
    resources: {
      hp: titan.currentHp,
      maxHp: titan.maxHp,
      energy: titan.currentEnergy,
      maxEnergy: 100,
      xp: user.totalExperience,
      xpToNext: user.level * 1000,
    },
    economy: {
      gold: user.gold,
      gems: 0,
      materials: {},
    },
    progress: {
      totalWorkouts: 0,
      totalVolume: 0,
      totalPRs: 0,
      currentStreak: titan.streak,
      longestStreak: titan.streak,
      dungeonFloor: 0,
    },
    equipment: {
      weapon: null,
      armor: null,
      accessory1: null,
      accessory2: null,
    },
    statusEffects: [],
    syncMetadata: {
      syncedAt: new Date(),
    },
  };
}
