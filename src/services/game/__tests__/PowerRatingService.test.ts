import prisma from '@/lib/prisma';
import { subWeeks } from 'date-fns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PowerRatingService } from '../PowerRatingService';

vi.mock('@/lib/prisma', () => ({
  default: {
    exerciseLog: { findMany: vi.fn() },
    cardioLog: { findMany: vi.fn() },
  },
}));

describe('PowerRatingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getConsecutiveWeeks', () => {
    it('should return 0 if no logs exist', async () => {
      vi.setSystemTime(new Date('2024-03-20T12:00:00Z')); // Wednesday
      vi.mocked(prisma.exerciseLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.cardioLog.findMany).mockResolvedValue([]);

      const weeks = await PowerRatingService.getConsecutiveWeeks('user-1');
      expect(weeks).toBe(0);
    });

    it('should count consecutive weeks from logs', async () => {
      const now = new Date('2024-03-20T12:00:00Z');
      vi.setSystemTime(now);

      const lastWeek = subWeeks(now, 1);
      const twoWeeksAgo = subWeeks(now, 2);

      vi.mocked(prisma.exerciseLog.findMany).mockResolvedValue([
        { date: now },
        { date: lastWeek },
        { date: twoWeeksAgo },
      ] as any);
      vi.mocked(prisma.cardioLog.findMany).mockResolvedValue([]);

      const weeks = await PowerRatingService.getConsecutiveWeeks('user-1');
      expect(weeks).toBe(3);
    });

    it('should handle current week gap (still counting previous consecutive weeks)', async () => {
      const now = new Date('2024-03-20T12:00:00Z');
      vi.setSystemTime(now);

      const lastWeek = subWeeks(now, 1);
      const twoWeeksAgo = subWeeks(now, 2);

      vi.mocked(prisma.exerciseLog.findMany).mockResolvedValue([
        { date: lastWeek },
        { date: twoWeeksAgo },
      ] as any);
      vi.mocked(prisma.cardioLog.findMany).mockResolvedValue([]);

      const weeks = await PowerRatingService.getConsecutiveWeeks('user-1');
      expect(weeks).toBe(2);
    });

    it('should break streak on missing mid-week', async () => {
      const now = new Date('2024-03-20T12:00:00Z');
      vi.setSystemTime(now);
      const threeWeeksAgo = subWeeks(now, 3);

      vi.mocked(prisma.exerciseLog.findMany).mockResolvedValue([
        { date: now },
        { date: threeWeeksAgo },
      ] as any);
      vi.mocked(prisma.cardioLog.findMany).mockResolvedValue([]);

      const weeks = await PowerRatingService.getConsecutiveWeeks('user-1');
      expect(weeks).toBe(1); // Only current week
    });

    it('should correctly handle year boundaries', async () => {
      // Monday Jan 1st 2024 is Week 1 of 2024
      // Last week of 2023 is Week 52
      const jan1 = new Date('2024-01-01T12:00:00Z');
      vi.setSystemTime(jan1);

      const decLastWeek = subWeeks(jan1, 1); // Late Dec 2023

      vi.mocked(prisma.exerciseLog.findMany).mockResolvedValue([
        { date: jan1 },
        { date: decLastWeek },
      ] as any);
      vi.mocked(prisma.cardioLog.findMany).mockResolvedValue([]);

      const weeks = await PowerRatingService.getConsecutiveWeeks('user-1');
      expect(weeks).toBe(2);
    });
  });
});
