import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

import type { StrengthSessionEvidence } from './domain';
import {
  CanonicalStrengthSetSchema,
  type CanonicalStrengthSetInput,
  type ValidatedCanonicalStrengthSet,
} from './write-contract';

export const STRENGTH_EVIDENCE_VERSION = 1;

export interface StrengthEvidencePersistenceData {
  userId: string;
  source: string;
  providerSessionId: string;
  startedAt: Date;
  endedAt: Date | null;
  evidenceVersion: number;
  evidence: Prisma.InputJsonValue;
}

export type PreparedStrengthEvidencePersistence =
  | {
      status: 'READY';
      data: StrengthEvidencePersistenceData;
    }
  | {
      status: 'SKIP_MISSING_PROVIDER_SESSION_ID';
    };

export function prepareStrengthEvidencePersistence(
  userId: string,
  evidence: StrengthSessionEvidence,
): PreparedStrengthEvidencePersistence {
  const providerSessionId = evidence.provenance.providerSessionId;

  if (!providerSessionId) {
    return { status: 'SKIP_MISSING_PROVIDER_SESSION_ID' };
  }

  return {
    status: 'READY',
    data: {
      userId,
      source: evidence.provenance.source,
      providerSessionId,
      startedAt: new Date(evidence.startedAt),
      endedAt: evidence.endedAt ? new Date(evidence.endedAt) : null,
      evidenceVersion: STRENGTH_EVIDENCE_VERSION,
      evidence: evidence as unknown as Prisma.InputJsonValue,
    },
  };
}

export type PersistStrengthEvidenceResult =
  | {
      status: 'PERSISTED';
      id: string;
    }
  | {
      status: 'SKIPPED_MISSING_PROVIDER_SESSION_ID';
    };

export async function persistStrengthSessionEvidence(
  userId: string,
  evidence: StrengthSessionEvidence,
): Promise<PersistStrengthEvidenceResult> {
  const prepared = prepareStrengthEvidencePersistence(userId, evidence);

  if (prepared.status !== 'READY') {
    return { status: 'SKIPPED_MISSING_PROVIDER_SESSION_ID' };
  }

  const { data } = prepared;
  const row = await prisma.strengthEvidenceSession.upsert({
    where: {
      userId_source_providerSessionId: {
        userId: data.userId,
        source: data.source,
        providerSessionId: data.providerSessionId,
      },
    },
    create: data,
    update: {
      startedAt: data.startedAt,
      endedAt: data.endedAt,
      evidenceVersion: data.evidenceVersion,
      evidence: data.evidence,
    },
    select: { id: true },
  });

  return { status: 'PERSISTED', id: row.id };
}

export async function getStrengthSessionEvidence(
  userId: string,
  source: string,
  providerSessionId: string
): Promise<StrengthSessionEvidence | null> {
  const row = await prisma.strengthEvidenceSession.findUnique({
    where: {
      userId_source_providerSessionId: {
        userId,
        source,
        providerSessionId,
      },
    },
    select: { evidence: true },
  });

  if (!row?.evidence) return null;
  return row.evidence as unknown as StrengthSessionEvidence;
}

export type PersistCanonicalSetResult =
  | { status: 'PERSISTED'; clientWriteId: string; set: ValidatedCanonicalStrengthSet }
  | { status: 'DUPLICATE_IGNORED'; clientWriteId: string }
  | { status: 'INVALID_INPUT'; error: string };

/**
 * Persists a canonical strength set into the database session evidence idempotently.
 * Guarantees that: same user/session + same clientWriteId -> exactly one canonical set.
 * Survives server restarts and multi-instance environments because PostgreSQL is authoritative.
 */
