import {
  CanonicalStrengthSetSchema,
  type CanonicalStrengthSetInput,
  type ValidatedCanonicalStrengthSet,
} from './write-contract';
import type { StrengthSessionEvidence } from './domain';

export interface StrengthSessionWritePayload {
  sessionId: string;
  source: 'IRONFORGE_LIVE_FORGE' | 'IRONFORGE_MANUAL';
  startedAt: string;
  endedAt?: string;
  title?: string;
  performedExercises: {
    performedExerciseId: string;
    exerciseName: string;
    sequence: number;
    equipmentProfileId?: string;
    exerciseVariant?: string;
    setupMode?: string;
    sets: CanonicalStrengthSetInput[];
  }[];
}

export type PersistSetResult =
  | { status: 'PERSISTED'; clientWriteId: string; set: ValidatedCanonicalStrengthSet }
  | { status: 'DUPLICATE_IGNORED'; clientWriteId: string }
  | { status: 'INVALID_INPUT'; error: string };

/**
 * Validates a canonical strength set input.
 */
export function validateCanonicalStrengthSet(input: unknown): {
  success: boolean;
  data?: ValidatedCanonicalStrengthSet;
  error?: string;
} {
  const result = CanonicalStrengthSetSchema.safeParse(input);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
    };
  }
  return { success: true, data: result.data };
}

/**
 * Maps a completed or in-progress Live Forge session with canonical sets
 * into canonical StrengthSessionEvidence ready for persistence.
 * Truthfully preserves load, loadUnit, loadSemantics, measurementMode, side,
 * and clientWriteId without lossy collapse.
 */
export function toCanonicalStrengthSessionEvidence(
  payload: StrengthSessionWritePayload
): StrengthSessionEvidence {
  return {
    provenance: {
      source: payload.source,
      providerSessionId: payload.sessionId,
      importedAt: new Date().toISOString(),
    },
    title: payload.title,
    startedAt: payload.startedAt,
    ...(payload.endedAt ? { endedAt: payload.endedAt } : {}),
    exercises: payload.performedExercises.map((ex) => ({
      sequence: ex.sequence,
      exerciseName: ex.exerciseName,
      providerExerciseId: ex.performedExerciseId,
      ...(ex.equipmentProfileId ? { equipmentProfileId: ex.equipmentProfileId } : {}),
      ...(ex.exerciseVariant ? { exerciseVariant: ex.exerciseVariant } : {}),
      ...(ex.setupMode ? { setupMode: ex.setupMode } : {}),
      sets: ex.sets.map((s, idx) => {
        const validated = CanonicalStrengthSetSchema.parse(s);
        const loadKg =
          validated.load !== undefined
            ? validated.loadUnit === 'LBS'
              ? Number((validated.load * 0.45359237).toFixed(2))
              : validated.load
            : undefined;

        return {
          sequence: idx,
          providerSetIndex: idx,
          clientWriteId: validated.clientWriteId,
          measurementMode: validated.measurementMode,
          ...(validated.load !== undefined ? { load: validated.load } : {}),
          ...(validated.loadUnit !== undefined ? { loadUnit: validated.loadUnit } : {}),
          ...(validated.loadSemantics !== undefined
            ? { loadSemantics: validated.loadSemantics }
            : {}),
          ...(loadKg !== undefined ? { loadKg } : {}),
          ...(validated.reps !== undefined ? { reps: validated.reps } : {}),
          ...(validated.durationSeconds !== undefined
            ? { durationSeconds: validated.durationSeconds }
            : {}),
          ...(validated.side !== undefined ? { side: validated.side } : {}),
          ...(validated.rpe !== undefined ? { rpe: validated.rpe } : {}),
          ...(validated.rir !== undefined ? { rir: validated.rir } : {}),
          ...(validated.loadSemantics === 'BODYWEIGHT' ? { isBodyweight: true } : {}),
          ...(validated.note !== undefined ? { note: validated.note } : {}),
        };
      }),
    })),
  };
}

/**
 * Idempotent in-memory or store-level set deduplication tracker.
 * Ensures that retries/double-taps with the same clientWriteId are acknowledged
 * without creating duplicate canonical rows.
 */
export class IdempotentSetWriter {
  private readonly writtenClientWriteIds = new Set<string>();
  private readonly setsByClientWriteId = new Map<string, ValidatedCanonicalStrengthSet>();

  recordSet(set: CanonicalStrengthSetInput): PersistSetResult {
    if (this.writtenClientWriteIds.has(set.clientWriteId)) {
      return {
        status: 'DUPLICATE_IGNORED',
        clientWriteId: set.clientWriteId,
      };
    }

    const validation = validateCanonicalStrengthSet(set);
    if (!validation.success || !validation.data) {
      return {
        status: 'INVALID_INPUT',
        error: validation.error || 'Validation failed',
      };
    }

    this.writtenClientWriteIds.add(set.clientWriteId);
    this.setsByClientWriteId.set(set.clientWriteId, validation.data);

    return {
      status: 'PERSISTED',
      clientWriteId: set.clientWriteId,
      set: validation.data,
    };
  }

  getSet(clientWriteId: string): ValidatedCanonicalStrengthSet | undefined {
    return this.setsByClientWriteId.get(clientWriteId);
  }

  has(clientWriteId: string): boolean {
    return this.writtenClientWriteIds.has(clientWriteId);
  }
}
