export type HabitifyAdherenceStatus = 'COMPLETED' | 'SKIPPED' | 'NONE';

export type HabitifyAdherenceReasonCode =
  | 'SUSTAINABLE_MISSION_COMPLETED'
  | 'MINIMUM_CLEAR_COMPLETED'
  | 'QUIT_SMART_SUCCESS'
  | 'RECOVERY_RESPECTED'
  | 'TRUE_REST_DAY'
  | 'LIFE_CONSTRAINT_NO_DEBT'
  | 'NO_ACTION';

export type MissionClearLevel = 'MINIMUM' | 'STANDARD' | 'BOSS';

export type HabitifyAdherenceInput =
  | {
      outcome: 'COMPLETED';
      clearLevel: MissionClearLevel;
      downgradedFromQuality?: boolean;
    }
  | { outcome: 'QUIT_SMART' }
  | { outcome: 'RECOVERY_RESPECTED' }
  | { outcome: 'TRUE_REST' }
  | { outcome: 'LIFE_CONSTRAINT' }
  | { outcome: 'NONE' };

export interface HabitifyAdherenceDecision {
  status: HabitifyAdherenceStatus;
  reasonCode: HabitifyAdherenceReasonCode;
}

/**
 * Maps an already-decided IronForge mission outcome to Habitify adherence semantics.
 *
 * This adapter is intentionally downstream-only: it cannot choose training load,
 * upgrade a session, or create make-up debt. Habitify records whether the user
 * followed the sustainable decision, not how hard the session was.
 */
export function mapHabitifyAdherence(
  input: HabitifyAdherenceInput
): HabitifyAdherenceDecision {
  switch (input.outcome) {
    case 'COMPLETED':
      return {
        status: 'COMPLETED',
        reasonCode:
          input.clearLevel === 'MINIMUM'
            ? 'MINIMUM_CLEAR_COMPLETED'
            : 'SUSTAINABLE_MISSION_COMPLETED',
      };

    case 'QUIT_SMART':
      return {
        status: 'COMPLETED',
        reasonCode: 'QUIT_SMART_SUCCESS',
      };

    case 'RECOVERY_RESPECTED':
      return {
        status: 'SKIPPED',
        reasonCode: 'RECOVERY_RESPECTED',
      };

    case 'TRUE_REST':
      return {
        status: 'SKIPPED',
        reasonCode: 'TRUE_REST_DAY',
      };

    case 'LIFE_CONSTRAINT':
      return {
        status: 'SKIPPED',
        reasonCode: 'LIFE_CONSTRAINT_NO_DEBT',
      };

    case 'NONE':
      return {
        status: 'NONE',
        reasonCode: 'NO_ACTION',
      };
  }
}
