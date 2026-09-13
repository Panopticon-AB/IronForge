import {
  getHevyRoutinesAction,
  getHevyTemplatesAction,
  getHevyWorkoutHistoryAction,
} from '@/actions/integrations/hevy';
import {
  getActivitiesAction,
  getEventsAction,
  getWellnessAction,
} from '@/actions/integrations/intervals';
import { getStrengthLeaderboardAction } from '@/actions/social/leaderboards';
import { getActiveChallengesAction } from '@/actions/systems/challenges';
import { ensureTitanAction, syncTitanStateWithWellness } from '@/actions/titan/core';
import { ensureUserAction } from '@/actions/user/core';
import { buildDashboardTtb } from '@/features/dashboard/buildDashboardTtb';
import DashboardClient from '@/features/dashboard/DashboardClient';
import { calculateSkillEffects } from '@/features/game/hooks/useSkillEffects';
import prisma from '@/lib/prisma';
import { AnalyticsService } from '@/services/analytics';
import { runFullAudit } from '@/services/auditor-orchestrator';
import { RecoveryService } from '@/services/bio/RecoveryService';
import { OracleService } from '@/services/oracle';
import { Progression } from '@/services/progression';
// Force Rebuild
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import type {
  IntervalsActivity,
  IntervalsEvent,
  IntervalsWellness,
  TitanLoadCalculation,
} from '@/types';
// Types
import type { AuditReport } from '@/types/auditor';
import type { DashboardInitialData, ExtendedUser } from '@/types/dashboard';
import type { HevyExerciseTemplate, HevyRoutine, HevyWorkout } from '@/types/hevy';
import type { TrainingPath } from '@/types/training';

// Force dynamic rendering since this page requires authentication
export const dynamic = 'force-dynamic';

