import { mkdir, writeFile } from 'node:fs/promises';
import { Archetype, Faction } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { prisma } from '../../../src/lib/prisma';
// Using global fetch (available in Node 18+)
async function checkSupabaseHealth(url: string): Promise<boolean> {
  try {
    const resp = await fetch(`${url}/auth/v1/health`);
    if (!resp.ok) {
      console.warn(`⚠️ Auth health check failed with status: ${resp.status}`);
      return false;
    }
    const data = await resp.json();
    return !!data;
  } catch (_err) {
    return false;
  }
}

async function removeLocalAuthUser(email: string): Promise<boolean> {
  const adminDatabaseUrl = process.env.ADMIN_DATABASE_URL;
  if (!adminDatabaseUrl) {
    console.warn('⚠️ ADMIN_DATABASE_URL not set. Cannot clean stale local auth user.');
    return false;
  }

  const client = new Client({ connectionString: adminDatabaseUrl });
  try {
    await client.connect();
    const result = await client.query('DELETE FROM auth.users WHERE lower(email) = lower($1)', [
      email,
    ]);
    console.log(`🧹 Removed ${result.rowCount ?? 0} stale local Supabase Auth user(s).`);
    return true;
  } catch (err) {
    console.warn(
      `⚠️ Failed to remove stale local auth user: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

function uniqueEmailFor(email: string): string {
  const at = email.lastIndexOf('@');
  const suffix = `e2e-${Date.now()}`;
  if (at === -1) {
    return `${email}+${suffix}@ironforge.local`;
  }

  return `${email.slice(0, at)}+${suffix}${email.slice(at)}`;
}

async function writeE2ECredentials(email: string, password: string): Promise<void> {
  await mkdir('playwright/.auth', { recursive: true });
  await writeFile(
    'playwright/.auth/credentials.json',
    `${JSON.stringify({ email, password }, null, 2)}\n`
  );
}

async function main() {
  const redactedUrl = (process.env.DATABASE_URL || '').replace(/:[^:@]+@/, ':****@');
  console.log(`🌱 Starting E2E Database Seeding with URL: ${redactedUrl}`);

  // Robust connection retry logic
  let retries = 5;
  let connected = false;
  while (retries > 0 && !connected) {
    try {
      await prisma.$connect();
      connected = true;
      console.log('✅ Connected to database server via Prisma.');
    } catch (err) {
      retries--;
      console.warn(
        `⚠️ Prisma connection failed. Retries left: ${retries}. Error: ${err instanceof Error ? err.message : String(err)}`
      );
      if (retries === 0) {
        console.error('❌ Failed to connect to database server after all retries.');
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  // Authenticate with Supabase to get the REAL User ID
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const envTestEmail = process.env.TEST_USER_EMAIL;
  const testPassword = process.env.TEST_USER_PASSWORD;

  if (!envTestEmail || !testPassword) {
    console.warn('⚠️ TEST_USER_EMAIL or TEST_USER_PASSWORD not set. Skipping Auth sync.');
    return;
  }

  let testEmail = envTestEmail;
  let userId: string | undefined;
  let usedPasswordAuthFallback = false;

  if (supabaseUrl && serviceKey) {
    console.log(
      `🔐 Ensuring test user ${testEmail} exists in local Supabase Auth at ${supabaseUrl}...`
    );
    // Use service role key to manage users without email confirmation
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 0. Wait for Auth service to be ready
    console.log('📡 Waiting for Supabase Auth service to be ready...');
    let authReady = false;
    let authRetries = 10;
    while (authRetries > 0 && !authReady) {
      authReady = await checkSupabaseHealth(supabaseUrl);
      if (!authReady) {
        authRetries--;
        if (authRetries === 0) {
          console.error('❌ Supabase Auth service not ready after all retries.');
        } else {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    }

    // Try to get existing user with robust error handling
    let users: any[] = [];
    try {
      const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw listError;
      users = usersData.users;
    } catch (err: any) {
      console.error(`❌ Failed to list users: ${err.message}`);

      if (err.code === 'bad_jwt' || err.message?.includes('invalid JWT')) {
        console.warn(
          '⚠️ Service role key is not valid for this local Supabase instance. Falling back to password signup/signin.'
        );

        if (!anonKey) {
          throw err;
        }

        const supabaseAuth = createClient(supabaseUrl, anonKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        });

        const signUpTestUser = () =>
          supabaseAuth.auth.signUp({
            email: testEmail,
            password: testPassword,
            options: { data: { heroName: 'E2E Hunter' } },
          });

        const { data: signUpData, error: signUpError } = await signUpTestUser();

        let fallbackUser = signUpData.user;
        let fallbackError = signUpError;

        if (!fallbackUser && signUpError?.message?.includes('User already registered')) {
          console.warn(
            '⚠️ Existing auth user has unknown password. Removing stale local auth row and retrying signup.'
          );
          const removed = await removeLocalAuthUser(testEmail);
          if (removed) {
            const { data: retryData, error: retryError } = await signUpTestUser();
            fallbackUser = retryData.user;
            fallbackError = retryError;
          } else {
            const generatedEmail = uniqueEmailFor(testEmail);
            console.warn('⚠️ Could not remove stale auth user. Creating isolated E2E user.');
            testEmail = generatedEmail;
            const { data: retryData, error: retryError } = await signUpTestUser();
            fallbackUser = retryData.user;
            fallbackError = retryError;
          }
        }

        if (fallbackUser) {
          userId = fallbackUser.id;
          usedPasswordAuthFallback = true;
          await writeE2ECredentials(testEmail, testPassword);
          console.log(`✅ Created Supabase Auth User ID via signup: ${userId}`);
        } else if (fallbackError) {
          console.warn(`⚠️ Signup fallback did not create user: ${fallbackError.message}`);
          const { data: signInData, error: signInError } =
            await supabaseAuth.auth.signInWithPassword({
              email: testEmail,
              password: testPassword,
            });

          if (signInError || !signInData.user) {
            throw signInError || fallbackError;
          }

          userId = signInData.user.id;
          usedPasswordAuthFallback = true;
          await writeE2ECredentials(testEmail, testPassword);
          console.log(`✅ Found Supabase Auth User ID via signin: ${userId}`);
        }
      }

      if (userId) {
        users = [{ id: userId, email: testEmail }];
      } else {
        // CRITICAL DEBUG: If we get a JSON parse error (Unexpected token <),
        // it means we got HTML. Let's try to see what that HTML is.
        if (err.message?.includes('Unexpected token') || err.message?.includes('JSON')) {
          console.error('DEBUG: Supabase Auth returned invalid JSON. Possible HTML error page.');
          try {
            const debugResp = await fetch(`${supabaseUrl}/auth/v1/health`);
            const text = await debugResp.text();
            console.error(`DEBUG: Health Check Status: ${debugResp.status}`);
            console.error(`DEBUG: Health Check Body: ${text.substring(0, 1000)}`);

            const adminResp = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
              headers: { Authorization: `Bearer ${serviceKey}` },
            });
            const adminText = await adminResp.text();
            console.error(`DEBUG: Admin Users Status: ${adminResp.status}`);
            console.error(`DEBUG: Admin Users Body: ${adminText.substring(0, 1000)}`);
          } catch (debugErr) {
            console.error(`DEBUG: Failed to fetch additional debug info: ${debugErr}`);
          }
        }
        throw err; // Re-throw to fail the setup properly
      }
    }

    const existingAuthUser = users.find((u) => u.email === testEmail);
    if (existingAuthUser) {
      userId = existingAuthUser.id;
      console.log(`✅ Found existing Supabase Auth User ID: ${userId}`);

      // Reset password to ensure it matches TEST_USER_PASSWORD
      if (usedPasswordAuthFallback) {
        console.log('✅ Password already set by password-auth fallback.');
      } else {
        console.log(`👤 Resetting password for ${testEmail} to ensure consistency...`);
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          existingAuthUser.id,
          {
            password: testPassword!,
          }
        );
        if (updateError) {
          console.warn(`⚠️ Failed to update password: ${updateError.message}`);
        } else {
          console.log('✅ Password reset successfully.');
        }
      }
    } else {
      console.log(`👤 User ${testEmail} not found. Creating via Admin API...`);
      const {
        data: { user },
        error: createError,
      } = await supabaseAdmin.auth.admin.createUser({
        email: testEmail,
        password: testPassword,
        email_confirm: true,
        user_metadata: { heroName: 'E2E Hunter' },
      });

      if (createError) {
        console.error(`❌ Failed to create auth user: ${createError.message}`);
      } else if (user) {
        userId = user.id;
        console.log(`✅ Created Supabase Auth User ID: ${userId}`);
      }
    }
  } else {
    console.warn('⚠️ Missing Supabase credentials in env. Skipping ID sync.');
  }

  // 1. Seed Battle Pass Season
  const seasonCode = 'S1';
  console.log(`Checking Battle Pass Season: ${seasonCode}`);

  const season = await prisma.battlePassSeason.upsert({
    where: { code: seasonCode },
    update: {},
    create: {
      name: 'Season 1: Genesis',
      code: seasonCode,
      startDate: new Date(),
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
      isActive: true,
      tiers: {
        create: Array.from({ length: 50 }).map((_, i) => ({
          tierLevel: i + 1,
          requiredXp: (i + 1) * 1000,
          freeRewardData: { type: 'GOLD', amount: 100 },
          premiumRewardData: { type: 'ITEM', itemId: `reward-${i + 1}` },
        })),
      },
    },
  });
  console.log(`✅ Battle Pass Season ensured: ${season.id}`);

  // Seed PVP Season for Ranked Arena
  const pvpSeason = await prisma.pvpSeason.upsert({
    where: { id: 'e2e-season-1' },
    update: { isActive: true },
    create: {
      id: 'e2e-season-1',
      name: 'Genesis',
      startDate: new Date(),
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      isActive: true,
      rewards: [],
    },
  });
  console.log(`✅ PVP Season ensured: ${pvpSeason.id}`);

  // 2. Seed Mock Opponents for Duels
  // Create a few users with Titans of different levels
  const opponents = [
    { email: 'opponent1@ironforge.gg', name: 'Iron Breaker', level: 5, power: 500 },
    { email: 'opponent2@ironforge.gg', name: 'Steel Viper', level: 10, power: 1200 },
    { email: 'opponent3@ironforge.gg', name: 'Shadow Walker', level: 15, power: 1800 },
    { email: 'opponent4@ironforge.gg', name: 'Blade Master', level: 8, power: 850 },
  ];

  for (const opp of opponents) {
    const user = await prisma.user.upsert({
      where: { email: opp.email },
      update: {
        titan: {
          update: {
            level: opp.level,
            powerRating: opp.power,
            currentHp: 100,
            maxHp: 100,
            strength: 10 + opp.level,
            endurance: 10 + opp.level,
          },
        },
      },
      create: {
        email: opp.email,
        heroName: opp.name,
        level: opp.level,
        faction: Faction.HORDE,
        archetype: Archetype.JUGGERNAUT,
        titan: {
          create: {
            name: `${opp.name}'s Titan`,
            level: opp.level,
            powerRating: opp.power,
            strength: 10 + opp.level,
            endurance: 10 + opp.level,
          },
        },
      },
    });
    console.log(`✅ Ensured opponent: ${opp.name} (Lvl ${opp.level}) - ID: ${user.id}`);
  }

  // 3. Seed Main Test User (Hunter) to prevent Onboarding Overlay in E2E
  // Use the retrieved userId if available, otherwise let Prisma generate one (start of problem) or update existing

  const startData = {
    email: testEmail,
    heroName: 'E2E Hunter',
    level: 10,
    gold: 5000,
    faction: Faction.HORDE,
    archetype: Archetype.PATHFINDER,
    hasCompletedOnboarding: true,
    intervalsApiKey: 'mock-e2e-api-key',
    intervalsAthleteId: 'i123456',
  };

  const titanData = {
    name: 'E2E Titan',
    level: 10,
    powerRating: 800,
    strength: 20,
    endurance: 20,
    agility: 20,
    vitality: 20,
    willpower: 20,
  };

  const effectiveId = userId || 'e2e-test-user-id';

  // --- USER AUTH SYNC ---
  let existingUserByEmail = await prisma.user.findUnique({ where: { email: testEmail } });
  let existingUserById = await prisma.user.findUnique({ where: { id: effectiveId } });

  // Case 1: User with this email exists but has wrong ID
  if (existingUserByEmail && existingUserByEmail.id !== effectiveId) {
    console.log(
      `⚠️ User exists with email ${testEmail} but different ID (${existingUserByEmail.id} vs ${effectiveId}). Cleaning up...`
    );
    await cleanupUser(existingUserByEmail.id);
    existingUserByEmail = null;
    // Re-check existingUserById in case it was the same one (though ID differed)
    existingUserById = await prisma.user.findUnique({ where: { id: effectiveId } });
  }

  // Case 2: User with this ID exists but has wrong email
  if (existingUserById && existingUserById.email !== testEmail) {
    console.log(
      `⚠️ User exists with ID ${effectiveId} but different email (${existingUserById.email} vs ${testEmail}). Cleaning up...`
    );
    await cleanupUser(existingUserById.id);
    existingUserById = null;
  }

  // Use upsert with the CORRECT ID
  // If userId is known, we want to create with that ID.
  // upsert requires 'where' to be unique. Email is unique.

  // Construct create data
  const createData: any = {
    ...startData,
    titan: {
      create: titanData,
    },
  };

  const testUser = await prisma.user.upsert({
    where: { email: testEmail },
    update: {
      heroName: 'E2E Hunter',
      hasCompletedOnboarding: true,
      level: 10,
      gold: 5000,
    },
    create: {
      ...createData,
      id: effectiveId,
    },
  });

  console.log(
    `✅ Ensured Test User: ${testUser.heroName} (Onboarding Completed) with ID: ${testUser.id}`
  );

  // 4. Seed E2E Guild + Territory so /territory page renders TerritoryStats
  // getUserTerritoryStats() returns null if user has no guildId — causing 'Owned Tiles' to not render
  console.log('🏰 Seeding E2E Guild and Territory...');
  const e2eGuildId = 'e2e-guild-id';

  const e2eGuild = await prisma.guild.upsert({
    where: { id: e2eGuildId },
    update: {
      leaderId: testUser.id,
    },
    create: {
      id: e2eGuildId,
      name: 'E2E Iron Vanguard',
      tag: 'E2EV',
      leaderId: testUser.id,
      isPublic: true,
      xp: 1000,
      level: 3,
      gold: 5000,
    },
  });
  console.log(`✅ Ensured E2E Guild: ${e2eGuild.name} (${e2eGuild.id})`);

  // Assign guild to the test user
  await prisma.user.update({
    where: { id: testUser.id },
    data: { guildId: e2eGuild.id },
  });
  console.log(`✅ Assigned guild ${e2eGuild.tag} to test user.`);

  // Create a territory controlled by the E2E guild
  await prisma.territory.upsert({
    where: { name: 'E2E Iron Peaks' },
    update: { controlledById: e2eGuild.id },
    create: {
      name: 'E2E Iron Peaks',
      region: 'Nordheim',
      type: 'TRAINING_GROUNDS',
      bonuses: { goldPerDay: 100, xpPerDay: 50 },
      coordX: 10,
      coordY: 10,
      controlledById: e2eGuild.id,
      controlledAt: new Date(),
    },
  });
  console.log('✅ Seeded E2E territory controlled by guild.');

  console.log('🌱 Seeding completed successfully.');
}

