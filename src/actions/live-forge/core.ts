'use server';

import type {
  ActiveStrengthSession,
  PerformedExerciseState,
} from '@/features/live-forge/active-strength-session';
import type { StrengthSessionEvidence } from '@/features/strength-evidence/domain';
import {
  getCanonicalStrengthSets,
  persistCanonicalStrengthSet,
} from '@/features/strength-evidence/persistence';
import type {
  CanonicalStrengthSet,
  CanonicalStrengthSetInput,
} from '@/features/strength-evidence/write-contract';
import {
  CANONICAL_STRENGTH_TEMPLATES,
  type StrengthTemplateDefinition,
  snapshotTemplateForSession,
} from '@/features/training/canonicalTemplates';
import prisma from '@/lib/prisma';
import { createClient } from '@/utils/supabase/server';

const LIVE_FORGE_SOURCE = 'IRONFORGE_LIVE_FORGE';

/**
 * Resolves the authenticated user ID or falls back to single-player active user.
 */
export async function resolveUserId(): Promise<string> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) return user.id;
  } catch {
    // Supabase auth not initialized or running in local dev / single player mode
  }

  const existingUser = await prisma.user.findFirst({
    where: { heroName: 'IronLegend' },
    select: { id: true },
  });

  if (existingUser?.id) return existingUser.id;

  const anyUser = await prisma.user.findFirst({
    select: { id: true },
  });

  if (anyUser?.id) return anyUser.id;

  const newUser = await prisma.user.create({
    data: { heroName: 'IronLegend' },
    select: { id: true },
  });

  return newUser.id;
}

/**
 * Reconstructs an ActiveStrengthSession from a StrengthEvidenceSession row and its normalized sets.
 */
export async function reconstructActiveStrengthSession(sessionRow: {
  id: string;
  userId: string;
  source: string;
  providerSessionId: string;
  startedAt: Date;
  endedAt: Date | null;
  evidence: any;
  updatedAt: Date;
}): Promise<ActiveStrengthSession> {
  const sets = await getCanonicalStrengthSets(
    sessionRow.userId,
    sessionRow.source,
    sessionRow.providerSessionId
  );

  const evidence = sessionRow.evidence as
    | (StrengthSessionEvidence & {
        templateSnapshot?: StrengthTemplateDefinition;
        templateCode?: string;
        outcome?: any;
      })
    | null;

  let templateSnapshot: StrengthTemplateDefinition;

  if (evidence?.templateSnapshot) {
    templateSnapshot = evidence.templateSnapshot;
  } else {
    const code = (evidence?.templateCode || 'A1') as 'A1' | 'B1' | 'A2' | 'B2';
    const baseTemplate = CANONICAL_STRENGTH_TEMPLATES[code] || CANONICAL_STRENGTH_TEMPLATES.A1;
    templateSnapshot = snapshotTemplateForSession(baseTemplate);
  }

  const performedExercises: PerformedExerciseState[] = templateSnapshot.exercises.map((ex) => {
    const matchingSets = sets.filter((s) => s.performedExerciseId === ex.exerciseId);
    return {
      exerciseId: ex.exerciseId,
      exerciseName: ex.exerciseName,
      sequence: ex.sequence,
      measurementMode: ex.measurementMode,
      unilateral: ex.unilateral,
      prescribedSetsCount: ex.prescribedSetsCount,
      sets: matchingSets,
    };
  });

  // Calculate activeExerciseIndex: first exercise with remaining sets, or last if all done
  let activeExerciseIndex = performedExercises.findIndex(
    (ex) => ex.sets.length < ex.prescribedSetsCount
  );
  if (activeExerciseIndex === -1) {
    activeExerciseIndex = Math.max(0, performedExercises.length - 1);
  }

  const isCompleted = Boolean(sessionRow.endedAt);

  return {
    sessionId: sessionRow.providerSessionId,
    userId: sessionRow.userId,
    templateCode: templateSnapshot.code,
    templateSnapshot,
    status: isCompleted ? 'COMPLETED' : 'ACTIVE',
    startedAt: sessionRow.startedAt.toISOString(),
    updatedAt: sessionRow.updatedAt.toISOString(),
    completedAt: sessionRow.endedAt ? sessionRow.endedAt.toISOString() : undefined,
    outcome: evidence?.outcome,
    activeExerciseIndex,
    performedExercises,
    revision: sets.length + 1,
  };
}

