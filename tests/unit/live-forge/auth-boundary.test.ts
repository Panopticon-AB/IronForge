import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import prisma from '@/lib/prisma';
import { createClient } from '@/utils/supabase/server';
import { resolveUserId } from '@/actions/live-forge/core';

describe('Unit: Live Forge Auth Boundary', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('resolves authenticated Supabase user ID when present', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'supabase-user-123' } },
        }),
      },
    } as any);

    const userId = await resolveUserId();
    expect(userId).toBe('supabase-user-123');
  });

  it('fails closed in production when unauthenticated without falling back to any user', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.IRONFORGE_E2E_MODE;
    delete process.env.IRONFORGE_E2E_USER_ID;

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
        }),
      },
    } as any);

    await expect(resolveUserId()).rejects.toThrow('UNAUTHORIZED: Authentication required');
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('fails closed in development when unauthenticated and IRONFORGE_E2E_MODE is not true', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.IRONFORGE_E2E_MODE;

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
        }),
      },
    } as any);

    await expect(resolveUserId()).rejects.toThrow('UNAUTHORIZED: Authentication required');
  });

  it('resolves isolated deterministic test user when non-production and IRONFORGE_E2E_MODE is true', async () => {
    process.env.NODE_ENV = 'test';
    process.env.IRONFORGE_E2E_MODE = 'true';
    process.env.IRONFORGE_E2E_USER_ID = 'test-e2e-user-456';

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
        }),
      },
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'test-e2e-user-456' } as any);

    const userId = await resolveUserId();
    expect(userId).toBe('test-e2e-user-456');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'test-e2e-user-456' },
      select: { id: true },
    });
  });
});
