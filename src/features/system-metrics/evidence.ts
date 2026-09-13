import type { SystemMetrics } from '@/types/goals';

export type SystemMetricsConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Provider-neutral evidence before values cross into the numeric GPE model.
 *
 * `null` and `undefined` both mean "not observed". A measured numeric zero is
 * real evidence and must therefore survive unchanged.
 */
export type SystemMetricsEvidence = {
  [K in keyof SystemMetrics]?: SystemMetrics[K] | null;
};

export const RECOVERY_SYSTEM_METRIC_KEYS = [
  'hrv',
  'hrvBaseline',
  'tsb',
  'sleepScore',
  'bodyBattery',
  'soreness',
  'mood',
] as const satisfies readonly (keyof SystemMetrics)[];

export type RecoverySystemMetricKey = (typeof RECOVERY_SYSTEM_METRIC_KEYS)[number];
export type RecoverySystemMetrics = Pick<SystemMetrics, RecoverySystemMetricKey>;

const CRITICAL_RECOVERY_SIGNAL_KEYS = ['bodyBattery', 'sleepScore', 'hrv', 'tsb'] as const satisfies readonly RecoverySystemMetricKey[];

export interface SystemMetricsEvidenceResolution {
  /** Only observed values. No numeric imputation happens in this resolver. */
  metrics: Partial<RecoverySystemMetrics>;
  missingSignals: RecoverySystemMetricKey[];
  confidence: SystemMetricsConfidence;
  /** Reserved for later explicit decision fallbacks; empty while no imputation occurs. */
  assumptions: string[];
}

/**
 * Normalizes recovery evidence without manufacturing physiology.
 *
 * Confidence reflects evidence completeness only; it is not a readiness score.
 * Missing two or more critical recovery signals is LOW confidence, one missing
 * critical signal is MEDIUM, and complete critical evidence is HIGH.
 */
export function resolveRecoverySystemMetricsEvidence(
  evidence: SystemMetricsEvidence
): SystemMetricsEvidenceResolution {
  const metrics: Partial<RecoverySystemMetrics> = {
    ...(evidence.hrv != null ? { hrv: evidence.hrv } : {}),
    ...(evidence.hrvBaseline != null ? { hrvBaseline: evidence.hrvBaseline } : {}),
    ...(evidence.tsb != null ? { tsb: evidence.tsb } : {}),
    ...(evidence.sleepScore != null ? { sleepScore: evidence.sleepScore } : {}),
    ...(evidence.bodyBattery != null ? { bodyBattery: evidence.bodyBattery } : {}),
    ...(evidence.soreness != null ? { soreness: evidence.soreness } : {}),
    ...(evidence.mood != null ? { mood: evidence.mood } : {}),
  };

  const missingSignals = RECOVERY_SYSTEM_METRIC_KEYS.filter(
    (key) => evidence[key] == null
  );
  const missingCriticalSignals = CRITICAL_RECOVERY_SIGNAL_KEYS.filter(
    (key) => evidence[key] == null
  ).length;

  const confidence: SystemMetricsConfidence =
    missingCriticalSignals === 0 ? 'HIGH' : missingCriticalSignals === 1 ? 'MEDIUM' : 'LOW';

  return {
    metrics,
    missingSignals,
    confidence,
    assumptions: [],
  };
}
