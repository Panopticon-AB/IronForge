import prisma from '@/lib/prisma';
import { type TerritoryContestEntry } from '@prisma/client';

export class TerritoryResolutionService {
  /**
   * Main entry point for the weekly territory resolution.
   * Runs every Sunday at 23:59 UTC.
   */
  static async resolveWeeklyCycle() {
    console.log('[TerritoryResolution] Starting weekly resolution cycle...');

    const now = new Date();
    // We resolve for the week that just ended
    const weekNumber = TerritoryResolutionService.getISOWeek(now);
    const year = now.getFullYear();

    try {
      const territories = await prisma.territory.findMany({
        include: {
          contestEntries: {
            where: {
              weekNumber,
              year,
            },
            orderBy: {
              xpEarned: 'desc',
            },
          },
        },
      });

      for (const territory of territories) {
        await TerritoryResolutionService.resolveTerritory(territory, weekNumber, year);
      }

      console.log('[TerritoryResolution] Weekly resolution completed successfully.');
      return { success: true };
    } catch (error) {
      console.error('[TerritoryResolution] Error during weekly resolution:', error);
      throw error;
    }
  }

  /**
   * Resolves a single territory contest.
   */
  private static async resolveTerritory(
    territory: any, // Territory with contestEntries
    weekNumber: number,
    year: number
  ) {
    const entries = territory.contestEntries as TerritoryContestEntry[];

    if (entries.length === 0) {
      console.log(
        `[TerritoryResolution] No participants for ${territory.name}. Ownership remains unchanged.`
      );
      return;
    }

    const winnerEntry = entries[0];
    const newOwnerId = winnerEntry.guildId;

    if (territory.controlledById === newOwnerId) {
      console.log(
        `[TerritoryResolution] Guild ${newOwnerId} successfully defended ${territory.name}.`
      );
    } else {
      console.log(
        `[TerritoryResolution] Guild ${newOwnerId} captured ${territory.name} from ${territory.controlledById || 'Wilds'}.`
      );
    }

    // Update territory ownership
    await prisma.$transaction(async (tx) => {
      // 1. Update the Territory
      await tx.territory.update({
        where: { id: territory.id },
        data: { controlledById: newOwnerId },
      });

      // 2. Add to History
      await tx.territoryHistory.create({
        data: {
          territoryId: territory.id,
          guildId: newOwnerId,
          weekNumber,
          year,
          totalXp: winnerEntry.xpEarned,
          totalVolume: winnerEntry.totalVolume,
          result: territory.controlledById === newOwnerId ? 'DEFENDED' : 'CAPTURED',
        },
      });

      // 3. Enforce 3-territory limit for the winner
      await TerritoryResolutionService.enforceTerritoryCap(newOwnerId, tx);
    });
  }

  /**
   * Ensures a guild does not exceed the 3-territory limit.
   * If they do, the oldest territory (by updatedAt or earliest capture) is forfeited.
   */
  private static async enforceTerritoryCap(guildId: string, tx: any) {
    const controlledTerritories = await tx.territory.findMany({
      where: { controlledById: guildId },
      orderBy: { updatedAt: 'asc' }, // Oldest first
    });

    if (controlledTerritories.length > 3) {
      const territoryToForfeit = controlledTerritories[0];
      console.log(
        `[TerritoryResolution] Guild ${guildId} exceeded territory cap. Forfeiting ${territoryToForfeit.name}.`
      );

      await tx.territory.update({
        where: { id: territoryToForfeit.id },
        data: { controlledById: null },
      });

      // Log forfeit in history
      await tx.territoryHistory.create({
        data: {
          territoryId: territoryToForfeit.id,
          guildId: guildId,
          weekNumber: 0, // System action
          year: new Date().getFullYear(),
          totalXp: 0,
          totalVolume: 0,
          result: 'FORFEITED_LIMIT',
        },
      });
    }
  }

  /**
   * Helper to get ISO Week number
   */
  private static getISOWeek(date: Date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }
}
