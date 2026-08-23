'use server';

import { prisma } from '@/lib/prisma';
import { authActionClient } from '@/lib/safe-action';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const GuildCreateSchema = z.object({
  name: z.string().min(3).max(30),
  tag: z.string().min(2).max(5).toUpperCase(),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().default(true),
});

/*
const GuildSettingsSchema = z.object({
  name: z.string().min(3).max(30).optional(),
  description: z.string().max(500).optional(),
  minLevel: z.number().min(1).max(100).optional(),
  isPublic: z.boolean().optional(),
  motd: z.string().max(200).optional(), // Message of the day
});
*/


/**
 * Create a new guild.
 */
export const createGuildAction = authActionClient
  .schema(GuildCreateSchema)
  .action(async ({ parsedInput: validated, ctx: { userId } }) => {
    try {
      // Check if user already in a guild
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { guildId: true, titan: { select: { level: true } } },
      });

      if (user?.guildId) {
        return {
          success: false,
          error: 'You must leave your current guild first.',
        };
      }

      // Check minimum level (10 to create)
      if ((user?.titan?.level || 1) < 10) {
        return {
          success: false,
          error: 'You must be level 10 to create a guild.',
        };
      }

      // Check if name/tag taken
      const existing = await prisma.guild.findFirst({
        where: {
          OR: [{ name: validated.name }, { tag: validated.tag }],
        },
      });

      if (existing) {
        return { success: false, error: 'Guild name or tag already taken.' };
      }

      // Create guild
      const guild = await prisma.guild.create({
        data: {
          name: validated.name,
          tag: validated.tag,
          description: validated.description,
          leaderId: userId,
          isPublic: validated.isPublic,
          level: 1,
          xp: 0,
        },
      });

      // Add creator as member
      await prisma.user.update({
        where: { id: userId },
        data: { guildId: guild.id },
      });

      revalidatePath('/guild');
      return { success: true, guildId: guild.id };
    } catch (error) {
      console.error('Error creating guild:', error);
      return { success: false, error: 'Failed to create guild.' };
    }
  });

/**
 * Join a guild.
 */
export const joinGuildAction = authActionClient
  .schema(z.string())
  .action(async ({ parsedInput: guildId, ctx: { userId } }) => {
    try {
      const [user, guild] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { guildId: true, titan: { select: { level: true } } },
        }),
        prisma.guild.findUnique({
          where: { id: guildId },
          include: { _count: { select: { members: true } } },
        }),
      ]);

      if (user?.guildId) {
        return { success: false, error: 'Leave your current guild first.' };
      }

      if (!guild) {
        return { success: false, error: 'Guild not found.' };
      }

      if (!guild.isPublic) {
        return { success: false, error: 'This guild is invite-only.' };
      }

      if (guild._count.members >= 100) {
        return { success: false, error: 'Guild is full.' };
      }

      const userLevel = user?.titan?.level || 1;
      if (userLevel < (guild.minLevel || 1)) {
        return { success: false, error: `Requires level ${guild.minLevel}.` };
      }

      await prisma.user.update({
        where: { id: userId },
        data: { guildId },
      });

      revalidatePath('/guild');
      return { success: true };
    } catch (error) {
      console.error('Error joining guild:', error);
      return { success: false, error: 'Failed to join guild.' };
    }
  });

/**
 * Leave a guild.
 */
export const leaveGuildAction = authActionClient.action(async ({ ctx: { userId } }) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { guildId: true },
    });

    if (!user?.guildId) {
      return { success: false, error: 'Not in a guild.' };
    }

    const guild = await prisma.guild.findUnique({
      where: { id: user.guildId },
      select: { leaderId: true },
    });

    if (guild?.leaderId === userId) {
      return { success: false, error: 'Transfer leadership before leaving.' };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { guildId: null },
    });

    revalidatePath('/guild');
    return { success: true };
  } catch (error) {
    console.error('Error leaving guild:', error);
    return { success: false, error: 'Failed to leave guild.' };
  }
});

/**
 * Get guild info.
 */
export const getGuildInfoAction = authActionClient
  .schema(z.string())
  .action(async ({ parsedInput: guildId }) => {
    try {
      const guild = await prisma.guild.findUnique({
        where: { id: guildId },
        include: {
          leader: { select: { heroName: true } },
          _count: { select: { members: true } },
        },
      });

      if (!guild) return null;

      return {
        id: guild.id,
        name: guild.name,
        tag: guild.tag,
        description: guild.description || undefined,
        leaderId: guild.leaderId,
        leaderName: guild.leader.heroName || 'Unknown',
        memberCount: guild._count.members,
        level: guild.level,
        xp: guild.xp,
        createdAt: guild.createdAt,
        isPublic: guild.isPublic,
        minLevel: guild.minLevel || 1,
      };
    } catch (error) {
      console.error('Error getting guild info:', error);
      return null;
    }
  });

/**
 * Search for guilds.
 */
export const searchGuildsAction = authActionClient
  .schema(
    z.object({
      query: z.string(),
      limit: z.number().default(20),
    })
  )
  .action(async ({ parsedInput: { query, limit } }) => {
    try {
      const guilds = await prisma.guild.findMany({
        where: {
          isPublic: true,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { tag: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: {
          leader: { select: { heroName: true } },
          _count: { select: { members: true } },
        },
        take: limit,
        orderBy: { xp: 'desc' },
      });

      return guilds.map((g) => ({
        id: g.id,
        name: g.name,
        tag: g.tag,
        description: g.description || undefined,
        leaderId: g.leaderId,
        leaderName: g.leader.heroName || 'Unknown',
        memberCount: g._count.members,
        level: g.level,
        xp: g.xp,
        createdAt: g.createdAt,
        isPublic: g.isPublic,
        minLevel: g.minLevel || 1,
      }));
    } catch (error) {
      console.error('Error searching guilds:', error);
      return [];
    }
  });
