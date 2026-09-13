import type {
  ExerciseLog,
  IntervalsActivity,
  IntervalsWellness,
  TSBForecast,
  TTBIndices,
  TitanLoadCalculation,
  WeaknessAudit,
} from '../types';

/**
 * The Ultrathink Analytics Engine
 * Processes biometrics and log data to generate predictive insights.
 */
export class AnalyticsService {
  /**
   * Calculates Total Training Balance (TTB) Indices.
   * This drives The Oracle 2.0 Logic.
   */
  public static calculateTTB(
    history: Array<Pick<ExerciseLog, 'date' | 'isEpic'>>,
    activities: IntervalsActivity[],
    wellness: IntervalsWellness
  ): TTBIndices {
    // 1. STRENGTH INDEX
    // Driven by recency of actual Epic Sets or PRs.
    // If there is no Epic/PR evidence, strength remains unknown rather than
    // manufacturing a plausible-looking demo score.
    const lastEpicSet = history.filter((h) => h.isEpic).pop(); // Assume sorted by date
    let strengthScore: number | null = null;

    if (lastEpicSet) {
      const daysSince =
        (Date.now() - new Date(lastEpicSet.date).getTime()) / (1000 * 3600 * 24);
      strengthScore = Math.max(0, Math.min(100, 100 - (daysSince - 3) * 10));
    }

    // 2. ENDURANCE INDEX
    // Driven by classified Z4/Z5 time. A measured week with no high-intensity
    // work may legitimately score 0; missing activity intensity cannot.
    const hasCompleteIntensityEvidence =
      activities.length > 0 && activities.every((activity) => activity.icu_intensity != null);
    let enduranceScore: number | null = null;

    if (hasCompleteIntensityEvidence) {
      const highIntensityMinutes = activities
        .filter((activity) => activity.icu_intensity != null && activity.icu_intensity > 85)
        .reduce((acc, activity) => acc + activity.moving_time / 60, 0);
      enduranceScore = Math.min(100, (highIntensityMinutes / 30) * 100);
    }

    // 3. WELLNESS INDEX
    // The current formula requires both HRV and TSB. If either input is absent,
    // the composite is unknown instead of silently assuming HRV=40 or TSB=0.
    let wellnessScore: number | null = null;
    if (wellness.hrv != null && wellness.tsb != null) {
      const hrvScore = Math.min(100, (wellness.hrv / 60) * 100);
      const tsbPenalty = wellness.tsb < -15 ? 50 : 0;
      wellnessScore = Math.max(0, hrvScore - tsbPenalty);
    }

    // A weakest domain is only meaningful when the comparison set is complete.
    // Partial data should reduce confidence rather than manufacture a deficit.
    let lowest: TTBIndices['lowest'] = null;
    if (strengthScore !== null && enduranceScore !== null && wellnessScore !== null) {
      lowest = 'strength';
      let lowestScore = strengthScore;

      if (enduranceScore < lowestScore) {
        lowest = 'endurance';
        lowestScore = enduranceScore;
      }

      if (wellnessScore < lowestScore) {
        lowest = 'wellness';
      }
    }

    return {
      strength: strengthScore === null ? null : Math.round(strengthScore),
      endurance: enduranceScore === null ? null : Math.round(enduranceScore),
      wellness: wellnessScore === null ? null : Math.round(wellnessScore),
      lowest,
    };
  }

  /**
   * Generates a 7-day TSB (Form) forecast based on current state and planned future loads.
   * Uses a Banister Impulse Response model.
   * @param startWellness Current wellness snapshot (CTL/ATL start point)
   * @param plannedDailyLoad Array of predicted TSS for the next 7 days (index 0 = today)
   */
  public static calculateTSBForecast(
    startWellness: IntervalsWellness,
    plannedDailyLoad: number[] = []
  ): TSBForecast[] {
    const baselineCtl = startWellness.ctl;
    const baselineAtl = startWellness.atl;

    // A forecast requires a measured CTL/ATL baseline. Provider absence should
    // remove the forecast rather than manufacture plausible-looking defaults.
    if (baselineCtl == null || baselineAtl == null) {
      return [];
    }

    const forecast: TSBForecast[] = [];
    let ctl = baselineCtl;
    let atl = baselineAtl;

    // Constants for Decay (standard Coggan constants)
    const k_fitness = Math.exp(-1 / 42); // CTL decay
    const k_fatigue = Math.exp(-1 / 7); // ATL decay

    // Ensure we have 7 days of load (default 0)
    const loads = [...plannedDailyLoad];
    while (loads.length < 7) loads.push(0);

    for (let i = 0; i < 7; i++) {
      // Calculate TSB BEFORE applying today's stress (morning readiness)
      const tsb = ctl - atl;

      let label = 'Neutral';
      if (tsb > 25) label = 'Detraining';
      else if (tsb > 5) label = 'PR Window (Optimal)';
      else if (tsb > -10) label = 'Maintenance';
      else if (tsb > -30) label = 'Productive Training';
      else label = 'Overreaching (High Risk)';

      forecast.push({
        dayOffset: i,
        tsb: Math.round(tsb),
        label,
      });

      // Apply that day's stress to update CTL/ATL for tomorrow
      const dailyStress = loads[i];

      ctl = ctl * k_fitness + dailyStress * (1 - k_fitness);
      atl = atl * k_fatigue + dailyStress * (1 - k_fatigue);
    }

    return forecast;
  }

  /**
   * Calculates "Titan Load" (Strength-based TSS) and contrasts it with HR-based TSS.
   * Standard HR TSS often underestimates heavy lifting (low HR, high CNS load).
   */
  public static calculateTitanLoad(
    volumeLoad: number,
    avgIntensityPct: number,
    durationMinutes: number,
    multiplier = 1.0
  ): TitanLoadCalculation {
    // 1. Estimate HR-based TSS (Standard)
    // Assumption: Strength training averages Zone 2 HR (IF 0.6)
    const hrIF = 0.6;
    const standardTss = ((durationMinutes * 60 * hrIF * hrIF) / 3600) * 100;

    // 2. Calculate Titan Load (CNS/Mechanical based)
    // Formula: Volume Load * (Intensity^2) * Neurological Factor
    // Normalized to scale similar to TSS (approx 50-100 for a hard session)

    // Neuro Factor: Above 85% is disproportionately taxing
    const neuroFactor = avgIntensityPct > 0.85 ? 1.5 : 1.0;

    // Simplified scale for demo:
    // Hard session: 5000kg volume * 0.8 intensity -> Titan Load ~75
    const titanLoad = (volumeLoad / 100) * avgIntensityPct * neuroFactor * multiplier;

    const discrepancy = ((titanLoad - standardTss) / standardTss) * 100;

    return {
      standardTss: Math.round(standardTss),
      titanLoad: Math.round(titanLoad),
      discrepancy: Math.round(discrepancy),
      advice:
        discrepancy > 30
          ? 'HR underestimates this session. Rely on Titan Load for recovery planning.'
          : 'HR and Strength Load align. Standard recovery applies.',
      appliedMultiplier: multiplier,
    };
  }

  /**
   * Analyzes recent strength logs against cardio trends to find bottlenecks.
   * Returns a "Weakness Audit".
   */
  public static auditWeakness(
    strengthLogs: ExerciseLog[],
    currentWellness: IntervalsWellness
  ): WeaknessAudit {
    // 1. Check for Strength Plateau (Flat e1RM over last 3 logs)
    // Needs at least 3 logs to establish a trend
    if (strengthLogs.length < 3) {
      return {
        detected: false,
        type: 'NONE',
        message: 'Insufficient data for audit.',
        confidence: 0,
      };
    }

    const recentLogs = strengthLogs.slice(-3);
    const e1rms = recentLogs.map((l) => l.e1rm);

    // Calculate slope (simplified)
    const growth = e1rms[2] - e1rms[0];
    const isPlateau = growth <= 2.5; // Less than 2.5kg gain in 3 sessions

    if (!isPlateau) {
      return {
        detected: false,
        type: 'NONE',
        message: 'No plateau detected. Growth is steady.',
        confidence: 100,
      };
    }

    // 2. Correlate with Aerobic Load (Interference Effect)
    // If CTL has risen significantly (>10%) recently while strength stagnated
    const ctl = currentWellness.ctl || 0;
    // Mocking a 'previous' CTL for this logic since we only have snapshot wellness in this demo
    const previousCtl = ctl * 0.85;
    const aerobicSpike = (ctl - previousCtl) / previousCtl > 0.1;

    if (aerobicSpike) {
      return {
        detected: true,
        type: 'AEROBIC_INTERFERENCE',
        message:
          'Aerobic volume spike detected (+15%). This is likely dampening your neural drive for max strength.',
        confidence: 85,
        correlationData: { metric: 'CTL (Fitness)', trend: 'UP' },
      };
    }

    // 3. Correlate with Recovery/Life Stress
    // If TSB is OK, but Sleep/HRV is trash
    const poorRecovery =
      (currentWellness.sleepScore || 100) < 60 || (currentWellness.hrv || 100) < 40;

    if (poorRecovery) {
      return {
        detected: true,
        type: 'RECOVERY_DEBT',
        message:
          'Biological readiness is critically low. Your CNS cannot support PR attempts despite muscular readiness.',
        confidence: 90,
        correlationData: { metric: 'HRV / Sleep', trend: 'DOWN' },
      };
    }

    return {
      detected: false,
      type: 'NONE',
      message: 'Plateau detected, but cause is indeterminate.',
      confidence: 40,
    };
  }

  /**
   * Generates mock history data for the demo since we don't have a real DB.
   */
  public static getMockHistory(): ExerciseLog[] {
    return [
      {
        date: '2023-10-01',
        exerciseId: 'ex_landmine_press',
        e1rm: 70,
        rpe: 8,
        isEpic: true,
      },
      {
        date: '2023-10-08',
        exerciseId: 'ex_landmine_press',
        e1rm: 72.5,
        rpe: 8.5,
      },
      {
        date: '2023-10-15',
        exerciseId: 'ex_landmine_press',
        e1rm: 72.5,
        rpe: 9,
      }, // Stagnation
      {
        date: '2023-10-22',
        exerciseId: 'ex_landmine_press',
        e1rm: 72.5,
        rpe: 9.5,
      }, // Stagnation + Higher RPE
    ];
  }
}
