-- IronForge #651: reconcile historical migration output with the current canonical Prisma schema.
--
-- This migration is intentionally repository-history repair. It is validated against a fresh
-- disposable PostgreSQL database and must not be treated as authorization to reconcile an
-- unknown/live database. Any live reconciliation remains separately approval-gated.

-- AgentMessage exists in the canonical schema and application API, but no historical migration
-- creates its mapped table.
CREATE TABLE "agent_messages" (
    "id" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "receiverRole" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contextPayload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'UNREAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "taskId" TEXT,
    "prNumber" INTEGER,

    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_messages_receiverRole_status_idx"
ON "agent_messages"("receiverRole", "status");

CREATE INDEX "agent_messages_createdAt_idx"
ON "agent_messages"("createdAt");

-- Guild territory targeting is present in the canonical schema/application but absent from the
-- historical territory migration.
ALTER TABLE "Guild"
ADD COLUMN "targetTerritoryId" TEXT;

ALTER TABLE "Guild"
ADD CONSTRAINT "Guild_targetTerritoryId_fkey"
FOREIGN KEY ("targetTerritoryId") REFERENCES "Territory"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- TerritoryContestEntry.guildId was created as a scalar column without its Prisma relation FK.
ALTER TABLE "TerritoryContestEntry"
ADD CONSTRAINT "TerritoryContestEntry_guildId_fkey"
FOREIGN KEY ("guildId") REFERENCES "Guild"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Territory resolution writes these canonical history fields, but the original table migration
-- predates them.
ALTER TABLE "TerritoryHistory"
ADD COLUMN "totalXp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "totalVolume" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "result" TEXT;

-- Neural Lattice reads/writes Titan.talentPoints; the original Titan migration predates it.
ALTER TABLE "Titan"
ADD COLUMN "talentPoints" INTEGER NOT NULL DEFAULT 0;

-- Co-op migration history created camelCase physical columns. The canonical Prisma models map
-- these fields to snake_case physical columns. Preserve data by renaming rather than recreating
-- the tables.
ALTER TABLE "active_sessions" RENAME COLUMN "hostId" TO "host_id";
ALTER TABLE "active_sessions" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "active_sessions" RENAME COLUMN "workoutName" TO "workout_name";
ALTER TABLE "active_sessions" RENAME COLUMN "maxParticipants" TO "max_participants";
ALTER TABLE "active_sessions" RENAME COLUMN "inviteCode" TO "invite_code";

ALTER TABLE "active_sessions"
RENAME CONSTRAINT "active_sessions_hostId_fkey" TO "active_sessions_host_id_fkey";

ALTER INDEX "active_sessions_inviteCode_key"
RENAME TO "active_sessions_invite_code_key";

ALTER TABLE "session_participants" RENAME COLUMN "sessionId" TO "session_id";
ALTER TABLE "session_participants" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "session_participants" RENAME COLUMN "heroName" TO "hero_name";
ALTER TABLE "session_participants" RENAME COLUMN "joinedAt" TO "joined_at";
ALTER TABLE "session_participants" RENAME COLUMN "lastHeartbeat" TO "last_heartbeat";

ALTER TABLE "session_participants"
RENAME CONSTRAINT "session_participants_sessionId_fkey" TO "session_participants_session_id_fkey";

ALTER TABLE "session_participants"
RENAME CONSTRAINT "session_participants_userId_fkey" TO "session_participants_user_id_fkey";

ALTER INDEX "session_participants_sessionId_userId_key"
RENAME TO "session_participants_session_id_user_id_key";