/**
 * Retrieves the currently active strength session for the current user, or null if none active.
 */
export async function getActiveStrengthSessionAction(): Promise<ActiveStrengthSession | null> {
  const userId = await resolveUserId();

  const activeRow = await prisma.strengthEvidenceSession.findFirst({
    where: {
      userId,
      source: LIVE_FORGE_SOURCE,
      endedAt: null,
    },
    orderBy: { startedAt: 'desc' },
  });

  if (!activeRow) return null;

  return reconstructActiveStrengthSession(activeRow);
}

/**
 * Idempotently starts or returns the current active strength session.
 */
export async function startStrengthSessionAction(params?: {
  templateCode?: 'A1' | 'B1' | 'A2' | 'B2';
  isMinimumVariant?: boolean;
}): Promise<ActiveStrengthSession> {
  const userId = await resolveUserId();

  // If an active session already exists, return it directly (idempotent resume)
  const existingActive = await prisma.strengthEvidenceSession.findFirst({
    where: {
      userId,
      source: LIVE_FORGE_SOURCE,
      endedAt: null,
    },
    orderBy: { startedAt: 'desc' },
  });

  if (existingActive) {
    return reconstructActiveStrengthSession(existingActive);
  }

  const templateCode = params?.templateCode || 'A1';
  const baseTemplate =
    CANONICAL_STRENGTH_TEMPLATES[templateCode] || CANONICAL_STRENGTH_TEMPLATES.A1;
  const isMin = Boolean(params?.isMinimumVariant);
  const templateSnapshot = snapshotTemplateForSession(baseTemplate, isMin);

  const sessionId = `live-${templateSnapshot.code.toLowerCase()}-${Date.now()}`;
  const startedAt = new Date();

  const initialEvidence: StrengthSessionEvidence & {
    templateSnapshot: StrengthTemplateDefinition;
    templateCode: string;
  } = {
    provenance: {
      source: LIVE_FORGE_SOURCE,
      providerSessionId: sessionId,
      importedAt: startedAt.toISOString(),
    },
    title: templateSnapshot.name,
    startedAt: startedAt.toISOString(),
    exercises: templateSnapshot.exercises.map((ex) => ({
      sequence: ex.sequence,
      exerciseName: ex.exerciseName,
      providerExerciseId: ex.exerciseId,
      sets: [],
    })),
    templateSnapshot,
    templateCode: templateSnapshot.code,
  };

  const createdRow = await prisma.strengthEvidenceSession.create({
    data: {
      userId,
      source: LIVE_FORGE_SOURCE,
      providerSessionId: sessionId,
      startedAt,
      endedAt: null,
      evidence: initialEvidence as any,
    },
  });

  return reconstructActiveStrengthSession(createdRow);
}

/**
 * Logs a set into the normalized database boundary idempotently.
 */
export async function logStrengthSetAction(params: {
  sessionId: string;
  exerciseIndex: number;
  performedExerciseId: string;
  exerciseName: string;
  setInput: CanonicalStrengthSetInput;
}) {
  const userId = await resolveUserId();

  return persistCanonicalStrengthSet(
    userId,
    LIVE_FORGE_SOURCE,
    params.sessionId,
    params.exerciseIndex,
    params.exerciseName,
    params.performedExerciseId,
    params.setInput
  );
}

/**
 * Finishes the session with "Klar för idag" (or explicit finish) and records completedAt.
 */
