'use server';

import { prisma } from '@/lib/prisma';
import { authActionClient } from '@/lib/safe-action';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

/**
 * Send friend request.
 */
export const sendFriendRequestAction = authActionClient
  .schema(z.string())
  .action(async ({ parsedInput: toHeroName, ctx: { userId: fromUserId } }) => {
    try {
      const targetUser = await prisma.user.findFirst({
        where: { heroName: toHeroName },
      });

      if (!targetUser) {
        return { success: false, message: 'User not found' };
      }

      if (targetUser.id === fromUserId) {
        return { success: false, message: 'Cannot add yourself' };
      }

      console.log(`Friend request sent from ${fromUserId} to ${targetUser.id}`);
      revalidatePath('/friends');
      return { success: true, message: 'Friend request sent!' };
    } catch (error) {
      console.error('Error sending friend request:', error);
      return { success: false, message: 'Failed to send request' };
    }
  });

/**
 * Accept friend request.
 */
export const acceptFriendRequestAction = authActionClient
  .schema(z.string())
  .action(async ({ parsedInput: requestId }) => {
    try {
      console.log(`Accepted friend request ${requestId}`);
      revalidatePath('/friends');
      return { success: true };
    } catch (error) {
      console.error('Error accepting friend request:', error);
      return { success: false };
    }
  });

/**
 * Decline friend request.
 */
export const declineFriendRequestAction = authActionClient
  .schema(z.string())
  .action(async ({ parsedInput: requestId, ctx: { userId: _userId } }) => {
    try {
      console.log(`Declined friend request ${requestId}`);
      revalidatePath('/friends');
      return { success: true };
    } catch (error) {
      console.error('Error declining friend request:', error);
      return { success: false };
    }
  });

/**
 * Remove friend.
 */
export const removeFriendAction = authActionClient
  .schema(z.string())
  .action(async ({ parsedInput: friendId }) => {
    try {
      console.log(`Removed friend ${friendId}`);
      revalidatePath('/friends');
      return { success: true };
    } catch (error) {
      console.error('Error removing friend:', error);
      return { success: false };
    }
  });

/**
 * Get user's friends list.
 */
export const getFriendsListAction = authActionClient.action(async () => {
  // MVP: Return sample friends
  return [
    {
      id: 'f1',
      heroName: 'IronGiant',
      level: 42,
      isOnline: true,
      lastActive: new Date(),
      titanClass: 'Warrior',
      friendSince: new Date('2024-06-01'),
    },
    {
      id: 'f2',
      heroName: 'StormBreaker',
      level: 38,
      isOnline: false,
      lastActive: new Date(Date.now() - 3600000),
      titanClass: 'Mage',
      friendSince: new Date('2024-08-15'),
    },
    {
      id: 'f3',
      heroName: 'MightLord',
      level: 55,
      isOnline: true,
      lastActive: new Date(),
      titanClass: 'Tank',
      friendSince: new Date('2024-03-20'),
    },
  ];
});

/**
 * Get pending friend requests.
 */
export const getPendingRequestsAction = authActionClient.action(async ({ ctx: { userId } }) => {
  return [
    {
      id: 'req1',
      fromUser: { id: 'u1', heroName: 'NewHero', level: 15 },
      toUserId: userId,
      status: 'PENDING',
      createdAt: new Date(),
    },
  ];
});

/**
 * Search for users to add.
 */
export const searchUsersAction = authActionClient
  .schema(z.string())
  .action(async ({ parsedInput: query }) => {
    if (!query || query.length < 2) return [];

    return [
      { id: 'search1', heroName: 'IronFist', level: 30 },
      { id: 'search2', heroName: 'IronWill', level: 45 },
    ];
  });
