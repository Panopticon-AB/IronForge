import type { EquipmentType } from '@/data/equipmentDb';
import { WORKOUT_LIBRARY } from '@/data/workouts';
import { getHevyWorkouts } from '@/lib/hevy';
import { type WellnessData, getActivities, getWellness } from '@/lib/intervals';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { EquipmentService } from '@/services/game/EquipmentService';
import { GoalPriorityEngineService } from '@/services/goal-priority-engine';
import type {
  AuditReport,
  IntervalsActivity,
  IntervalsEvent,
  IntervalsWellness,
  OracleRecommendation,
  TTBIndices,
  TitanLoadCalculation,
} from '@/types';
import type { MacroPhase, SystemMetrics, WardensManifest } from '@/types/goals'; // Added MacroPhase
import type { HevyWorkout } from '@/types/hevy';
import type { OracleDecree } from '@/types/oracle';
import type { CardioLog, DuelChallenge, Exercise, ExerciseLog, Titan } from '@/types/prisma';
import type { TrainingPath, WeeklyMastery, WorkoutDefinition } from '@/types/training'; // Added WorkoutDefinition
import { mapDefinitionToSession } from '@/utils/workoutMapper';

// Types
type ExerciseLogWithExercise = ExerciseLog & { exercise: Exercise };
type PartialTitan = Pick<
  Titan,
  'isInjured' | 'xp' | 'powerRating' | 'strengthIndex' | 'cardioIndex'
>;

interface PrismaSet {
  reps?: number;
  weight?: number;
}

// Constants
const HISTORY_WINDOW_DAYS = 42;
const ACUTE_WINDOW_DAYS = 7;
const DUPE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

interface DailyLoad {
  date: Date;
  cardioLoad: number; // TSS
  strengthVolume: number; // kg
}

export interface CoachingStrategy {
  phase: MacroPhase;
  primaryFocus: string;
  recommendedWorkouts: WorkoutDefinition[];
  contextSummary: string;
  metrics: SystemMetrics;
}

export class OracleService {
  /**
   * Main entry point: Generates specific guidance for the Titan based on bio-data.
   */
  public static async generateDailyDecree(userId: string): Promise<OracleDecree> {
    // 1. Fetch Context (Enhanced with Power Rating)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        titan: {
          select: {
            isInjured: true,
            xp: true,
            powerRating: true,
            strengthIndex: true,
            cardioIndex: true,
          },
        },
        pvpProfile: {
          select: {
            rankScore: true,
          },
        },
      },
    });

    if (!user || !user.titan) {
      throw new Error('User or Titan not found');
    }

    // Fetch Active Duel Context (Match challenger or defender)
    const activeDuel = await prisma.duelChallenge.findFirst({
      where: {
        OR: [{ challengerId: userId }, { defenderId: userId }],
        status: 'ACTIVE',
        endDate: { gte: new Date() },
      },
      select: {
        challengerId: true,
        targetDistance: true,
        challengerDistance: true,
        defenderDistance: true,
        endDate: true,
        duelType: true,
      },
    });

    const now = new Date();
    const historyStart = new Date();
    historyStart.setDate(now.getDate() - HISTORY_WINDOW_DAYS);

    // 2. Fetch External Data
    let wellness: IntervalsWellness = {};
    let intervalsActivities: IntervalsActivity[] = [];
    let hevyWorkouts: HevyWorkout[] = [];

    if (user.intervalsApiKey && user.intervalsAthleteId) {
      try {
        const todayStr = now.toISOString().split('T')[0];
        const wData = await getWellness(todayStr, user.intervalsApiKey, user.intervalsAthleteId);
        if (wData && !Array.isArray(wData)) {
          const wellnessData = wData as WellnessData;
          wellness = {
            bodyBattery: wellnessData.bodyBattery ?? undefined,
            sleepScore: wellnessData.sleepScore ?? undefined,
            hrv: wellnessData.hrv ?? undefined,
            restingHR: wellnessData.restingHR ?? undefined,
          };
        }
        const startStr = historyStart.toISOString().split('T')[0];
        intervalsActivities = (await getActivities(
          startStr,
          todayStr,
          user.intervalsApiKey,
          user.intervalsAthleteId
        )) as IntervalsActivity[];
      } catch (e) {
        logger.error({ err: e }, 'Oracle: Failed to fetch Intervals data');
      }
    }

    if (user.hevyApiKey) {
      try {
        const result = await getHevyWorkouts(user.hevyApiKey, 1, 10);
        hevyWorkouts = result.workouts || [];
      } catch (e) {
        logger.error({ err: e }, 'Oracle: Failed to fetch Hevy data');
      }
    }

    // 3. Fetch Local Data
    const localCardio = await prisma.cardioLog.findMany({
      where: { userId, date: { gte: historyStart } },
    });

    const localStrength = await prisma.exerciseLog.findMany({
      where: { userId, date: { gte: historyStart } },
      include: { exercise: true },
    });

    // 4. Fetch Capabilities
    const capabilities = await EquipmentService.getUserCapabilities(userId);

    // 5. Harmonize Data
    const dailyLoads = OracleService.calculateCombinedHistory(
      historyStart,
      now,
      localCardio,
      localStrength,
      intervalsActivities,
      hevyWorkouts
    );

    // 6. Analysis
    const analysis = OracleService.analyzeLoads(dailyLoads);

    // 7. Determine Decree (V3 with Power Rating context)
    return OracleService.determineDecree(
      userId,
      user.titan,
      wellness,
      analysis,
      capabilities,
      (user.activePath as TrainingPath) || 'WARDEN',
      activeDuel,
      // Pass required GPE data if available, defaulting to mock/neutral for now to avoid breaking signature
      (user as unknown as { wardensManifest?: WardensManifest }).wardensManifest
    );
  }

  private static calculateCombinedHistory(
    _start: Date,
    _end: Date,
    localCardio: CardioLog[],
    localStrength: ExerciseLogWithExercise[],
    remoteCardio: IntervalsActivity[],
    remoteStrength: HevyWorkout[]
  ): Map<string, DailyLoad> {
    const loads = new Map<string, DailyLoad>();

    // Helper to get day key
    const getKey = (d: Date | string) => new Date(d).toISOString().split('T')[0];

    // Process Local Cardio
    for (const log of localCardio) {
      const key = getKey(log.date);
      const entry = loads.get(key) || {
        date: new Date(log.date),
        cardioLoad: 0,
        strengthVolume: 0,
      };
      entry.cardioLoad += log.load || 0;
      loads.set(key, entry);
    }

    // Process Remote Cardio (Intervals) - Dedup
    for (const activity of remoteCardio) {
      const actDate = new Date(activity.start_date_local || new Date());
      const isDupe = localCardio.some(
        (l: CardioLog) => Math.abs(new Date(l.date).getTime() - actDate.getTime()) < DUPE_WINDOW_MS
      );

      if (!isDupe) {
        const key = getKey(actDate);
        const entry = loads.get(key) || {
          date: actDate,
          cardioLoad: 0,
          strengthVolume: 0,
        };
        entry.cardioLoad += activity.icu_training_load || 0;
        loads.set(key, entry);
      }
    }

    // Process Local Strength (Volume)
    for (const log of localStrength) {
      const key = getKey(log.date);
      const entry = loads.get(key) || {
        date: new Date(log.date),
        cardioLoad: 0,
        strengthVolume: 0,
      };
      const sets = log.sets as unknown as PrismaSet[];
      const vol = sets.reduce((acc, s) => acc + (s.reps || 0) * (s.weight || 0), 0);
      entry.strengthVolume += vol;
      loads.set(key, entry);
    }

    // Process Remote Strength (Hevy) - Dedup
    for (const workout of remoteStrength) {
      const startTime = new Date(workout.start_time);
      const isDupe = localStrength.some(
        (l: ExerciseLogWithExercise) =>
          Math.abs(new Date(l.date).getTime() - startTime.getTime()) < DUPE_WINDOW_MS
      );

      if (!isDupe) {
        const key = getKey(startTime);
        const entry = loads.get(key) || {
          date: startTime,
          cardioLoad: 0,
          strengthVolume: 0,
        };

        let vol = 0;
        if (workout.exercises) {
          for (const ex of workout.exercises) {
            if (ex.sets) {
              for (const s of ex.sets) {
                vol += (s.reps || 0) * (s.weight_kg || 0);
              }
            }
          }
        }

        entry.strengthVolume += vol;
        loads.set(key, entry);
      }
    }

    return loads;
  }

  private static analyzeLoads(dailyLoads: Map<string, DailyLoad>) {
    const sorted = Array.from(dailyLoads.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    let acuteCardioSum = 0;
    let chronicCardioSum = 0;
    let acuteVolSum = 0;
    let chronicVolSum = 0;

    const now = new Date();
    const acuteStart = new Date();
    acuteStart.setDate(now.getDate() - ACUTE_WINDOW_DAYS);
    const chronicStart = new Date();
    chronicStart.setDate(now.getDate() - HISTORY_WINDOW_DAYS);

    for (const d of sorted) {
      if (d.date >= acuteStart) {
        acuteCardioSum += d.cardioLoad;
        acuteVolSum += d.strengthVolume;
      }
      if (d.date >= chronicStart) {
        chronicCardioSum += d.cardioLoad;
        chronicVolSum += d.strengthVolume;
      }
    }

    const acuteCardioAvg = acuteCardioSum / ACUTE_WINDOW_DAYS;
    const chronicCardioAvg = chronicCardioSum / HISTORY_WINDOW_DAYS;

    const acuteVolAvg = acuteVolSum / ACUTE_WINDOW_DAYS;
    const chronicVolAvg = chronicVolSum / HISTORY_WINDOW_DAYS;

    const cardioRatio = chronicCardioAvg > 0 ? acuteCardioAvg / chronicCardioAvg : 0;
    const volumeRatio = chronicVolAvg > 0 ? acuteVolAvg / chronicVolAvg : 0;
    const isVolumeSpike = cardioRatio > 1.3 || volumeRatio > 1.3;

    return {
      cardioRatio,
      volumeRatio,
      isVolumeSpike,
    };
  }

  /**
   * Generates a deterministic training strategy based on the user's current metrics and goals.
   * This "Grounds" the LLM with hard data from the GoalPriorityEngine.
   */
  public static generateTrainingStrategy(
    manifest: WardensManifest,
    metrics: SystemMetrics
  ): CoachingStrategy {
    const phase = GoalPriorityEngineService.selectPhase(manifest, metrics);
    const primaryFocus = manifest.goals[0]?.goal || 'FITNESS';
    const readinessFactor = Math.max(0.5, Math.min(1.2, (metrics.tsb + 30) / 60));

    const budget = {
      cns: 50 * readinessFactor,
      muscular: 50 * readinessFactor,
      metabolic: 50 * readinessFactor,
    };

    const recommendedWorkouts = GoalPriorityEngineService.selectWorkout(
      manifest,
      phase,
      budget,
      undefined,
      undefined,
      true
    );

    const contextSummary = `
TRAINING STRATEGY (Generated by GoalPriorityEngine):
- Current Phase: ${phase}
- Primary Goal: ${primaryFocus}
- Weekly Target: ${metrics.ctl.toFixed(0)} CTL (Fitness)
- Actionable Recommendation: ${recommendedWorkouts[0]?.name || 'Active Recovery'}
`;

    return {
      phase,
      primaryFocus,
      recommendedWorkouts,
      contextSummary,
      metrics,
    };
  }

  private static determineDecree(
    userId: string,
    titan: PartialTitan,
    wellness: IntervalsWellness,
    analysis: { cardioRatio: number; volumeRatio: number; isVolumeSpike: boolean },
    _capabilities: EquipmentType[] = [],
    _activePath = 'WARDEN',
    activeDuel: Partial<DuelChallenge> | null = null,
    manifest?: WardensManifest
  ): OracleDecree {
    const metrics: SystemMetrics = {
      ctl: (titan.cardioIndex || 0) + (titan.strengthIndex || 0),
      atl: analysis.isVolumeSpike ? 100 : 50,
      tsb: wellness.bodyBattery != null ? (wellness.bodyBattery - 50) * 1.5 : 0,
      hrvBaseline: (titan as unknown as { hrvBaseline?: number }).hrvBaseline || 60,
      soreness: (wellness as unknown as { soreness?: number }).soreness ?? 5,
      sleepScore: wellness.sleepScore ?? 70,
      bodyBattery: wellness.bodyBattery ?? 50,
      hrv: wellness.hrv ?? 50,
      mood: (titan as unknown as { mood?: string }).mood || 'NEUTRAL',
      consecutiveStalls: 0,
      acwr: Math.max(analysis.cardioRatio, analysis.volumeRatio),
    };

    let gpePhase: MacroPhase = 'BALANCED';
    if (manifest) {
      gpePhase = GoalPriorityEngineService.selectPhase(manifest, metrics);
    }

    if (titan.isInjured) {
      return {
        type: 'DEBUFF',
        code: 'INJURY_PRESERVATION',
        label: 'Decree of Preservation',
        description: 'The Titan is damaged. Rest to prevent scarring.',
        actions: {
          lockFeatures: ['HEAVY_LIFT', 'PVP'],
          lockTraining: true,
          notifyUser: true,
          urgency: 'HIGH',
        },
        effect: { modifier: 0.0, stat: 'all' },
      };
    }

    const lowBodyBattery = wellness.bodyBattery != null && wellness.bodyBattery < 30;
    if (gpePhase === 'DELOAD' || lowBodyBattery) {
      return {
        type: 'DEBUFF',
        code: 'REST_FORCED',
        label: 'Decree of Restoration',
        description:
          gpePhase === 'DELOAD'
            ? 'The Engine dictates a Deload week. Reduce volume to supercompensate.'
            : 'Bio-metrics indicate severe depletion. Rest required.',
        actions: {
          lockFeatures: ['HEAVY_LIFT', 'PR_ATTEMPT'],
          lockTraining: true,
          notifyUser: true,
          urgency: 'HIGH',
        },
        effect: { modifier: 0.6, stat: 'all' },
      };
    }

    if (activeDuel) {
      const daysLeft = activeDuel.endDate
        ? (new Date(activeDuel.endDate).getTime() - Date.now()) / (1000 * 3600 * 24)
        : 7;

      const isChallenger = activeDuel.challengerId === userId;
      const userDist =
        (isChallenger ? activeDuel.challengerDistance : activeDuel.defenderDistance) ?? 0;
      const oppDist =
        (isChallenger ? activeDuel.defenderDistance : activeDuel.challengerDistance) ?? 0;
      const targetDist = activeDuel.targetDistance || 0;
      const distanceToTarget = Math.max(0, targetDist - userDist);
      const trailingOpponent = oppDist > userDist;
      const distGap = trailingOpponent ? oppDist - userDist : 0;

      if (daysLeft < 2 && (distanceToTarget > 5 || distGap > 2)) {
        return {
          type: 'BUFF',
          code: 'PVP_CRISIS',
          label: '🔥 Final Push',
          description: `Duel ends in ${Math.ceil(daysLeft)} days. Go hard!`,
          actions: { unlockBuffs: ['PVP_BONUS'], notifyUser: true, urgency: 'HIGH' },
          effect: { xpMultiplier: 1.3, stat: 'cardio' },
        };
      }
    }

    if (gpePhase === 'PEAK') {
      return {
        type: 'BUFF',
        code: 'PEAK_PERFORMANCE',
        label: 'Decree of the Apex',
        description: 'Peaking Phase active. Intensity is paramount. Break records.',
        actions: { notifyUser: true, urgency: 'MEDIUM', unlockBuffs: ['PR_ATTEMPT'] },
        effect: { xpMultiplier: 1.25, stat: 'strength' },
      };
    }

    if (gpePhase === 'CARDIO_BUILD' && metrics.tsb > 10) {
      return {
        type: 'NEUTRAL',
        code: 'CARDIO_FOCUS',
        label: 'Decree of Endurance',
        description: 'Focus on aerobic base building.',
        actions: { notifyUser: false, urgency: 'LOW' },
        effect: { xpMultiplier: 1.0 },
      };
    }

    return {
      type: 'NEUTRAL',
      code: 'BASELINE_GRIND',
      label: 'Decree of Discipline',
      description: `Phase: ${gpePhase}. Maintain consistency.`,
      actions: { notifyUser: false, urgency: 'LOW' },
      effect: { xpMultiplier: 1.0 },
    };
  }

  /**
   * Legacy/Core Consultation: Returns a specific workout recommendation.
   * Integrates with the new Decree system.
   */
  public static async consult(
    wellness: IntervalsWellness,
    _ttb: TTBIndices,
    _events: IntervalsEvent[] = [],
    _auditReport?: AuditReport | null,
    _titanAnalysis?: TitanLoadCalculation | null,
    recoveryAnalysis?: { state: string; reason: string } | null,
    activePath: TrainingPath = 'WARDEN',
    _weeklyMastery?: WeeklyMastery,
    titanState?: { dailyDecree?: OracleDecree | null; powerRating?: number } | null
  ): Promise<OracleRecommendation> {
    const recommendation: OracleRecommendation = {
      type: 'GRIND',
      title: 'Daily Training',
      rationale: 'Based on your current status...',
      priorityScore: 50,
      generatedSession: undefined,
      primaryFocus: 'Strength & Conditioning',
      equipmentId: 'Standard Gym',
    };

    const bodyBattery = wellness.bodyBattery;
    const lowBodyBattery = bodyBattery != null && bodyBattery < 30;
    const recoveryRequested = recoveryAnalysis?.state === 'LOW_RECOVERY';

    if (_auditReport?.mobility && _auditReport.mobility.neglectedRegions.length > 0) {
      const topNeglected = _auditReport.mobility.neglectedRegions[0];
      const recommended = _auditReport.mobility.recommendedExercises[0];

      if (recommended) {
        recommendation.type = 'RECOVERY';
        recommendation.title = 'Mobility Focus';
        recommendation.primaryFocus = 'Mobility';
        recommendation.equipmentId = 'Bodyweight';
        recommendation.rationale = `Your ${topNeglected} mobility is lagging. Try ${recommended.exerciseName}. ${_auditReport.mobility.insight}`;
        recommendation.priorityScore = 60;
      }
    }

    if (activePath === 'PATHFINDER') {
      recommendation.type = 'CARDIO_VALIDATION';
      recommendation.title = 'Engine Builder';
      recommendation.primaryFocus = 'Zone 2/3 Cardio';
      recommendation.equipmentId = 'Titan T80 / Cycling';
      recommendation.rationale = 'Focus on cardiovascular efficiency.';
      recommendation.priorityScore = 70;
      const runWorkouts = WORKOUT_LIBRARY.filter((w) => w.type === 'RUN');
      if (runWorkouts.length > 0) {
        recommendation.generatedSession = mapDefinitionToSession(runWorkouts[0]);
      }
    } else if (activePath === 'JUGGERNAUT') {
      recommendation.type = 'PR_ATTEMPT';
      recommendation.title = 'Iron Temple';
      recommendation.primaryFocus = 'Strength';
      recommendation.equipmentId = 'Iron Mines Setup';
      recommendation.rationale = 'Focus on heavy compound lifts.';
      recommendation.priorityScore = 80;
      const strengthWorkouts = WORKOUT_LIBRARY.filter((w) => w.type === 'STRENGTH');
      if (strengthWorkouts.length > 0) {
        recommendation.generatedSession = mapDefinitionToSession(strengthWorkouts[0]);
      }
    }

    if (lowBodyBattery || recoveryRequested) {
      recommendation.type = 'RECOVERY';
      recommendation.title = 'Active Recovery';
      recommendation.primaryFocus = 'Recovery';
      recommendation.equipmentId = 'None / Mobility';
      recommendation.rationale = lowBodyBattery
        ? `Low Body Battery (${bodyBattery}) indicates limited recovery capacity. Prioritize mobility and light movement.`
        : `Recovery analysis recommends a lower-load day: ${recoveryAnalysis?.reason || 'recovery state detected'}.`;
      recommendation.priorityScore = 90;
      const recoveryWorkouts = WORKOUT_LIBRARY.filter((w) => w.intensity === 'LOW');
      if (recoveryWorkouts.length > 0) {
        recommendation.generatedSession = mapDefinitionToSession(recoveryWorkouts[0]);
      }
    }

    if (titanState?.dailyDecree?.type === 'DEBUFF') {
      recommendation.type = 'TAPER';
      recommendation.title = 'Tactical Retreat';
      recommendation.rationale = `Titan Decree (${titanState.dailyDecree.label}) dictates caution.`;
      recommendation.priorityScore = 95;
    }

    if (titanState?.powerRating) {
      const pr = titanState.powerRating;
      if (pr >= 750) {
        recommendation.rationale += ` Your Power Rating (${pr}) is Elite. Maintenance of intensity is key.`;
      } else if (pr < 300) {
        recommendation.rationale += ` Power Rating (${pr}) indicates room for foundational growth.`;
      } else {
        recommendation.rationale += ` Power Rating (${pr}) is stable.`;
      }
    }

    return recommendation;
  }
}
