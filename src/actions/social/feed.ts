import { authActionClient } from '@/lib/safe-action';
import { z } from 'zod';
// import { prisma } from "@/lib/prisma";

interface FeedItem {
  id: string;
  type: 'WORKOUT' | 'ACHIEVEMENT' | 'PR' | 'LEVEL_UP' | 'STREAK';
  userId: string;
  userHeroName: string;
  userAvatar?: string;
  timestamp: Date;
  content: {
    title: string;
    description: string;
    stats?: Record<string, string | number>;
    imageUrl?: string;
  };
  reactions: {
    likes: number;
    comments: number;
    hasLiked: boolean;
  };
}

/**
 * Get social feed for user.
 */
export const getSocialFeedAction = authActionClient
  .schema(
    z
      .object({
        limit: z.number().default(20),
        offset: z.number().default(0),
      })
      .optional()
  )
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const _limit = parsedInput?.limit ?? 20;
    const _offset = parsedInput?.offset ?? 0;
    try {
      // MVP: Return sample feed
      return [
        {
          id: 'feed-1',
          type: 'WORKOUT',
          userId: 'friend-1',
          userHeroName: 'IronWarrior',
          timestamp: new Date(Date.now() - 30 * 60 * 1000),
          content: {
            title: 'Completed Push Day',
            description: 'Crushed a great chest and shoulder workout!',
            stats: { exercises: 6, sets: 24, volume: '12,500kg' },
          },
          reactions: { likes: 12, comments: 3, hasLiked: false },
        },
        {
          id: 'feed-2',
          type: 'PR',
          userId: 'friend-2',
          userHeroName: 'SteelTitan',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
          content: {
            title: 'New Bench Press PR! 💪',
            description: 'Finally hit 140kg!',
            stats: { previous: '135kg', new: '140kg', improvement: '+3.7%' },
          },
          reactions: { likes: 45, comments: 12, hasLiked: true },
        },
        {
          id: 'feed-3',
          type: 'ACHIEVEMENT',
          userId: 'friend-3',
          userHeroName: 'LiftLegend',
          timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
          content: {
            title: 'Achievement Unlocked: Century Club',
            description: 'Completed 100 workouts! 🎉',
          },
          reactions: { likes: 89, comments: 21, hasLiked: false },
        },
        {
          id: 'feed-4',
          type: 'STREAK',
          userId: 'friend-4',
          userHeroName: 'DailyGrinder',
          timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000),
          content: {
            title: '🔥 30-Day Streak!',
            description: "One month of consistency. Let's keep going!",
          },
          reactions: { likes: 156, comments: 34, hasLiked: true },
        },
        {
          id: 'feed-5',
          type: 'LEVEL_UP',
          userId: 'friend-1',
          userHeroName: 'IronWarrior',
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          content: {
            title: 'Level 25 Reached! ⬆️',
            description: 'Unlocked new skill tree abilities.',
            stats: { newSkills: 2 },
          },
          reactions: { likes: 34, comments: 8, hasLiked: false },
        },
      ];
    } catch (error) {
      console.error('Error getting social feed:', error);
      return [];
    }
  });

/**
 * Like a feed item.
 */
export const likeFeedItemAction = authActionClient
  .schema(z.string())
  .action(async ({ parsedInput: feedItemId, ctx: { userId } }) => {
    try {
      console.log(`User ID:[REDACTED] liked feed item ${feedItemId}`);
      return { success: true, newCount: 14 }; // Mock
    } catch (error) {
      console.error('Error liking feed item:', error);
      return { success: false, newCount: 0 };
    }
  });

/**
 * Unlike a feed item.
 */
export const unlikeFeedItemAction = authActionClient
  .schema(z.string())
  .action(async ({ parsedInput: feedItemId, ctx: { userId } }) => {
    try {
      console.log(`User ID:[REDACTED] unliked feed item ${feedItemId}`);
      return { success: true, newCount: 12 };
    } catch (error) {
      console.error('Error unliking feed item:', error);
      return { success: false, newCount: 0 };
    }
  });

/**
 * Comment on a feed item.
 */
export const commentOnFeedItemAction = authActionClient
  .schema(
    z.object({
      feedItemId: z.string(),
      comment: z.string().max(500),
    })
  )
  .action(async ({ parsedInput: { feedItemId, comment }, ctx: { userId } }) => {
    try {
      // Log only metadata — never raw comment content to prevent PII exposure
      console.log(`Comment on feedItem:${feedItemId} (len:${comment.length})`);
      return { success: true, commentId: `comment-${Date.now()}` };
    } catch (error) {
      console.error('Error commenting:', error);
      return { success: false };
    }
  });

/**
 * Share workout to feed.
 */
export const shareWorkoutToFeedAction = authActionClient
  .schema(
    z.object({
      workoutId: z.string(),
      message: z.string().optional(),
    })
  )
  .action(async ({ parsedInput: { workoutId, message }, ctx: { userId } }) => {
    try {
      console.log(`User ID:[REDACTED] shared workout ${workoutId} with message: [REDACTED]`);
      return { success: true, feedItemId: `feed-${Date.now()}` };
    } catch (error) {
      console.error('Error sharing workout:', error);
      return { success: false };
    }
  });
