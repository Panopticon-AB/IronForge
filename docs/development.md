# IronForge Development

This document captures the current repo-readiness baseline for local Codex and human development. It is intentionally conservative: if behavior is unclear, treat it as a TODO instead of guessing.

## Repo Inventory

- Product: IronForge RPG, an AI-augmented fitness/RPG application.
- Primary stack: Next.js 16 App Router, React 19, TypeScript, Tailwind/shadcn-style UI, Prisma, Supabase/PostgreSQL, Vitest, Playwright, Biome, Storybook, Turborepo.
- Package manager: `pnpm` via `packageManager: pnpm@10.30.3`.
- Workspace layout: root app plus `apps/*` and `mcp/*` from `pnpm-workspace.yaml`.
- Main source: `src/app`, `src/actions`, `src/components`, `src/features`, `src/lib`, `src/services`, `src/utils`.
- Database: Prisma schema in `prisma/schema.prisma`; runtime DB access uses PostgreSQL/Supabase-related env vars.
- CI/workflows: many GitHub Actions exist under `.github/workflows`, including CI/CD, governance, security, deploy, maintenance, runner heartbeat, labeler, stale, and self-heal workflows.

## Prerequisites

- Node.js compatible with the checked-in dependency set.
- pnpm 10.30.3 or Corepack configured to use it.
- PostgreSQL/Supabase credentials for database-backed work.
- Playwright browsers for E2E tests.
- Optional service credentials for integrations such as Google/Gemini, Hevy, Intervals.icu, Strava, Sentry, Coolify, n8n, GitHub, and Figma.

## Install

```bash
pnpm install
```

`postinstall` runs `prisma generate`.

## Local Dev

```bash
pnpm dev
```

The app starts with `next dev`. Playwright's local web server currently starts the app with `npm run dev -- -p 3001 -H 127.0.0.1`; TODO: align that command with the repo's pnpm baseline.

## Test

Available local test commands:

```bash
pnpm test
pnpm test:unit
pnpm test:coverage
pnpm test:e2e
pnpm test:smoke
```

Notes:

- `pnpm test` and `pnpm test:unit` both run Vitest.
- E2E and smoke tests use Playwright and require suitable env vars plus a seeded or reachable test target.
- Integration tests rely on Docker and database setup, so run them only when that local environment is intentionally prepared.

## Lint/Format/Types/Build

```bash
pnpm lint
pnpm check-types
pnpm build
pnpm format
```

`pnpm lint` runs `biome check .`. `pnpm format` writes changes, so use it only when formatting edits are intended.

## Env Vars

`.env.example` exists and should remain placeholder-only. Do not commit real secrets, host output, local override files, or private network details.

Environment validation is centralized in `src/env.mjs`. Required variables for normal app validation currently include:

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Additional optional or feature-specific variables appear across scripts, API routes, and test setup, including:

- `API_KEY` / Google AI keys for Oracle/chat behavior
- `INTERVALS_API_KEY`, `INTERVALS_ATHLETE_ID`
- `HEVY_API_KEY`, `HEVY_WEBHOOK_SECRET`
- `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_VERIFY_TOKEN`
- `CRON_SECRET`, `ADMIN_EMAILS`
- `SENTRY_*`, `NEXT_PUBLIC_SENTRY_DSN`
- `SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `ADMIN_DATABASE_URL`

## Known Issues

- README previously referenced npm and Next.js 15; the repo now declares pnpm and Next.js 16.
- `playwright.config.ts` still invokes `npm run dev` for the web server. This is likely harmless when npm can delegate, but it is inconsistent with `packageManager`.
- Historical note: `src/env.mjs` previously required `GH_PAT` when env validation was active. This was removed in #712 so normal application runtime does not require GitHub credentials. Operator scripts and runner tooling still own their respective `GH_PAT` usage locally.
- There are several committed historical logs and generated outputs at the repo root (`*_log*.txt`, `*_output*.txt`, prior CI captures, coverage/test output directories). Confirm which are intentional before cleanup.
- `package.json` includes scripts that use `npm run` and `npx` despite the pnpm baseline. Audit before changing because some scripts may be CI-specific.
- `pnpm build` runs `prebuild`, which currently calls `npm run clean:logs`. Treat build as a potentially workspace-mutating check until that behavior is reviewed.
- Some scripts can contact external services or local infrastructure when env vars are present. Keep readiness work limited to static/local checks unless a task explicitly scopes live verification.

## Baseline Validation Status

Captured during the repo-readiness pass on 2026-05-22:

- `pnpm lint`: failed on pre-existing Biome format issues in application files outside this docs change.
- `pnpm check-types`: passed when allowed to update TypeScript build info in the workspace.
- `pnpm test`: passed when allowed to spawn the local esbuild/Vitest worker process.
- `pnpm build`: not run for this docs-only pass because `prebuild` performs log cleanup via `npm run clean:logs`.
