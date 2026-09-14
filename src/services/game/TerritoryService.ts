import prisma from '@/lib/prisma';
import { getISOWeek, getISOWeekYear } from 'date-fns';

export const CONTEST_COST_GOLD = 1000;
export const CONTEST_DURATION_DAYS = 7;

export class TerritoryService {
  /**
   * Fetch all territories with their current owners and active contests.
   */
  static async getTerritories() {
    return await prisma.territory.findMany({
      include: {
        controlledBy: {
          select: {
            id: true,
            name: true,
            tag: true,
          },
        },
        activeContests: {
          where: { status: 'active' },
          include: {
            attacker: {
              select: {
                id: true,
                name: true,
                tag: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Claim an unclaimed territory.
   * Requires the user to be a guild leader/officer (checked in action).
   */
  static async claimTerritory(guildId: string, territoryId: string, userId: string) {
    return await prisma.$transaction(async (tx) => {
      const territory = await tx.territory.findUnique({
        where: { id: territoryId },
      });

      if (!territory) throw new Error('Territory not found');
      if (territory.controlledById) throw new Error('Territory already claimed');

      // Check if guild has enough gold (proxied by user gold for now or add guild gold)
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.gold < CONTEST_COST_GOLD) {
        throw new Error(`Insufficient gold. Need ${CONTEST_COST_GOLD}.`);
      }

      await tx.user.update({
        where: { id: userId },
        data: { gold: { decrement: CONTEST_COST_GOLD } },
      });

      return await tx.territory.update({
        where: { id: territoryId },
        data: {
          controlledById: guildId,
          controlledAt: new Date(),
        },
      });
    });
  }

  /**
   * Initiate a contest against an owned territory.
   */
  static async contestTerritory(attackerId: string, territoryId: string, userId: string) {
    return await prisma.$transaction(async (tx) => {
      const territory = await tx.territory.findUnique({
        where: { id: territoryId },
      });

      if (!territory) throw new Error('Territory not found');
      if (!territory.controlledById) throw new Error('Territory must be claimed before contesting');
      if (territory.controlledById === attackerId)
        throw new Error('Cannot contest your own territory');

      // Check for active contest
      const activeContest = await tx.territoryContest.findFirst({
        where: { territoryId, status: 'active' },
      });
      if (activeContest) throw new Error('Territory is already under contest');

      // Check gold
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.gold < CONTEST_COST_GOLD) {
        throw new Error(`Insufficient gold. Need ${CONTEST_COST_GOLD}.`);
      }

      await tx.user.update({
        where: { id: userId },
        data: { gold: { decrement: CONTEST_COST_GOLD } },
      });

      const now = new Date();
      const endsAt = new Date(now.getTime() + CONTEST_DURATION_DAYS * 24 * 60 * 60 * 1000);

      return await tx.territoryContest.create({
        data: {
          territoryId,
          attackerId,
          defenderId: territory.controlledById,
          startsAt: now,
          endsAt,
          status: 'active',
        },
      });
    });
  }

  /**
   * Update contest scores for ALL active contests a guild is involved in.
   */
  static async recordGuildActivity(guildId: string, volume: number) {
    const contests = await prisma.territoryContest.findMany({
      where: {
        OR: [{ attackerId: guildId }, { defenderId: guildId }],
        status: 'active',
      },
    });

    for (const contest of contests) {
      if (contest.attackerId === guildId) {
        await prisma.territoryContest.update({
          where: { id: contest.id },
          data: { attackerScore: { increment: Math.floor(volume) } },
        });
      } else if (contest.defenderId === guildId) {
        await prisma.territoryContest.update({
          where: { id: contest.id },
          data: { defenderScore: { increment: Math.floor(volume) } },
        });
      }
    }
  }

  static async conquestFromActivity(guildId: string, volume: number) {
    return await TerritoryService.recordGuildActivity(guildId, volume);
  }

  static async getUserTerritoryStats(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { guildId: true },
    });

    if (!user?.guildId) return null;

    const allTerritories = await prisma.territory.findMany({
      where: { controlledById: user.guildId },
    });

    // Cap at 3 for bonuses
    const cappedTerritories = allTerritories.slice(0, 3);

    // Map to TerritoryStatsData expected by the UI
    return {
      ownedTiles: allTerritories.length,
      contestedTiles: 0, // Placeholder
      totalControlPoints: allTerritories.length * 10,
      dailyGold: cappedTerritories.length * 100,
      dailyXP: cappedTerritories.length * 50,
      largestConnectedArea: allTerritories.length, // Placeholder
    };
  }

  static async distributeDailyIncome() {
    const guildsWithTerritories = await prisma.guild.findMany({
      where: {
        territories: {
          some: {},
        },
      },
      include: {
        territories: {
          select: { id: true },
        },
      },
    });

    for (const guild of guildsWithTerritories) {
      const count = Math.min(guild.territories.length, 3);
      if (count === 0) continue;

      const totalGold = count * 100;
      const totalXP = count * 50;

      await prisma.guild.update({
        where: { id: guild.id },
        data: {
          gold: { increment: totalGold },
          xp: { increment: totalXP },
        },
      });
    }
  }

  static async runWeeklySettlement() {
    return await TerritoryService.resolveExpiredContests();
  }

  /**
   * Returns the current state of all territories for map rendering.
   */
  static async getMapData(): Promise<any[]> {
    const now = new Date();
    const _weekNumber = getISOWeek(now);
    const _year = getISOWeekYear(now);

    const territories = await prisma.territory.findMany({
      include: {
        controlledBy: {
          select: { id: true, name: true, tag: true },
        },
        activeContests: {
          where: { status: 'active' },
          include: {
            attacker: { select: { id: true, name: true, tag: true } },
            defender: { select: { id: true, name: true, tag: true } },
          },
        },
      },
    });

    return territories;
  }

  /**
   * Resolve expired contests (Weekly Reset).
   */
  static async resolveExpiredContests() {
    const now = new Date();
    const expired = await prisma.territoryContest.findMany({
      where: { status: 'active', endsAt: { lte: now } },
    });

    for (const contest of expired) {
      const winnerId =
        contest.attackerScore > contest.defenderScore ? contest.attackerId : contest.defenderId;

      await prisma.$transaction(async (tx) => {
        await tx.territoryContest.update({
          where: { id: contest.id },
          data: { status: 'resolved', winnerId },
        });

        if (winnerId && winnerId !== contest.defenderId) {
          await tx.territory.update({
            where: { id: contest.territoryId },
            data: {
              controlledById: winnerId,
              controlledAt: now,
            },
          });

          // Log history
          await tx.territoryHistory.create({
            data: {
              territoryId: contest.territoryId,
              guildId: winnerId,
              claimedAt: now,
              weekNumber: getISOWeek(now),
              year: getISOWeekYear(now),
            },
          });
        }
      });
    }
  }
}
