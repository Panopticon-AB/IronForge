import { BioBuff } from '@/features/bio/BioBuffService';
import { prisma } from '@/lib/prisma';
import { ProgressionService } from '@/services/progression';
import type { IntervalsWellness } from '@/types';
import { revalidatePath } from 'next/cache';
import { GameContextService } from './GameContextService';

export class TitanService {
  static async getTitan(userId: string) {
    return prisma.titan.findUnique({
      where: { userId },
      include: {
        memories: true,
        scars: true,
      },
    });
  }

  static async ensureTitan(userId: string) {
    return prisma.titan.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        name: 'Iron Initiate',
        level: 1,
        xp: 0,
        currentHp: 100,
        maxHp: 100,
        currentEnergy: 100,
        maxEnergy: 100,
        mood: 'NEUTRAL',
      },
    });
  }

  static async getTitanWithModifiers(userId: string) {
    const titan = await prisma.titan.findUnique({
      where: { userId },
    });

    if (!titan) return null;

    // Fetch modifiers from GameContextService for full robustness
    const context = await GameContextService.getPlayerContext(userId);

    // Apply combat stats and modifiers to the titan object
    return {
      ...titan,
      maxHp: 100 + (titan as any).endurance * 10, // Base calculation
      power: context.combat.effectiveAttack,
      modifiers: context.modifiers,
      activeBuffs: context.activeBuffs,
    };
  }

  static async modifyHealth(userId: string, amount: number, _reason?: string) {
    const titan = await TitanService.getTitanWithModifiers(userId);
    if (!titan) throw new Error('Titan not found');

    const newHp = Math.max(0, Math.min(titan.currentHp + amount, titan.maxHp));

    const updated = await prisma.titan.update({
      where: { userId },
      data: {
        currentHp: newHp,
        isInjured: newHp === 0,
        mood: newHp === 0 ? 'WEAKENED' : titan.mood,
      },
    });

    revalidatePath('/citadel');
    return updated;
  }

  static async awardXp(userId: string, amount: number, _source: string) {
    const titan = await prisma.titan.findUnique({ where: { userId } });
    if (!titan) throw new Error('Titan not found');

    const user = await prisma.user.findUnique({ where: { id: userId } });

    const decree = titan.dailyDecree as any;
    const multiplier = ProgressionService.calculateMultiplier(
      titan.streak,
      titan.mood,
      user?.subscriptionTier || 'FREE',
      decree?.type,
      titan.level
    );

    const adjustedAmount = Math.floor(amount * multiplier);

    let newXp = titan.xp + adjustedAmount;
    let newLevel = titan.level;
    let leveledUp = false;

    const xpToNext = newLevel * 1000;

    while (newXp >= xpToNext) {
      newXp -= xpToNext;
      newLevel++;
      leveledUp = true;
    }

    const data: any = {
      xp: newXp,
      level: newLevel,
      lastActive: new Date(),
    };

    if (leveledUp) {
      data.maxHp = 100 + newLevel * 10;
      data.currentHp = data.maxHp;
      data.currentEnergy = 100;
    }

    const updated = await prisma.titan.update({
      where: { userId },
      data,
    });

    revalidatePath('/citadel');
    return { titan: updated, leveledUp };
  }

  static async consumeEnergy(userId: string, amount: number) {
    const titan = await prisma.titan.findUnique({ where: { userId } });
    if (!titan) throw new Error('Titan not found');

    if (titan.currentEnergy < amount) {
      throw new Error('Not enough energy');
    }

    const updated = await prisma.titan.update({
      where: { userId },
      data: {
        currentEnergy: { decrement: amount },
        lastActive: new Date(),
      },
    });

    revalidatePath('/citadel');
    return updated;
  }

  static async syncWellness(userId: string, wellness: IntervalsWellness) {
    const titan = await prisma.titan.findUnique({ where: { userId } });
    if (!titan) throw new Error('Titan not found');

    const newEnergy = wellness.bodyBattery || titan.currentEnergy;
    let newMood = 'NEUTRAL';
    const sleepScore = wellness.sleepScore || 0;
    const hrv = wellness.hrv || 0;

    if ((wellness.bodyBattery && wellness.bodyBattery < 30) || (hrv > 0 && hrv < 30)) {
      newMood = 'WEAKENED';
    } else if (wellness.bodyBattery && wellness.bodyBattery > 80 && sleepScore > 80) {
      newMood = 'FOCUSED';
    }

    const isResting = (wellness.bodyBattery || 100) < 20;

    return prisma.titan.update({
      where: { userId },
      data: {
        currentEnergy: newEnergy,
        mood: newMood,
        isResting: isResting,
        lastActive: new Date(),
      },
    });
  }

  static async updateStreak(userId: string, timezone = 'UTC') {
    const titan = await prisma.titan.findUnique({ where: { userId } });
    if (!titan) throw new Error('Titan not found');

    const now = new Date();
    const lastActive = new Date(titan.lastActive);
    const options: Intl.DateTimeFormatOptions = { timeZone: timezone };

    let todayStr: string;
    let lastActiveStr: string;
    try {
      todayStr = now.toLocaleDateString('en-CA', options);
      lastActiveStr = lastActive.toLocaleDateString('en-CA', options);
    } catch {
      const utcOptions = { timeZone: 'UTC' };
      todayStr = now.toLocaleDateString('en-CA', utcOptions);
      lastActiveStr = lastActive.toLocaleDateString('en-CA', utcOptions);
    }

    if (todayStr === lastActiveStr) {
      return { streak: titan.streak, status: 'SAME_DAY' };
    }

    const yesterdayTs = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    let yesterdayStr: string;
    try {
      yesterdayStr = yesterdayTs.toLocaleDateString('en-CA', options);
    } catch {
      yesterdayStr = yesterdayTs.toLocaleDateString('en-CA', {
        timeZone: 'UTC',
      });
    }

    let newStreak = 1;
    if (lastActiveStr === yesterdayStr) {
      newStreak = titan.streak + 1;
    }

    const updated = await prisma.titan.update({
      where: { userId },
      data: {
        streak: newStreak,
        lastActive: new Date(),
      },
    });

    revalidatePath('/citadel');
    revalidatePath('/dashboard');

    return { streak: newStreak, status: 'UPDATED', titan: updated };
  }
}
