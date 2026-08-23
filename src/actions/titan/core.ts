'use server';

import { getErrorMessage } from '@/lib/error-message';
import { prisma } from '@/lib/prisma';
import { authActionClient } from '@/lib/safe-action';
import { TitanService } from '@/services/game/TitanService';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// --- Types ---
export type TitanState = {
  id: string;
  level: number;
  xp: number;
  currentHp: number;
  maxHp: number;
  mood: string;
  currentEnergy: number;
  maxEnergy: number;
  isInjured: boolean;
  isResting: boolean;
  name: string;
  powerRating?: number;
  hrvBaseline?: number | null;
  streak: number;
};

// --- Legacy Schema (Deprecated) ---
const updateTitanSchema = z.object({
  currentHp: z.number().optional(),
  xp: z.number().optional(),
  currentEnergy: z.number().optional(),
  mood: z.string().optional(),
  isInjured: z.boolean().optional(),
});

// --- Actions ---

export const getTitanAction = authActionClient.action(async ({ ctx: { userId } }) => {
  try {
    const titan = await TitanService.getTitan(userId);
    return { success: true, data: titan };
  } catch (error) {
    console.error('Error fetching titan:', error);
    return { success: false, error: 'Failed to fetch Titan' };
  }
});

export const ensureTitanAction = authActionClient.action(async ({ ctx: { userId } }) => {
  try {
    const titan = await TitanService.ensureTitan(userId);
    return { success: true, data: titan };
  } catch (error) {
    console.error('Error ensuring titan:', error);
    return { success: false, error: 'Failed to create or fetch Titan' };
  }
});

/**
 * @deprecated UNSAFE: Clients should not dictate state directly. Use specific actions below.
 */
export async function updateTitanAction(userId: string, data: z.infer<typeof updateTitanSchema>) {
  try {
    const validated = updateTitanSchema.parse(data);
    const titan = await prisma.titan.update({
      where: { userId },
      data: { ...validated, lastActive: new Date() },
    });
    revalidatePath('/citadel');
    return { success: true, data: titan };
  } catch (error) {
    console.error('Error updating titan:', error);
    return { success: false, error: 'Failed to update Titan' };
  }
}

// --- NEW AUTHORITATIVE ACTIONS ---

export const modifyTitanHealthAction = authActionClient
  .schema(z.object({ delta: z.number(), reason: z.string() }))
  .action(async ({ parsedInput: { delta, reason }, ctx: { userId } }) => {
    try {
      const updated = await TitanService.modifyHealth(userId, delta, reason);
      return { success: true, data: updated };
    } catch (error) {
      console.error('Error modifying health:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

export const awardTitanXpAction = authActionClient
  .schema(z.object({ amount: z.number(), source: z.string() }))
  .action(async ({ parsedInput: { amount, source }, ctx: { userId } }) => {
    try {
      const { titan, leveledUp } = await TitanService.awardXp(userId, amount, source);
      return { success: true, data: titan, leveledUp };
    } catch (error) {
      console.error('Error awarding XP:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

export const consumeTitanEnergyAction = authActionClient
  .schema(z.number())
  .action(async ({ parsedInput: amount, ctx: { userId } }) => {
    try {
      const updated = await TitanService.consumeEnergy(userId, amount);
      return { success: true, data: updated };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  });

export const syncTitanStateWithWellness = authActionClient
  .schema(z.any())
  .action(async ({ parsedInput: wellness, ctx: { userId } }) => {
    try {
      await TitanService.syncWellness(userId, wellness);
      return { success: true };
    } catch (error) {
      console.error('Sync Titan/Wellness failed:', error);
      return { success: false };
    }
  });

export const checkAndIncrementStreakAction = authActionClient
  .schema(z.object({ timezone: z.string().optional() }))
  .action(async ({ parsedInput: { timezone = 'UTC' }, ctx: { userId } }) => {
    try {
      const result = await TitanService.updateStreak(userId, timezone);
      return { success: true, ...result };
    } catch (error) {
      console.error('Streak update failed:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });
