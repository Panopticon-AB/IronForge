export type SessionStatus =
  | 'ACTIVE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'ABANDONED';

export type SessionOutcome =
  | 'STANDARD_CLEAR'
  | 'FULL_CLEAR'
  | 'BOSS_CLEAR'
  | 'MINIMUM_CLEAR'
  | 'QUIT_SMART'
  | 'KLAR_FOR_IDAG'
  | 'ABANDONED';

export type RecommendationAction =
  | 'INCREASE'
  | 'HOLD'
  | 'DECREASE'
  | 'BACKOFF'
  | 'FINISH';

export type RecommendationReason =
  | 'LOW_RPE'
  | 'TARGET_MET'
  | 'HIGH_RPE'
  | 'MISSED_REPS'
  | 'EXPLICIT_STOP'
  | 'RECOVERY_CONSTRAINT'
  | 'CHALLENGE_COMPLETE';

export interface EquipmentProfile {
  id: string;
  name: string;
  availableLoadStepsKg: number[];
  exerciseVariant: string;
}

export interface SetPrescription {
  id: string;
  sequence: number;
  targetLoadKg: number;
  targetReps: number;
  targetRpe?: number;
  restSeconds?: number;
}

export interface SetResult {
  prescriptionId: string;
  completedAt: string;
  actualLoadKg: number;
  actualReps: number;
  rpe?: number;
  note?: string;
}

export interface ChallengeDefinition {
  id: string;
  version: number;
  name: string;
  exerciseId: string;
  equipmentProfileId: string;
  prescriptions: SetPrescription[];
}

export interface LiveForgeSession {
  id: string;
  challengeId: string;
  challengeVersion: number;
  exerciseId: string;
  equipmentProfile: EquipmentProfile;
  status: SessionStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  outcome?: SessionOutcome;
  currentPrescription?: SetPrescription;
  setHistory: SetResult[];
  stopRequestedAt?: string;
}

export interface NextSetRecommendation {
  action: RecommendationAction;
  prescription?: SetPrescription;
  reason: RecommendationReason;
  explanationKey: string;
  safetyFlags: string[];
}

export function requestSessionStop(
  session: LiveForgeSession,
  requestedAt: string,
): LiveForgeSession {
  if (session.status === 'COMPLETED' || session.status === 'ABANDONED') {
    return session;
  }

  return {
    ...session,
    status: 'COMPLETED',
    outcome: 'QUIT_SMART',
    stopRequestedAt: requestedAt,
    completedAt: requestedAt,
    updatedAt: requestedAt,
    currentPrescription: undefined,
  };
}

export function appendSetResult(
  session: LiveForgeSession,
  result: SetResult,
): LiveForgeSession {
  if (session.status !== 'ACTIVE') {
    throw new Error('Set results can only be added to an active session');
  }

  if (session.setHistory.some((set) => set.prescriptionId === result.prescriptionId)) {
    return session;
  }

  return {
    ...session,
    setHistory: [...session.setHistory, result],
    updatedAt: result.completedAt,
  };
}
