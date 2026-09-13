import type { Prisma } from '@prisma/client';

import type { StrengthSessionEvidence } from './domain';
import { prepareStrengthEvidencePersistence } from './persistence';

export type StrengthEvidenceEffectClaimResult =
  | {
      status: 'CLAIMED';
      sessionId: string;
    }
  | {
      status: 'ALREADY_APPLIED';
      sessionId: string;
    }
  | {
      status: 'SKIP_MISSING_PROVIDER_SESSION_ID';
    };

export async function claimStrengthEvidenceEffects(
  tx: Prisma.TransactionClient,
  userId: string,
  evidence: StrengthSessionEvidence,
): Promise<StrengthEvidenceEffectClaimResult> {
  const prepared = prepareStrengthEvidencePersistence(userId, evidence);

  if (prepared.status !== 'READY') {
    return { status: 'SKIP_MISSING_PROVIDER_SESSION_ID' };
  }

  const { data } = prepared;
  const session = await tx.strengthEvidenceSession.upsert({
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
    select: {
      id: true,
      effectState: true,
    },
  });

  if (session.effectState === 'APPLIED') {
    return { status: 'ALREADY_APPLIED', sessionId: session.id };
  }

  const claim = await tx.strengthEvidenceSession.updateMany({
    where: {
      id: session.id,
      effectState: 'PENDING',
    },
    data: {
      effectState: 'APPLYING',
    },
  });

  if (claim.count === 1) {
    return { status: 'CLAIMED', sessionId: session.id };
  }

  const latest = await tx.strengthEvidenceSession.findUnique({
    where: { id: session.id },
    select: { effectState: true },
  });

  if (latest?.effectState === 'APPLIED') {
    return { status: 'ALREADY_APPLIED', sessionId: session.id };
  }

  throw new Error(`Strength evidence effects are already being applied for session ${session.id}`);
}

export async function markStrengthEvidenceEffectsApplied(
  tx: Prisma.TransactionClient,
  sessionId: string,
  appliedAt = new Date(),
): Promise<void> {
  await tx.strengthEvidenceSession.update({
    where: { id: sessionId },
    data: {
      effectState: 'APPLIED',
      effectsAppliedAt: appliedAt,
    },
  });
}
