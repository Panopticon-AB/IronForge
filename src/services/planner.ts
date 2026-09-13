import { getWellness } from '@/lib/intervals';
import { runFullAudit } from '@/services/auditor-orchestrator';
import prisma from '../lib/prisma';
import type { IntervalsActivity, IntervalsWellness, TrainingPath } from '../types';
import { AnalyticsService } from './analytics';
import { OracleService } from './oracle';

// Note: Hevy integration removed per data-source-reconciliation.md
// Strength data now comes from IronForge internal logs only.

/**
 * Server-Side Planner Service
 * Orchestrates data from DB and Intervals to generate weekly plans.
 *
 * DATA SOURCES:
 * - Strength: IronForge PostgreSQL (internal logs from IronMines)
 * - Cardio: Garmin -> Intervals.icu
 * - Wellness: Garmin -> Intervals.icu
 */
export const PlannerService = {
  /**
   * Triggers the generation of a weekly plan for a user.
   * Can be called from Server Actions or Cron Jobs.
   */
  triggerWeeklyPlanGeneration: async (userId: string) => {
    console.log(`Planner: Generating plan for user ${userId}`);

    // 1. Fetch User Credentials & Settings
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        exerciseLogs: {
          where: {
            date: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days for TTB/Audit
            },
          },
        },
        cardioLogs: {
          where: {
            date: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        },
      },
    });

    if (!user) throw new Error('User not found');

    // 2. Fetch Strength Data (IronForge internal logs)
    // runFullAudit now uses userId to fetch from IronForge DB
    const auditReport = await runFullAudit(true, userId);

    // 3. Fetch Intervals Wellness
    // Provider absence is not physiology: Oracle and TTB each receive only
    // evidence that actually exists at their boundary.
    const wellness: IntervalsWellness = {};
    const ttbWellness: IntervalsWellness = {};

    if (user.intervalsApiKey && user.intervalsAthleteId) {
      const today = new Date().toISOString().split('T')[0];
      const w = await getWellness(today, user.intervalsApiKey, user.intervalsAthleteId);
      if (w && !Array.isArray(w)) {
        if (w.id != null) wellness.id = w.id;
        if (w.bodyBattery != null) wellness.bodyBattery = w.bodyBattery;
        if (w.sleepScore != null) wellness.sleepScore = w.sleepScore;
        if (w.hrv != null) wellness.hrv = w.hrv;
        if (w.restingHR != null) wellness.restingHR = w.restingHR;
        if (w.vo2max != null) wellness.vo2max = w.vo2max;
        if (w.ctl != null) wellness.ctl = w.ctl;
        if (w.atl != null) wellness.atl = w.atl;
        if (w.tsb != null) wellness.tsb = w.tsb;
        if (w.sleepSecs != null) wellness.sleepSecs = w.sleepSecs;
        if (w.rampRate != null) wellness.ramp_rate = w.rampRate;

        if (w.hrv != null) ttbWellness.hrv = w.hrv;
        if (w.tsb != null) ttbWellness.tsb = w.tsb;
      }
    }

    // 4. Map Data for Analytics (TTB Calculation)
    const activities: IntervalsActivity[] = user.cardioLogs.map((l) => ({
      id: l.intervalsId || undefined,
      start_date_local: l.date.toISOString(),
      type: l.type || undefined,
      moving_time: l.duration,
      ...(l.averageHr == null ? {} : { icu_intensity: l.averageHr > 160 ? 90 : 60 }),
      ...(l.load == null ? {} : { icu_training_load: l.load }),
    }));

    // TTB only needs strength recency and Epic/PR evidence. Do not fabricate
    // RPE or e1RM values merely to satisfy a broader analytics type.
    const strengthHistory = user.exerciseLogs.map((log) => ({
      date: log.date.toISOString(),
      isEpic: log.isPersonalRecord,
    }));

    const ttb = AnalyticsService.calculateTTB(strengthHistory, activities, ttbWellness);

    // Keep audit evidence separate from TTB. `lowest` only represents a
    // complete three-domain TTB comparison; auditReport is passed independently.

    // 6. Generate Plan via Oracle
    const recommendation = await OracleService.consult(
      wellness,
      ttb,
      [], // events
      auditReport,
      undefined, // titanAnalysis
      null, // recoveryAnalysis
      (user.activePath as TrainingPath) || 'HYBRID_WARDEN'
    );

    // Wrap recommendation into a week plan structure
    const plan = {
      id: `plan_${Date.now()}`,
      weekStart: new Date().toISOString(),
      days: [
        {
          recommendation,
          dayOfWeek: new Date().getDay(),
          date: new Date().toISOString(),
          isRestDay: false,
        },
      ],
      createdAt: new Date().toISOString(),
    };

    // 7. Save to DB
    // Use Prisma.InputJsonValue from @/types/prisma
    await prisma.weeklyPlan.create({
      data: {
        userId: user.id,
        weekStart: new Date(plan.weekStart),
        plan: plan.days as unknown as import('@/types/prisma').Prisma.InputJsonValue,
      },
    });

    console.log(`Planner: Plan generated and saved for user ${userId}`);
    return plan;
  },
};
