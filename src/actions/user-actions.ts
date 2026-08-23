'use server';

import prisma from '@/lib/prisma';
import type { SafeUser } from '@/types/schemas';
import type { User } from '@prisma/client';
import { z } from 'zod';

// --- Schemas ---

const emailSchema = z.string().email().optional();

const SENSITIVE_USER_FIELDS = [
  'intervalsApiKey',
  'intervalsAthleteId',
  'hevyApiKey',
  'stravaAccessToken',
  'stravaRefreshToken',
  'stravaExpiresAt',
  'stravaAthleteId',
  'garminAccessToken',
  'garminRefreshToken',
  'garminUserSecret',
  'garminUserToken',
  'pocketCastsToken',
] as const satisfies readonly (keyof User)[];

function sanitizeUser(user: User | null): SafeUser | null {
  if (!user) return null;

  const safeUser = Object.fromEntries(
    Object.entries(user).filter(
      ([key]) => !SENSITIVE_USER_FIELDS.includes(key as (typeof SENSITIVE_USER_FIELDS)[number])
    )
  );

  return safeUser as SafeUser;
}

const appSettingsSchema = z.object({
  intervalsApiKey: z.string().optional(),
  intervalsAthleteId: z.string().optional(),
  hevyApiKey: z.string().optional(),
  supabaseUrl: z.string().optional(),
  supabaseKey: z.string().optional(),
  valhallaId: z.string().optional(),
  heroName: z.string().optional(),
  hueBridgeIp: z.string().optional(),
  hueUsername: z.string().optional(),
  prioritizeHyperPro: z.boolean().optional(),
});

const equipmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['Barbell', 'Weights', 'Machine', 'Cardio', 'Accessory', 'Rack']),
  isOwned: z.boolean(),
});

// --- Actions ---

import { actionClient, authActionClient } from '@/lib/safe-action';

export const getOrCreateUserAction = actionClient
  .schema(z.object({ email: emailSchema }))
  .action(async ({ parsedInput: { email } }) => {
    if (email) {
      let user = await prisma.user.findUnique({
        where: { email },
        include: {
          equipment: true,
          skills: true,
          achievements: true,
          unlockedMonsters: true,
        },
      });

      if (!user) {
        user = await prisma.user.create({
          data: { email },
          include: {
            equipment: true,
            skills: true,
            achievements: true,
            unlockedMonsters: true,
          },
        });
      }
      return { success: true, user: sanitizeUser(user) };
    }
    // Single player / Fallback Mode
    const users = await prisma.user.findMany({
      take: 1,
      include: {
        equipment: true,
        skills: true,
        achievements: true,
        unlockedMonsters: true,
      },
    });

    if (users.length > 0) return { success: true, user: sanitizeUser(users[0]) };

    const newUser = await prisma.user.create({
      data: { heroName: 'IronLegend' },
      include: {
        equipment: true,
        skills: true,
        achievements: true,
        unlockedMonsters: true,
      },
    });
    return { success: true, user: sanitizeUser(newUser) };
  });

export const getUserAction = authActionClient.action(async ({ ctx: { userId } }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      equipment: true,
      skills: true,
      achievements: true,
      unlockedMonsters: true,
    },
  });
  return { success: true, user: sanitizeUser(user) };
});

export const updateSettingsAction = authActionClient
  .schema(appSettingsSchema.partial())
  .action(async ({ parsedInput: settings, ctx: { userId } }) => {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        intervalsApiKey: settings.intervalsApiKey,
        intervalsAthleteId: settings.intervalsAthleteId,
        hevyApiKey: settings.hevyApiKey,
        prioritizeHyperPro: settings.prioritizeHyperPro,
      },
    });
    return { success: true, user: sanitizeUser(updatedUser) };
  });

export const updateGoldAction = authActionClient
  .schema(z.number().min(0).max(Number.MAX_SAFE_INTEGER))
  .action(async ({ parsedInput: amount, ctx: { userId } }) => {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { gold: amount },
    });
    return { success: true, user: sanitizeUser(updatedUser) };
  });

export const updateEquipmentAction = authActionClient
  .schema(z.array(equipmentSchema))
  .action(async ({ parsedInput: equipment, ctx: { userId } }) => {
    const operations = equipment.map((eq) =>
      prisma.userEquipment.upsert({
        where: { userId_equipmentId: { userId, equipmentId: eq.id } },
        create: { userId, equipmentId: eq.id, isOwned: eq.isOwned },
        update: { isOwned: eq.isOwned },
      })
    );
    await prisma.$transaction(operations);
    return { success: true };
  });