export async function finishStrengthSessionAction(params: {
  sessionId: string;
  explicitKlarForIdag?: boolean;
}): Promise<ActiveStrengthSession> {
  const userId = await resolveUserId();

  const sessionRow = await prisma.strengthEvidenceSession.findUnique({
    where: {
      userId_source_providerSessionId: {
        userId,
        source: LIVE_FORGE_SOURCE,
        providerSessionId: params.sessionId,
      },
    },
  });

  if (!sessionRow) {
    throw new Error(`Session ${params.sessionId} not found`);
  }

  const endedAt = new Date();
  const existingEvidence = (sessionRow.evidence as any) || {};

  const updatedEvidence = {
    ...existingEvidence,
    endedAt: endedAt.toISOString(),
    outcome: params.explicitKlarForIdag
      ? 'KLAR_FOR_IDAG'
      : existingEvidence.outcome || 'KLAR_FOR_IDAG',
  };

  const updatedRow = await prisma.strengthEvidenceSession.update({
    where: { id: sessionRow.id },
    data: {
      endedAt,
      evidence: updatedEvidence,
    },
  });

  return reconstructActiveStrengthSession(updatedRow);
}

export interface CompletedSessionExerciseHistory {
  exerciseId: string;
  exerciseName: string;
  sets: CanonicalStrengthSet[];
}

export interface CompletedSessionHistoryItem {
  id: string;
  sessionId: string;
  startedAt: string;
  endedAt: string;
  title: string;
  templateCode: string;
  outcome: string;
  totalSets: number;
  exercises: CompletedSessionExerciseHistory[];
}

/**
 * Retrieves completed session history for the user with full canonical sets.
 */
export async function getStrengthSessionHistoryAction(): Promise<CompletedSessionHistoryItem[]> {
  const userId = await resolveUserId();

  const sessions = await prisma.strengthEvidenceSession.findMany({
    where: {
      userId,
      source: LIVE_FORGE_SOURCE,
      endedAt: { not: null },
    },
    orderBy: { startedAt: 'desc' },
    take: 30,
  });

  const historyItems: CompletedSessionHistoryItem[] = [];

  for (const sess of sessions) {
    const evidence = sess.evidence as any;
    const sets = await getCanonicalStrengthSets(userId, sess.source, sess.providerSessionId);

    // Map template snapshot or templateCode to resolve human-readable exercise names
    const snapshotExercises = evidence?.templateSnapshot?.exercises || [];
    const exerciseNameMap = new Map<string, string>();
    for (const ex of snapshotExercises) {
      exerciseNameMap.set(ex.exerciseId, ex.exerciseName);
    }

    // Fallback to base canonical template definition if snapshot is incomplete
    const code = (evidence?.templateCode || 'A1') as 'A1' | 'B1' | 'A2' | 'B2';
    const fallbackTemplate = CANONICAL_STRENGTH_TEMPLATES[code] || CANONICAL_STRENGTH_TEMPLATES.A1;
    for (const ex of fallbackTemplate.exercises) {
      if (!exerciseNameMap.has(ex.exerciseId)) {
        exerciseNameMap.set(ex.exerciseId, ex.exerciseName);
      }
    }

    // Group sets by performedExerciseId while preserving performance order
    const exerciseMap = new Map<string, { exerciseName: string; sets: CanonicalStrengthSet[] }>();
    for (const set of sets) {
      const exerciseId = set.performedExerciseId;
      const exerciseName = exerciseNameMap.get(exerciseId) || exerciseId;
      let entry = exerciseMap.get(exerciseId);
      if (!entry) {
        entry = { exerciseName, sets: [] };
        exerciseMap.set(exerciseId, entry);
      }
      entry.sets.push(set);
    }

    const exercises: CompletedSessionExerciseHistory[] = Array.from(exerciseMap.entries()).map(
      ([exerciseId, val]) => ({
        exerciseId,
        exerciseName: val.exerciseName,
        sets: val.sets,
      })
    );

    historyItems.push({
      id: sess.id,
      sessionId: sess.providerSessionId,
      startedAt: sess.startedAt.toISOString(),
      endedAt: sess.endedAt!.toISOString(),
      title: evidence?.title || 'Styrkepass',
      templateCode: evidence?.templateCode || 'A1',
      outcome: evidence?.outcome || 'KLAR_FOR_IDAG',
      totalSets: sets.length,
      exercises,
    });
  }

  return historyItems;
}
