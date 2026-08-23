'use server';

import type { BioBuff } from '@/features/bio/BioBuffService';
import prisma from '@/lib/prisma';
import { CombatEngine, type CombatState } from '@/services/game/CombatEngine';
import { LootSystem } from '@/services/game/LootSystem';
import { TitanService } from '@/services/game/TitanService';
import type { Monster, MonsterType } from '@/types';
import { PerformCombatActionInputSchema, StartBossFightSchema } from '@/types/schemas';
import { calculateTitanAttributes } from '@/utils';
import { revalidatePath } from 'next/cache';

import { authActionClient } from '@/lib/safe-action';
import type { Monster as PrismaMonster } from '@/types/prisma';
import { z } from 'zod';

/**
 * Starts a boss fight or resumes an existing one if valid.
 */
export const startBossFight = authActionClient
  .schema(StartBossFightSchema)
  .action(async ({ parsedInput: { bossId, tier }, ctx: { userId } }) => {
    // 1. Check for existing active session
    const existingSession = await prisma.combatSession.findUnique({
      where: { userId },
    });

    if (existingSession && !existingSession.isVictory && !existingSession.isDefeat) {
      // Resume existing session if it matches the boss (or force resume whatever is there)
      // For now, let's auto-resume if it exists.
      // If the user wanted to start a NEW fight with a DIFFERENT boss, they should have fled/finished the previous one.
      // But we can implicitly restart if the bossId is different?
      // Let's stick to: "Finish what you started" or explicit Flee.

      // However, if the session is expired (e.g. > 1 hour), we should nuke it.
      if (existingSession.expiresAt < new Date()) {
        await prisma.combatSession.delete({ where: { id: existingSession.id } });
      } else {
        // Fetch Boss details to return
        const dbBoss = await prisma.monster.findUnique({ where: { id: existingSession.bossId } });
        if (!dbBoss) return { success: false, message: 'Boss data corrupted' };

        const resumedState: CombatState = {
          playerHp: existingSession.playerHp,
          playerMaxHp: existingSession.playerMaxHp,
          bossHp: existingSession.bossHp,
          bossMaxHp: existingSession.bossMaxHp,
          turnCount: existingSession.turnCount,
          logs: (existingSession.logs as string[]) || [], // Cast JSON array to string array
          isVictory: existingSession.isVictory,
          isDefeat: existingSession.isDefeat,
        };

        return {
          success: true,
          state: resumedState,
          boss: dbBoss,
          message: 'Resuming active combat...',
        };
      }
    }

    // 2. Fetch User Stats & Titan
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { titan: true },
    });

    if (!dbUser) return { success: false, message: 'User not found' };

    if (!dbUser.titan) {
      return {
        success: false,
        message: 'Titan Soul not found. Visit Citadel first.',
      };
    }

    const currentHp = dbUser.titan.currentHp;
    const maxHp = dbUser.titan.maxHp;

    // Safety: If dead, can't fight
    if (dbUser.titan.isInjured || currentHp <= 0) {
      return { success: false, message: 'Titan is too injured to fight.' };
    }

    // Bio-Buff Check: Exhaustion
    if (dbUser.titan.currentBuff) {
      const buff = dbUser.titan.currentBuff as unknown as BioBuff;
      if (buff.effects && buff.effects.canFight === false) {
        return {
          success: false,
          message: 'Titan is exhausted. Rest is required.',
        };
      }
    }

    // 3. Fetch Boss Stats
    const boss = (await prisma.monster.findUnique({
      where: { id: bossId },
    })) as PrismaMonster | null;

    if (!boss) {
      return { success: false, message: 'Boss not found' };
    }

    // Apply Tier Scaling
    let hpMultiplier = 1.0;
    if (tier === 'STORY') {
      hpMultiplier = 0.7;
    } else if (tier === 'TITAN_SLAYER') {
      hpMultiplier = 1.5;
    }

    const scaledBossHp = Math.floor(boss.hp * hpMultiplier);

    // 4. Initialize State
    const initialState: CombatState = {
      playerHp: currentHp,
      playerMaxHp: maxHp,
      bossHp: scaledBossHp,
      bossMaxHp: scaledBossHp,
      turnCount: 1,
      logs: [`Encounter started: ${boss.name} (${tier} Mode)`],
      isVictory: false,
      isDefeat: false,
    };

    // 5. Persist Session to DB
    await prisma.combatSession.upsert({
      where: { userId },
      create: {
        userId,
        bossId: bossId,
        bossHp: initialState.bossHp,
        bossMaxHp: initialState.bossMaxHp,
        playerHp: initialState.playerHp,
        playerMaxHp: initialState.playerMaxHp,
        turnCount: initialState.turnCount,
        logs: initialState.logs,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 Hour TTL
      },
      update: {
        bossId: bossId,
        bossHp: initialState.bossHp,
        bossMaxHp: initialState.bossMaxHp,
        playerHp: initialState.playerHp,
        playerMaxHp: initialState.playerMaxHp,
        turnCount: initialState.turnCount,
        logs: initialState.logs,
        isVictory: false,
        isDefeat: false,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });

    return { success: true, state: initialState, boss };
  });

