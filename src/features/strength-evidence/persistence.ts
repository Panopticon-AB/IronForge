import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

import type { StrengthSessionEvidence } from './domain';
import {
  CanonicalStrengthSetSchema,
  type CanonicalStrengthSet,
  type CanonicalStrengthSetInput,
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
    select: { id: true, evidence: true },
  });

  if (!row) return null;

  // Retrieve normalized sets persisted for this session, ordered deterministically by performance time and stable DB ID
  const sets = await prisma.strengthEvidenceSet.findMany({
    where: { sessionId: row.id },
    orderBy: [{ completedAt: 'asc' }, { id: 'asc' }],
  });

  if (sets.length === 0) {
    return (row.evidence as unknown as StrengthSessionEvidence) || null;
  }

  // Materialize truthful evidence from the normalized StrengthEvidenceSet rows
  const sessionEvidence = (row.evidence as unknown as StrengthSessionEvidence) || {
    provenance: { source: source as any, providerSessionId },
    startedAt: sets[0]?.completedAt?.toISOString() || new Date().toISOString(),
    exercises: [],
  };

  // Group sets by performedExerciseId while preserving deterministic order
  const exerciseMap = new Map<string, { exerciseName?: string; sequence: number; sets: any[] }>();

  // Initialize with any exercises already in sessionEvidence to keep original sequence
  for (const ex of sessionEvidence.exercises || []) {
    exerciseMap.set(ex.providerExerciseId || ex.exerciseName, {
      exerciseName: ex.exerciseName,
      sequence: ex.sequence,
      sets: [],
    });
  }

  for (const setRow of sets) {
    const key = setRow.performedExerciseId;
    let ex = exerciseMap.get(key);
    if (!ex) {
      ex = {
        exerciseName: setRow.exerciseName || key,
        sequence: exerciseMap.size,
        sets: [],
      };
      exerciseMap.set(key, ex);
    } else if (!ex.exerciseName && setRow.exerciseName) {
      ex.exerciseName = setRow.exerciseName;
    }

    const setItem: any = {
      sequence: ex.sets.length,
      providerSetIndex: ex.sets.length,
      clientWriteId: setRow.clientWriteId,
      measurementMode: setRow.measurementMode,
    };
    if (setRow.load !== null && setRow.load !== undefined) setItem.load = setRow.load;
    if (setRow.loadUnit !== null && setRow.loadUnit !== undefined) setItem.loadUnit = setRow.loadUnit;
    if (setRow.loadSemantics !== null && setRow.loadSemantics !== undefined)
      setItem.loadSemantics = setRow.loadSemantics;
    if (setRow.loadKg !== null && setRow.loadKg !== undefined) setItem.loadKg = setRow.loadKg;
    if (setRow.reps !== null && setRow.reps !== undefined) setItem.reps = setRow.reps;
    if (setRow.durationSeconds !== null && setRow.durationSeconds !== undefined)
      setItem.durationSeconds = setRow.durationSeconds;
    if (setRow.side !== null && setRow.side !== undefined) setItem.side = setRow.side;
    if (setRow.rpe !== null && setRow.rpe !== undefined) setItem.rpe = setRow.rpe;
    if (setRow.rir !== null && setRow.rir !== undefined) setItem.rir = setRow.rir;
    if (setRow.loadSemantics === 'BODYWEIGHT') setItem.isBodyweight = true;
    if (setRow.note !== null && setRow.note !== undefined) setItem.note = setRow.note;

    ex.sets.push(setItem);
  }

  const exercises = Array.from(exerciseMap.entries()).map(([providerExerciseId, val]) => ({
    sequence: val.sequence,
    exerciseName: val.exerciseName || providerExerciseId,
    providerExerciseId,
    sets: val.sets,
  }));

  exercises.sort((a, b) => a.sequence - b.sequence);

  return {
    ...sessionEvidence,
    exercises,
  };
}

/**
 * Lossless canonical readback directly from the normalized database rows.
 * Exposes stable server-assigned IDs, exact clientWriteIds, units, timestamps, and metadata.
 */