export async function persistCanonicalStrengthSet(
  userId: string,
  source: string,
  providerSessionId: string,
  exerciseIndex: number,
  exerciseName: string,
  performedExerciseId: string,
  setInput: CanonicalStrengthSetInput,
  sessionDefaults?: { startedAt?: string; title?: string }
): Promise<PersistCanonicalSetResult> {
  const parsed = CanonicalStrengthSetSchema.safeParse(setInput);
  if (!parsed.success) {
    return {
      status: 'INVALID_INPUT',
      error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
    };
  }

  const validatedSet = parsed.data;

  // Compute derived loadKg for interoperability while keeping original loadUnit/loadSemantics
  const loadKg =
    validatedSet.load !== undefined
      ? validatedSet.loadUnit === 'LBS'
        ? Number((validatedSet.load * 0.45359237).toFixed(2))
        : validatedSet.load
      : undefined;

  const newSetEvidence = {
    sequence: 0,
    providerSetIndex: 0,
    clientWriteId: validatedSet.clientWriteId,
    measurementMode: validatedSet.measurementMode,
    ...(validatedSet.load !== undefined ? { load: validatedSet.load } : {}),
    ...(validatedSet.loadUnit !== undefined ? { loadUnit: validatedSet.loadUnit } : {}),
    ...(validatedSet.loadSemantics !== undefined
      ? { loadSemantics: validatedSet.loadSemantics }
      : {}),
    ...(loadKg !== undefined ? { loadKg } : {}),
    ...(validatedSet.reps !== undefined ? { reps: validatedSet.reps } : {}),
    ...(validatedSet.durationSeconds !== undefined
      ? { durationSeconds: validatedSet.durationSeconds }
      : {}),
    ...(validatedSet.side !== undefined ? { side: validatedSet.side } : {}),
    ...(validatedSet.rpe !== undefined ? { rpe: validatedSet.rpe } : {}),
    ...(validatedSet.rir !== undefined ? { rir: validatedSet.rir } : {}),
    ...(validatedSet.loadSemantics === 'BODYWEIGHT' ? { isBodyweight: true } : {}),
    ...(validatedSet.note !== undefined ? { note: validatedSet.note } : {}),
  };

  const existingRow = await prisma.strengthEvidenceSession.findUnique({
    where: {
      userId_source_providerSessionId: {
        userId,
        source,
        providerSessionId,
      },
    },
    select: { evidence: true },
  });

  if (!existingRow) {
    // Initial creation with first set
    const initialEvidence: StrengthSessionEvidence = {
      provenance: {
        source: source as any,
        providerSessionId,
        importedAt: new Date().toISOString(),
      },
      title: sessionDefaults?.title,
      startedAt: sessionDefaults?.startedAt || validatedSet.completedAt,
      exercises: [
        {
          sequence: exerciseIndex,
          exerciseName,
          providerExerciseId: performedExerciseId,
          sets: [newSetEvidence],
        },
      ],
    };

    await persistStrengthSessionEvidence(userId, initialEvidence);
    return { status: 'PERSISTED', clientWriteId: validatedSet.clientWriteId, set: validatedSet };
  }

  // Update existing session
  const currentEvidence = existingRow.evidence as unknown as StrengthSessionEvidence;

  // Check for existing set with same clientWriteId anywhere in this session
  const alreadyWritten = currentEvidence.exercises.some((ex) =>
    ex.sets.some((s) => s.clientWriteId === validatedSet.clientWriteId)
  );

  if (alreadyWritten) {
    return { status: 'DUPLICATE_IGNORED', clientWriteId: validatedSet.clientWriteId };
  }

  // Append new set to target exercise (or create target exercise)
  let targetEx = currentEvidence.exercises.find(
    (ex) => ex.providerExerciseId === performedExerciseId || ex.sequence === exerciseIndex
  );

  if (!targetEx) {
    targetEx = {
      sequence: exerciseIndex,
      exerciseName,
      providerExerciseId: performedExerciseId,
      sets: [],
    };
    currentEvidence.exercises.push(targetEx);
    currentEvidence.exercises.sort((a, b) => a.sequence - b.sequence);
  }

  newSetEvidence.sequence = targetEx.sets.length;
  newSetEvidence.providerSetIndex = targetEx.sets.length;
  targetEx.sets.push(newSetEvidence);

  await prisma.strengthEvidenceSession.update({
    where: {
      userId_source_providerSessionId: {
        userId,
        source,
        providerSessionId,
      },
    },
    data: {
      evidence: currentEvidence as unknown as Prisma.InputJsonValue,
    },
  });

  return { status: 'PERSISTED', clientWriteId: validatedSet.clientWriteId, set: validatedSet };
}
