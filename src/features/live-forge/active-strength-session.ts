import {
  CanonicalStrengthSetSchema,
  CorrectStrengthSetSchema,
  type CanonicalStrengthSet,
  type CanonicalStrengthSetInput,
  type CorrectStrengthSetInput,
  type MeasurementMode,
} from '@/features/strength-evidence/write-contract';
import type { StrengthTemplateDefinition } from '@/features/training/canonicalTemplates';
import { snapshotTemplateForSession } from '@/features/training/canonicalTemplates';
import { IdempotentSetWriter } from '@/features/strength-evidence/write-service';
import type { SessionStatus, SessionOutcome } from './domain';

/**
 * Architecture & Domain Reconciliation:
 *
 * In IronForge, `LiveForgeSession` (defined in `./domain.ts` and managed via `./session-lifecycle.ts`)
 * is the canonical server/domain lifecycle model.
 *
 * `ActiveStrengthSession` (defined below) is a rich client-side UI projection designed for
 * interactive browser/mobile logging against canonical workout templates (e.g., A1 Belt Squat).
 * It tracks prescribed exercises, active exercise focus, and immutable canonical sets, which are
 * then durably persisted via `persistCanonicalStrengthSet()` into the normalized `StrengthEvidenceSet`
 * and `StrengthEvidenceSession` database records.
 */

export type LiveForgeSessionStatus = SessionStatus;
export type LiveForgeSessionOutcome = SessionOutcome;

export interface PerformedExerciseState {
  exerciseId: string;
  exerciseName: string;
  sequence: number;
  measurementMode: MeasurementMode;
  unilateral?: boolean;
  prescribedSetsCount: number;
  sets: CanonicalStrengthSet[];
}

/**
 * Client UI projection for interactive mobile/web strength logging.
 */
export interface ActiveStrengthSession {
  sessionId: string;
  userId: string;
  templateCode?: string;
  templateSnapshot: StrengthTemplateDefinition;
  status: LiveForgeSessionStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  outcome?: LiveForgeSessionOutcome;
  activeExerciseIndex: number;
  performedExercises: PerformedExerciseState[];
  revision: number;
}

export interface StartStrengthSessionInput {
  sessionId: string;
  userId: string;
  template: StrengthTemplateDefinition;
  isMinimumVariant?: boolean;
  startedAt?: string;
}

export class LiveStrengthSessionManager {
  private readonly setWriter = new IdempotentSetWriter();

