import { prisma } from '@/lib/prisma';
import { GameContextService } from '@/services/game/GameContextService';
import { TitanService } from '@/services/game/TitanService';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userSkill: {
      findMany: vi.fn(),
    },
    titan: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    achievement: {
      findMany: vi.fn(),
    },
    meditationLog: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/services/game/GameContextService', () => ({
  GameContextService: {
    getPlayerContext: vi.fn(),
  },
}));

describe('TitanService', () => {
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should calculate effective stats including Neural Lattice modifiers', async () => {
    // 1. Mock base Titan
    (prisma.titan.findUnique as any).mockResolvedValue({
      userId,
      name: 'Test Titan',
      level: 10,
      strength: 10,
      vitality: 10,
      endurance: 10,
      currentHp: 100,
      mood: 'NEUTRAL',
    });

    // 2. Mock GameContextService
    (GameContextService.getPlayerContext as any).mockResolvedValue({
      combat: {
        effectiveAttack: 25,
      },
      modifiers: {
        attackPower: 1.2,
      },
      activeBuffs: [{ name: 'Test Buff', source: 'SKILL' }],
    });

    const result = await TitanService.getTitanWithModifiers(userId);

    // Should return the unified object
    expect(result?.power).toBe(25);
    expect(result?.modifiers.attackPower).toBe(1.2);
    expect(result?.activeBuffs).toHaveLength(1);
    expect(result?.maxHp).toBe(200); // 100 + 10 * 10
  });

  it('should calculate max HP based on endurance', async () => {
    (prisma.titan.findUnique as any).mockResolvedValue({
      userId,
      strength: 10,
      vitality: 10,
      endurance: 15,
      currentHp: 100,
    });

    (GameContextService.getPlayerContext as any).mockResolvedValue({
      combat: { effectiveAttack: 10 },
      modifiers: {},
      activeBuffs: [],
    });

    const result = await TitanService.getTitanWithModifiers(userId);

    expect(result?.maxHp).toBe(250); // 100 + 15 * 10
  });
});