export const performCombatAction = authActionClient
  .schema(PerformCombatActionInputSchema)
  .action(async ({ parsedInput: { action }, ctx: { userId } }) => {
    // 1. Load Session from DB
    const session = await prisma.combatSession.findUnique({
      where: { userId },
    });

    if (!session) {
      return { success: false, message: 'Session expired or invalid' };
    }

    // Reconstruct CombatState from DB
    const currentState: CombatState = {
      playerHp: session.playerHp,
      playerMaxHp: session.playerMaxHp,
      bossHp: session.bossHp,
      bossMaxHp: session.bossMaxHp,
      turnCount: session.turnCount,
      logs: (session.logs as string[]) || [],
      isVictory: session.isVictory,
      isDefeat: session.isDefeat,
    };

    // 2. Re-fetch context (Attributes)
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { achievements: true, skills: true, titan: true },
    });

    if (!dbUser) return { success: false, message: 'User not found' };

    const unlockedIds = new Set<string>();
    dbUser.achievements.forEach((ua) => unlockedIds.add(ua.achievementId));
    const purchasedSkillIds = dbUser.skills.map((s) => s.skillId);
    const baseAttributes = calculateTitanAttributes(
      unlockedIds,
      null,
      new Set(purchasedSkillIds),
      []
    );

    // Shallow clone to avoid mutating shared state
    const attributes = { ...baseAttributes };

    // Apply Mood Modifiers
    if (dbUser.titan) {
      const mood = dbUser.titan.mood || 'NEUTRAL';
      let moodMod = 1.0;
      if (mood === 'HAPPY') moodMod = 1.1;
      if (mood === 'WEAKENED') moodMod = 0.8;

      if (moodMod !== 1.0) {
        attributes.strength = Math.round(attributes.strength * moodMod);
        attributes.endurance = Math.round(attributes.endurance * moodMod);
        attributes.technique = Math.round(attributes.technique * moodMod);
      }
    }

    // Bio-Combat Buff System
    if (dbUser.titan?.currentBuff) {
      // Safe cast since we know the structure from the service, but ideally we validate
      const buff = dbUser.titan.currentBuff as unknown as BioBuff;
      if (buff?.effects) {
        const { attackMod = 1.0, defenseMod = 1.0 } = buff.effects;
        if (attackMod !== 1.0) {
          attributes.strength = Math.round(attributes.strength * attackMod);
          attributes.technique = Math.round(attributes.technique * attackMod);
          attributes.mental = Math.round(attributes.mental * attackMod);
        }
        if (defenseMod !== 1.0) {
          attributes.endurance = Math.round(attributes.endurance * defenseMod);
          attributes.recovery = Math.round(attributes.recovery * defenseMod);
          attributes.hypertrophy = Math.round(attributes.hypertrophy * defenseMod);
        }

        // Log the effect (only once per session technically, but for now every turn start check is fine or just rely on UI)
        // To avoid spamming logs, we skip adding it here, UI handles badges.
      }
    }

    // 3. Get Boss (Need details for damage calculation logic if it depends on stats)
    const dbBoss = (await prisma.monster.findUnique({
      where: { id: session.bossId },
    })) as PrismaMonster | null;
    if (!dbBoss) return { success: false, message: 'Boss not found' };

    // Map to Monster
    const boss: Monster = {
      id: dbBoss.id,
      name: dbBoss.name,
      type: dbBoss.type as MonsterType,
      level: dbBoss.level,
      description: dbBoss.description,
      image: dbBoss.image || '',
      element: 'Physical',
      hp: session.bossHp, // Use current HP from session
      maxHp: session.bossMaxHp,
      weakness: [],
      associatedExerciseIds: [],
    };

    // Logic to determine scaling based on implicit knowledge or saved field?
    // We didn't save 'tier' in CombatSession.
    // We can infer it from (bossMaxHp / dbBoss.hp).
    // Or just rely on raw stats.
    const damageRatio = session.bossMaxHp / dbBoss.hp;

    // Temporary Boss Object for calculation
    const scaledBoss = {
      ...boss,
      level: Math.floor(boss.level * damageRatio),
    };

    // 4. Process Turn
    const result = CombatEngine.processTurn(currentState, action, attributes, scaledBoss as any);

    // Sync damage to Titan DB (Real-time health updates)
    const damageTaken = currentState.playerHp - result.newState.playerHp;
    if (damageTaken > 0) {
      await TitanService.modifyHealth(userId, -damageTaken, `Combat Damage (${session.bossId})`);
    }

    // 5. Update Session in DB
    // If victory/defeat, we might keep it for a moment to show result, OR handle it immediately.
    // The UI needs to see the result. So we update it to 'isVictory' state.
    // We will delete it ONLY after the user clicks "Leave" or we can auto-archive.
    // Actually, better to keep it until next startBossFight overwrites it or explicit leave.

    await prisma.combatSession.update({
      where: { id: session.id },
      data: {
        playerHp: result.newState.playerHp,
        bossHp: result.newState.bossHp,
        turnCount: result.newState.turnCount,
        logs: result.newState.logs,
        isVictory: result.newState.isVictory,
        isDefeat: result.newState.isDefeat,
        updatedAt: new Date(),
      },
    });

    // 6. Handle End Game Rewards
    let loot = null;
    let reward = null;

    if (result.newState.isVictory) {
      const lootRoll = await LootSystem.rollForLoot(userId);
      loot = lootRoll;

      // XP/Gold
      let rewardMultiplier = 1.0;
      // rough inference
      if (damageRatio < 0.8) rewardMultiplier = 0.5; // Story
      if (damageRatio > 1.4) rewardMultiplier = 2.0; // Slayer

      const xp = Math.floor(dbBoss.level * 50 * rewardMultiplier);
      const gold = Math.floor(dbBoss.level * 25 * rewardMultiplier);

      reward = { xp, gold };

      // Award
      await TitanService.awardXp(userId, xp, `Boss Defeated: ${dbBoss.name}`);
      await prisma.user.update({
        where: { id: userId },
        data: {
          gold: { increment: gold },
          kineticEnergy: { increment: 5 },
        },
      });

      // We do NOT delete the session here. We let the UI display the victory screen.
      // The session will be cleared/overwritten on next `startBossFight`.
      // Optionally, `revalidatePath` to update UI immediately
      revalidatePath('/armory');
    }

    return {
      success: true,
      newState: result.newState,
      turnResult: result,
      loot,
      reward,
    };
  });

const _fleeSchema = z.number().min(0);

export const fleeFromCombat = authActionClient
  .schema(z.number().min(0).optional())
  .action(async ({ parsedInput: goldCost = 50, ctx: { userId } }) => {
    const session = await prisma.combatSession.findUnique({ where: { userId } });
    if (!session) return { success: false, message: 'No active combat session' };

    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!dbUser) return { success: false, message: 'User not found' };

    if (dbUser.gold < goldCost) {
      return {
        success: false,
        message: `Not enough gold (need ${goldCost}, have ${dbUser.gold})`,
      };
    }

    // Deduct gold
    await prisma.user.update({
      where: { id: userId },
      data: { gold: { decrement: goldCost } },
    });

    // Delete session
    await prisma.combatSession.delete({
      where: { id: session.id },
    });

    return { success: true, goldSpent: goldCost };
  });

export const getActiveCombatSession = authActionClient.action(async ({ ctx: { userId } }) => {
  const session = await prisma.combatSession.findUnique({
    where: { userId },
  });

  if (!session) return { success: false };

  // Fetch boss details to render the resume card
  const boss = await prisma.monster.findUnique({
    where: { id: session.bossId },
  });

  return { success: true, session, boss };
});