  startSession(input: StartStrengthSessionInput): ActiveStrengthSession {
    const startedAt = input.startedAt || new Date().toISOString();
    const snapshot = snapshotTemplateForSession(input.template, input.isMinimumVariant);

    const performedExercises: PerformedExerciseState[] = snapshot.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      exerciseName: ex.exerciseName,
      sequence: ex.sequence,
      measurementMode: ex.measurementMode,
      unilateral: ex.unilateral,
      prescribedSetsCount: ex.prescribedSetsCount,
      sets: [],
    }));

    return {
      sessionId: input.sessionId,
      userId: input.userId,
      templateCode: snapshot.code,
      templateSnapshot: snapshot,
      status: 'ACTIVE',
      startedAt,
      updatedAt: startedAt,
      activeExerciseIndex: 0,
      performedExercises,
      revision: 1,
    };
  }

  /**
   * Records a set into the active session idempotently.
   * If clientWriteId was already recorded, returns the existing state without duplicate insertion.
   */
  logSet(
    session: ActiveStrengthSession,
    exerciseIndex: number,
    setInput: CanonicalStrengthSetInput
  ): ActiveStrengthSession {
    if (session.status !== 'ACTIVE') {
      throw new Error(`Cannot log set to session in ${session.status} state`);
    }

    const ex = session.performedExercises[exerciseIndex];
    if (!ex) {
      throw new Error(`Invalid exercise index ${exerciseIndex}`);
    }

    // Check if set is already in the performed exercise
    const existing = ex.sets.find((s) => s.clientWriteId === setInput.clientWriteId);
    if (existing) {
      return session; // Idempotent return
    }

    const writeResult = this.setWriter.recordSet(setInput);
    if (writeResult.status === 'INVALID_INPUT') {
      throw new Error(`Invalid set input: ${writeResult.error}`);
    }
    if (writeResult.status === 'DUPLICATE_IGNORED') {
      return session;
    }

    const setRecord: CanonicalStrengthSet = {
      ...writeResult.set,
      id: writeResult.set.id || setInput.clientWriteId,
      createdAt: writeResult.set.createdAt || setInput.completedAt,
      updatedAt: writeResult.set.updatedAt || setInput.completedAt,
    };

    const nextExercises = session.performedExercises.map((e, idx) => {
      if (idx !== exerciseIndex) return e;
      return {
        ...e,
        sets: [...e.sets, setRecord],
      };
    });

    return {
      ...session,
      performedExercises: nextExercises,
      updatedAt: setInput.completedAt,
      revision: session.revision + 1,
    };
  }

  /**
   * Finish the workout as 'KLAR_FOR_IDAG' (or FULL/MINIMUM clear).
   * Valid even if not every template exercise was completed.
   */
  finishSession(
    session: ActiveStrengthSession,
    options?: {
      finishedAt?: string;
      explicitKlarForIdag?: boolean;
    }
  ): ActiveStrengthSession {
    if (session.status === 'COMPLETED' || session.status === 'ABANDONED') {
      return session;
    }

    const finishedAt = options?.finishedAt || new Date().toISOString();

    let outcome: LiveForgeSessionOutcome = 'KLAR_FOR_IDAG';
    if (!options?.explicitKlarForIdag) {
      const allComplete = session.performedExercises.every(
        (ex) => ex.sets.length >= ex.prescribedSetsCount
      );
      if (allComplete) {
        outcome = 'FULL_CLEAR';
      }
    }

    return {
      ...session,
      status: 'COMPLETED',
      outcome,
      completedAt: finishedAt,
      updatedAt: finishedAt,
      revision: session.revision + 1,
    };
  }

  /**
   * Correct an already recorded set by its clientWriteId.
   * Identity fields (id, clientWriteId, performedExerciseId, createdAt) are strictly immutable.
   */
  correctSet(
    session: ActiveStrengthSession,
    clientWriteId: string,
    corrections: CorrectStrengthSetInput
  ): ActiveStrengthSession {
    const validatedCorrection = CorrectStrengthSetSchema.safeParse(corrections);
    if (!validatedCorrection.success) {
      throw new Error(
        `Invalid correction fields: ${validatedCorrection.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`
      );
    }

    let found = false;
    const now = new Date().toISOString();

    const nextExercises = session.performedExercises.map((ex) => {
      const setIdx = ex.sets.findIndex((s) => s.clientWriteId === clientWriteId);
      if (setIdx === -1) return ex;

      found = true;
      const updatedSets = [...ex.sets];
      const target = updatedSets[setIdx];

      const mergedCandidate = {
        ...target,
        ...validatedCorrection.data,
        id: target.id,
        clientWriteId: target.clientWriteId,
        performedExerciseId: target.performedExerciseId,
        completedAt: target.completedAt,
        createdAt: target.createdAt,
        updatedAt: now,
      };

      const parsed = CanonicalStrengthSetSchema.safeParse(mergedCandidate);
      if (!parsed.success) {
        throw new Error(
          `Invalid set correction: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`
        );
      }

      updatedSets[setIdx] = {
        ...parsed.data,
        id: target.id,
        createdAt: target.createdAt,
        updatedAt: now,
      };

      return {
        ...ex,
        sets: updatedSets,
      };
    });

    if (!found) {
      throw new Error(`Set with clientWriteId ${clientWriteId} not found`);
    }

    return {
      ...session,
      performedExercises: nextExercises,
      updatedAt: now,
      revision: session.revision + 1,
    };
  }
}