export async function getCanonicalStrengthSets(
  userId: string,
  source: string,
  providerSessionId: string
): Promise<CanonicalStrengthSet[]> {
  const sessionRow = await prisma.strengthEvidenceSession.findUnique({
    where: {
      userId_source_providerSessionId: {
        userId,
        source,
        providerSessionId,
      },
    },
    select: { id: true },
  });

  if (!sessionRow) return [];

  const rows = await prisma.strengthEvidenceSet.findMany({
    where: { sessionId: sessionRow.id },
    orderBy: [{ completedAt: 'asc' }, { id: 'asc' }],
  });

  return rows.map((r) => ({
    id: r.id,
    performedExerciseId: r.performedExerciseId,
    measurementMode: r.measurementMode as any,
    ...(r.load !== null && r.load !== undefined ? { load: r.load } : {}),
    ...(r.loadUnit !== null && r.loadUnit !== undefined ? { loadUnit: r.loadUnit as any } : {}),
    ...(r.loadSemantics !== null && r.loadSemantics !== undefined
      ? { loadSemantics: r.loadSemantics as any }
      : {}),
    ...(r.loadKg !== null && r.loadKg !== undefined ? { loadKg: r.loadKg } : {}),
    ...(r.reps !== null && r.reps !== undefined ? { reps: r.reps } : {}),
    ...(r.durationSeconds !== null && r.durationSeconds !== undefined
      ? { durationSeconds: r.durationSeconds }
      : {}),
    ...(r.side !== null && r.side !== undefined ? { side: r.side as any } : {}),
    ...(r.rpe !== null && r.rpe !== undefined ? { rpe: r.rpe } : {}),
    ...(r.rir !== null && r.rir !== undefined ? { rir: r.rir } : {}),
    setType: r.setType as any,
    completedAt: r.completedAt.toISOString(),
    clientWriteId: r.clientWriteId,
    ...(r.note !== null && r.note !== undefined ? { note: r.note } : {}),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export type PersistCanonicalSetResult =
  | { status: 'PERSISTED'; clientWriteId: string; set: CanonicalStrengthSet }
  | { status: 'DUPLICATE_IGNORED'; clientWriteId: string }
  | { status: 'INVALID_INPUT'; error: string };


/**
 * Persists a canonical strength set into the database session evidence idempotently.
 * Guarantees that: same user/session + same clientWriteId -> exactly one canonical set.
 * Survives server restarts, multi-instance environments, and concurrent writes because
 * PostgreSQL enforces row-level uniqueness on (sessionId, clientWriteId).
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

  // 1. Ensure parent StrengthEvidenceSession exists (upsert without overwriting existing data)
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
        sets: [],
      },
    ],
  };

  const sessionRow = await prisma.strengthEvidenceSession.upsert({
    where: {
      userId_source_providerSessionId: {
        userId,
        source,
        providerSessionId,
      },
    },
    create: {
      userId,
      source,
      providerSessionId,
      startedAt: new Date(sessionDefaults?.startedAt || validatedSet.completedAt),
      evidenceVersion: STRENGTH_EVIDENCE_VERSION,
      evidence: initialEvidence as unknown as Prisma.InputJsonValue,
    },
    update: {},
    select: { id: true },
  });

  // 2. Count existing sets for this exercise to determine set sequence
  const currentCount = await prisma.strengthEvidenceSet.count({
    where: {
      sessionId: sessionRow.id,
      performedExerciseId,
    },
  });

  // 3. Insert into StrengthEvidenceSet with unique constraint on [sessionId, clientWriteId]
  let createdRow: any;
  try {
    createdRow = await prisma.strengthEvidenceSet.create({
      data: {
        sessionId: sessionRow.id,
        clientWriteId: validatedSet.clientWriteId,
        performedExerciseId,
        exerciseName,
        sequence: currentCount,
        measurementMode: validatedSet.measurementMode,
        load: validatedSet.load ?? null,
        loadUnit: validatedSet.loadUnit ?? null,
        loadSemantics: validatedSet.loadSemantics ?? null,
        loadKg: loadKg ?? null,
        reps: validatedSet.reps ?? null,
        durationSeconds: validatedSet.durationSeconds ?? null,
        side: validatedSet.side ?? null,
        rpe: validatedSet.rpe ?? null,
        rir: validatedSet.rir ?? null,
        setType: validatedSet.setType ?? 'NORMAL',
        note: validatedSet.note ?? null,
        completedAt: new Date(validatedSet.completedAt),
      },
    });
  } catch (error: any) {
    // Prisma unique constraint violation code is P2002
    if (error?.code === 'P2002') {
      return { status: 'DUPLICATE_IGNORED', clientWriteId: validatedSet.clientWriteId };
    }
    throw error;
  }

  // 4. Update the materialized evidence in StrengthEvidenceSession for backwards compatibility
  const newSetEvidence = {
    sequence: currentCount,
    providerSetIndex: currentCount,
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
    where: { id: sessionRow.id },
    select: { evidence: true },
  });

  if (existingRow?.evidence) {
    const currentEvidence = existingRow.evidence as unknown as StrengthSessionEvidence;
    let targetEx = currentEvidence.exercises?.find(
      (ex) => ex.providerExerciseId === performedExerciseId || ex.sequence === exerciseIndex
    );
    if (!targetEx) {
      targetEx = {
        sequence: exerciseIndex,
        exerciseName,
        providerExerciseId: performedExerciseId,
        sets: [],
      };
      currentEvidence.exercises = currentEvidence.exercises || [];
      currentEvidence.exercises.push(targetEx);
      currentEvidence.exercises.sort((a, b) => a.sequence - b.sequence);
    }
    // Only append if not already present in evidence JSON
    if (!targetEx.sets.some((s) => s.clientWriteId === validatedSet.clientWriteId)) {
      targetEx.sets.push(newSetEvidence);
      await prisma.strengthEvidenceSession.update({
        where: { id: sessionRow.id },
        data: { evidence: currentEvidence as unknown as Prisma.InputJsonValue },
      });
    }
  }

  const canonicalSet: CanonicalStrengthSet = {
    id: createdRow.id,
    performedExerciseId,
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
    setType: validatedSet.setType,
    completedAt: validatedSet.completedAt,
    clientWriteId: validatedSet.clientWriteId,
    ...(validatedSet.note !== undefined ? { note: validatedSet.note } : {}),
    createdAt: createdRow.createdAt ? createdRow.createdAt.toISOString() : validatedSet.completedAt,
    updatedAt: createdRow.updatedAt ? createdRow.updatedAt.toISOString() : validatedSet.completedAt,
  };

  return { status: 'PERSISTED', clientWriteId: validatedSet.clientWriteId, set: canonicalSet };
}

