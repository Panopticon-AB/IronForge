import { afterEach, describe, expect, it, vi } from 'vitest';

describe('src/env.mjs validation contract', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  const validBaseEnv = {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ironforge',
    DIRECT_URL: 'postgresql://postgres:postgres@localhost:5432/ironforge',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    NODE_ENV: 'test',
  };

  it('succeeds when required runtime variables are present and GH_PAT is absent', async () => {
    vi.resetModules();
    process.env = {
      ...validBaseEnv,
    };
    delete process.env.GH_PAT;
    delete process.env.SKIP_ENV_VALIDATION;

    const { env } = await import('@/env.mjs');
    expect(env).toBeDefined();
    expect(env.DATABASE_URL).toBe(validBaseEnv.DATABASE_URL);
    expect(env.DIRECT_URL).toBe(validBaseEnv.DIRECT_URL);
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(validBaseEnv.NEXT_PUBLIC_SUPABASE_URL);
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(validBaseEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    expect('GH_PAT' in env).toBe(false);
  });

  it('fails validation when DATABASE_URL is missing, even if other vars are present', async () => {
    vi.resetModules();
    process.env = {
      ...validBaseEnv,
    };
    delete process.env.DATABASE_URL;
    delete process.env.GH_PAT;
    delete process.env.SKIP_ENV_VALIDATION;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(async () => {
      await import('@/env.mjs');
    }).rejects.toThrow('Invalid environment variables');
    consoleSpy.mockRestore();
  });

  it('fails validation when DIRECT_URL is missing', async () => {
    vi.resetModules();
    process.env = {
      ...validBaseEnv,
    };
    delete process.env.DIRECT_URL;
    delete process.env.GH_PAT;
    delete process.env.SKIP_ENV_VALIDATION;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(async () => {
      await import('@/env.mjs');
    }).rejects.toThrow('Invalid environment variables');
    consoleSpy.mockRestore();
  });

  it('fails validation when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    vi.resetModules();
    process.env = {
      ...validBaseEnv,
    };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.GH_PAT;
    delete process.env.SKIP_ENV_VALIDATION;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(async () => {
      await import('@/env.mjs');
    }).rejects.toThrow('Invalid environment variables');
    consoleSpy.mockRestore();
  });

  it('fails validation when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing', async () => {
    vi.resetModules();
    process.env = {
      ...validBaseEnv,
    };
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.GH_PAT;
    delete process.env.SKIP_ENV_VALIDATION;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(async () => {
      await import('@/env.mjs');
    }).rejects.toThrow('Invalid environment variables');
    consoleSpy.mockRestore();
  });
});