export default async function Page() {
  // 0. Auth Check
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  // 0b. Fetch DB User & Config
  await ensureUserAction(user.id, user.email);
  const dbUser = (await prisma.user.findUnique({
    where: { id: user.id },
    include: { achievements: true, skills: true },
  })) as ExtendedUser | null;

  // --- DEMO MODE CHECK ---
  const cookieStore = await cookies();
  const isDemoMode = cookieStore.has('ironforge_demo_mode');

  // --- INTEGRATION CREDENTIALS ---
  const hevyApiKey = dbUser?.hevyApiKey || process.env.HEVY_API_KEY;
  const intervalsApiKey = dbUser?.intervalsApiKey;
  const intervalsAthleteId = dbUser?.intervalsAthleteId;

  // --- DATA CONTAINERS ---
  let hevyRoutines: HevyRoutine[] = [];
  let hevyTemplates: HevyExerciseTemplate[] = [];
  let history: HevyWorkout[] = [];

  let wellness: IntervalsWellness | null = null;
  let activities: IntervalsActivity[] = [];
  let events: IntervalsEvent[] = [];

  // --- DATA FETCHING ---
  if (isDemoMode) {
    console.log('🧪 DEMO MODE ENABLED: Loading Mock Data');
    const { MOCK_WELLNESS, MOCK_ACTIVITIES, MOCK_EVENTS, MOCK_HEVY_WORKOUTS } = await import(
      '@/lib/mock-data'
    );

    wellness = MOCK_WELLNESS;
    activities = MOCK_ACTIVITIES;
    events = MOCK_EVENTS;
    history = MOCK_HEVY_WORKOUTS;

    // Mock Hevy Templates/Routines can be empty or added later
    hevyRoutines = [];
    hevyTemplates = [];
  } else {
    // REAL DATA
    // 1. Hevy
    if (hevyApiKey) {
      try {
        const routinesRes = await getHevyRoutinesAction(hevyApiKey);
        hevyRoutines = routinesRes.routines;

        const templatesRes = await getHevyTemplatesAction(hevyApiKey);
        hevyTemplates = templatesRes.exercise_templates;

        const historyRes = await getHevyWorkoutHistoryAction(hevyApiKey, 30);
        history = historyRes.workouts;
      } catch (e) {
        console.error('Failed to load Hevy data', e);
      }
    }

    // 2. Intervals
    if (intervalsApiKey && intervalsAthleteId) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0];
        const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const [w, acts, evts] = await Promise.all([
          getWellnessAction(today),
          getActivitiesAction(lastMonth, today),
          getEventsAction(today, nextWeek),
        ]);

        wellness = w;
        activities = acts;
        events = evts;
      } catch (e) {
        console.error('Failed to load Intervals data', e);
      }
    }
  }

  // --- PROCESSING & ANALYSIS ---

  // 1. Build TTB from raw evidence before applying legacy dashboard defaults.
  // Canonical Epic/PR strength evidence is not available at this boundary yet,
  // so the strength domain intentionally remains unknown.
  const ttb = buildDashboardTtb(activities, wellness);

  // Legacy dashboard/Oracle wellness fallback. This is intentionally kept
  // separate from TTB and will be cleaned up in a later bounded slice.
  if (!wellness?.id) {
    wellness = {
      ctl: 0,
      ramp_rate: 0,
      sleepScore: 0,
    } as IntervalsWellness;
  }

  // 2. Audit
  let report: AuditReport | null = null;
  try {
    if (history.length > 0) {
      report = await runFullAudit(false, user.id, history);
    } else {
      report = await runFullAudit(false, user.id);
    }
  } catch (e) {
    console.error('Warning: Failed to run auditor', e);
  }

  // 3. Activity Analysis (Titan Load)
  let titanAnalysis: TitanLoadCalculation | null = null;
  if (activities.length > 0) {
    const sorted = activities.sort((a, b) => (b.id || '').localeCompare(a.id || ''));
    const latest = sorted[0];
    const durMins = latest.moving_time ? latest.moving_time / 60 : 60;
    const intensity = latest.icu_intensity ? latest.icu_intensity / 100 : 0.5;
    const estimatedVol = durMins * 100;

    // Calculate Skill Multipliers
    const skillIds = new Set(dbUser?.skills.map((s) => s.skillId) || []);
    const effects = calculateSkillEffects(skillIds, wellness);
    const titanLoadMultiplier = effects.titanLoadMultiplier;

    titanAnalysis = AnalyticsService.calculateTitanLoad(
      estimatedVol,
      intensity,
      durMins,
      titanLoadMultiplier
    );
  }

  // 4. Progression & Oracle
  const progression = await Progression.getProgressionState(user.id);
  if (!progression) {
    // Should ideally create one if missing
  }

  const recoveryAnalysis = await RecoveryService.analyzeRecovery(user.id);

  const activePath = (dbUser?.activePath as TrainingPath) || 'WARDEN';

  // 4b. Fetch Titan State
  if (wellness) {
    await syncTitanStateWithWellness(wellness);
  }
  const titanRes = await ensureTitanAction();
  const titanState = titanRes?.data?.success ? titanRes.data.data : null;

  // 4c. Fetch Active Duel Status
  const { getDuelStatusAction } = await import('@/actions/pvp/duel');
  const duelRes = await getDuelStatusAction();
  const activeDuel = duelRes.success ? duelRes.duel : null;

  const oracleRec = await OracleService.consult(
    wellness,
    ttb,
    [],
    report,
    titanAnalysis,
    recoveryAnalysis,
    activePath,
    undefined, // weeklyMastery
    titanState ? { powerRating: titanState.powerRating } : undefined
  );

  // 4d. Fetch Bio-Logic Context
  const trainingContext = await import('@/services/data/TrainingContextService').then((mod) =>
    mod.TrainingContextService.getTrainingContext(user.id)
  );
  const todaysLoad = titanAnalysis ? titanAnalysis.titanLoad : 0;
  const realForecast = AnalyticsService.calculateTSBForecast(wellness, [todaysLoad]);

  // 5. Weekly Mastery Calculation
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const weeklyStrengthSets = await prisma.exerciseLog.count({
    where: {
      userId: user.id,
      date: { gte: sevenDaysAgo },
    },
  });

  const weeklyMobilitySessions = await prisma.meditationLog.count({
    where: {
      userId: user.id,
      date: { gte: sevenDaysAgo },
    },
  });

  const weeklyCardioTss = activities
    .filter((a) => {
      const dateStr = (a as any).start_date_local;
      return dateStr && new Date(dateStr) >= sevenDaysAgo;
    })
    .reduce((sum, a) => sum + ((a as any).training_load || 0), 0);

  const weeklyMastery = {
    strengthSets: weeklyStrengthSets,
    cardioTss: Math.round(weeklyCardioTss),
    mobilitySessions: weeklyMobilitySessions,
    mobilityLevel: dbUser?.mobilityLevel || 'I',
    recoveryLevel: dbUser?.recoveryLevel || 'I',
  };

  // 6. Initial Data Construction
  const initialData: DashboardInitialData = {
    wellness,
    activities,
    events,
    ttb,
    recommendation: oracleRec,
    auditReport: report,
    forecast: realForecast,
    titanAnalysis,
    activePath,
    weeklyMastery,
    activeDuel,
    trainingContext,
    powerRating: titanState?.powerRating ?? 0,
  };

  const hasCompletedOnboarding = !!dbUser?.hasCompletedOnboarding;

  const challenges = await getActiveChallengesAction().catch((e) => {
    console.error('Failed to fetch challenges', e);
    return [];
  });

  const liteMode = !!(dbUser?.preferences as any)?.liteMode;

  const strengthLeaderboardRes = await getStrengthLeaderboardAction(5).catch(() => null);
  const strengthLeaderboard = strengthLeaderboardRes?.data ?? [];

  return (
    <DashboardClient
      initialData={initialData}
      userData={dbUser}
      dbUser={dbUser}
      titanState={titanState}
      isMobile={false}
      hevyTemplates={hevyTemplates}
      hevyRoutines={hevyRoutines}
      intervalsConnected={!!(dbUser?.intervalsApiKey && dbUser?.intervalsAthleteId)}
      stravaConnected={!!dbUser?.stravaAccessToken}
      pocketCastsConnected={!!dbUser?.pocketCastsEnabled}
      faction={dbUser?.faction || 'HORDE'}
      hasCompletedOnboarding={hasCompletedOnboarding}
      isDemoMode={isDemoMode}
      challenges={challenges}
      activeDuel={activeDuel}
      liteMode={liteMode}
      leaderboardData={strengthLeaderboard}
    />
  );
}
