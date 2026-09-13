'use server';

import { getWellness, type WellnessData } from '@/lib/intervals';
import prisma from '@/lib/prisma';
import { AnalyticsService } from '@/services/analytics';
import { GeminiService } from '@/services/gemini';
import type { IntervalsActivity, IntervalsWellness } from '@/types';
import type { Prisma } from '@prisma/client';

import { getSession } from '@/lib/auth';
import { EquipmentService } from '@/services/game/EquipmentService';
import { revalidatePath } from 'next/cache';

function getNextMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() + (day === 0 ? 1 : 8 - day);
  const nextMonday = new Date(d.setDate(diff));
  nextMonday.setHours(0, 0, 0, 0);
  return nextMonday;
}

function normalizeProgramWellness(source: WellnessData): IntervalsWellness {
  const wellness: IntervalsWellness = {};

  if (source.id !== undefined) wellness.id = source.id;
  if (source.bodyBattery != null) wellness.bodyBattery = source.bodyBattery;
  if (source.sleepScore != null) wellness.sleepScore = source.sleepScore;
  if (source.hrv != null) wellness.hrv = source.hrv;
  if (source.restingHR != null) wellness.restingHR = source.restingHR;
  if (source.vo2max != null) wellness.vo2max = source.vo2max;
  if (source.ctl != null) wellness.ctl = source.ctl;
  if (source.atl != null) wellness.atl = source.atl;
  if (source.tsb != null) wellness.tsb = source.tsb;
  if (source.sleepSecs != null) wellness.sleepSecs = source.sleepSecs;
  if (source.rampRate != null) wellness.ramp_rate = source.rampRate;

  return wellness;
}

export async function generateProgramAction(preferences: {
  intent: string;
  daysPerWeek: number;
}) {
  // 1. Auth Check
  const session = await getSession();
  if (!session?.user) throw new Error('Unauthorized');

  const sessionUser = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!sessionUser) throw new Error('User not found');

  // 2. Fetch Context
  let wellness: IntervalsWellness = {};
  if (sessionUser.intervalsApiKey && sessionUser.intervalsAthleteId) {
    const today = new Date().toISOString().split('T')[0];
    const w = await getWellness(today, sessionUser.intervalsApiKey, sessionUser.intervalsAthleteId);
    if (w && !Array.isArray(w)) wellness = normalizeProgramWellness(w);
  }

  // 3. Fetch real TTB Analysis
  const [dbLogs, dbCardio] = await Promise.all([
    prisma.exerciseLog.findMany({
      where: { userId: session.user.id },
      orderBy: { date: 'desc' },
      take: 20,
    }),
    prisma.cardioLog.findMany({
      where: { userId: session.user.id },
      orderBy: { date: 'desc' },
      take: 10,
    }),
  ]);

  const history = dbLogs.map((log) => ({
    date: log.date.toISOString(),
    isEpic: log.isPersonalRecord,
  }));

  const activities: IntervalsActivity[] = dbCardio.map((c) => ({
    moving_time: c.duration,
    type: c.type,
    start_date_local: c.date.toISOString(),
    ...(c.averageHr != null ? { icu_intensity: c.averageHr > 160 ? 90 : 60 } : {}),
  }));

  const ttb = AnalyticsService.calculateTTB(history, activities, wellness);

  // 4. Fetch Capabilities & Status
  const [capabilities, titan] = await Promise.all([
    EquipmentService.getUserCapabilities(session.user.id),
    prisma.titan.findUnique({ where: { userId: session.user.id } }),
  ]);

  const injuries = titan?.isInjured ? ['General Fatigue/Injury'] : [];

  // 5. Call Gemini
  const plan = await GeminiService.generateWeeklyPlanAI(
    {
      heroName: sessionUser.heroName || 'Titan',
      level: sessionUser.level,
      trainingPath: sessionUser.activePath || 'WARDEN',
      equipment: capabilities,
      injuries: injuries,
    },
    {
      wellness: wellness,
      ttb,
      intent: preferences.intent,
      daysPerWeek: preferences.daysPerWeek,
    }
  );

  return { success: true, plan };
}

export async function saveProgramAction(plan: Record<string, unknown>) {
  const session = await getSession();
  if (!session?.user) throw new Error('Unauthorized');

  const sessionUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!sessionUser) throw new Error('User not found');

  // Persist to DB
  await prisma.weeklyPlan.create({
    data: {
      userId: sessionUser.id,
      weekStart: getNextMonday(),
      plan: plan as Prisma.InputJsonValue,
    },
  });

  revalidatePath('/dashboard');
  return { success: true };
}