/**
 * Safely removes a user and all their associated records to satisfy FK constraints.
 * Essential for E2E seeding when the local Supabase Auth ID changes but DB record remains.
 */
async function cleanupUser(id: string) {
  console.log(`🧹 Cleaning up user ${id} and all related data...`);

  // We use individual deleteMany to avoid transaction timeout on large datasets,
  // but wrap in a sequence that respects FK order (children first).
  // 1. Delete deeply nested Titan children
  await prisma.titanMemory.deleteMany({ where: { titan: { userId: id } } });
  await prisma.titanScar.deleteMany({ where: { titan: { userId: id } } });

  // 2. Delete User's primary associations
  await prisma.titan.deleteMany({ where: { userId: id } });
  await prisma.combatSession.deleteMany({ where: { userId: id } });
  await prisma.pvpProfile.deleteMany({ where: { userId: id } });
  await prisma.guildRaidContribution.deleteMany({ where: { userId: id } });
  await prisma.unlockedMonster.deleteMany({ where: { userId: id } });
  await prisma.userAchievement.deleteMany({ where: { userId: id } });
  await prisma.userChallenge.deleteMany({ where: { userId: id } });
  await prisma.userEquipment.deleteMany({ where: { userId: id } });
  await prisma.userSkill.deleteMany({ where: { userId: id } });
  await prisma.userTitle.deleteMany({ where: { userId: id } });
  await prisma.weeklyPlan.deleteMany({ where: { userId: id } });
  await prisma.workoutTemplate.deleteMany({ where: { userId: id } });
  await prisma.exerciseLog.deleteMany({ where: { userId: id } });
  await prisma.cardioLog.deleteMany({ where: { userId: id } });
  await prisma.bodyMetric.deleteMany({ where: { userId: id } });
  await prisma.meditationLog.deleteMany({ where: { userId: id } });
  await prisma.grimoireEntry.deleteMany({ where: { userId: id } });
  await prisma.notification.deleteMany({ where: { userId: id } });
  await prisma.pushSubscription.deleteMany({ where: { userId: id } });
  await prisma.pvpRating.deleteMany({ where: { userId: id } });
  await prisma.activeSession.deleteMany({ where: { hostId: id } });
  await prisma.sessionParticipant.deleteMany({ where: { userId: id } });

  // 3. Handle Guild leadership
  // If user is a leader, we might need to delete the guild or assign new leader.
  // For E2E seeding, we usually delete the guild to allow fresh seeding.
  await prisma.guild.deleteMany({ where: { leaderId: id } });

  // 4. Finally delete the user
  await prisma.user.delete({ where: { id } });
}

// Export as default for Playwright globalSetup
export default async function globalSetup() {
  try {
    await main();
  } catch (e) {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Allow standalone execution
if (process.argv[1]?.includes('e2e-seed.ts')) {
  globalSetup();
}
