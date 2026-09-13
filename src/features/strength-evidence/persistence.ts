import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

import type { StrengthSessionEvidence } from './domain';

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
