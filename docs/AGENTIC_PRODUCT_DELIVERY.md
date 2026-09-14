# IronForge Agentic Product Delivery

Status: Proposed
Scope: Product Lab to implementation/verification workflow
Related: #657, #654, #653
Panopticon reference: `Techlemariam/panopticon-infra#2561`

## Purpose

Define the minimum agentic product-delivery architecture for IronForge and make
repository context/retrieval an explicit supporting layer rather than hidden
chat memory or an implicit agent capability.

The goal is a low-friction flow where product intent remains reviewable and
implementation agents receive enough grounded context to make bounded changes
without turning retrieval tooling into product authority.

## 10/10 delivery loop

```text
product question
  -> Product Lab reasoning
  -> behavior validation when needed (Spool)
  -> relevant context/evidence retrieval
  -> agent-ready product/spec contract
  -> Codex implementation
  -> deterministic domain/component verification
  -> agent-driven live UI exercise when relevant
  -> deterministic browser regression
  -> HTTP boundary contracts where valuable
  -> CI / quality evidence
  -> bounded diagnosis/rework
  -> PR / merge
```

Each tool gets one primary job.

## Context / Evidence Plane

IronForge may use an optional context/evidence adapter between product reasoning
and implementation.

Initial candidate: `Techlemariam/MimisBrunnr`, using a pinned reviewed revision
of the repository-analysis capabilities from `AndreGejm/MimisBrunnr#19`.

```text
Git + GitHub issues + reviewed docs
              |
              v
      context/evidence adapter
      - index-repo
      - answer-repo
      - eval-repo
              |
              v
      Product Lab / Spec Kit-lite
              |
              v
             Codex
```

The adapter exists to answer questions such as:

- Which previous issues or decisions constrain this feature?
- Which files are likely canonical for the affected behavior?
- Which security, integration, recovery, or data contracts are relevant?
- Are cited docs stale, superseded, missing, or contradictory?
- Which existing tests/contracts are likely related to the requested change?

## Authority boundary

GitHub issues, reviewed repository content, ADRs, code, schemas, and test
contracts remain authoritative according to their role.

MimisBrunnr or another retrieval tool is advisory evidence only.

It must not become:

- product source of truth;
- training/recovery recommendation authority;
- product behavior owner;
- GitHub write/merge authority;
- deploy authority;
- runtime state authority;
- secrets source;
- automatic issue/spec writer without review;
- replacement for deterministic verification.

If retrieval output conflicts with reviewed repository/GitHub sources, the
reviewed source wins and the conflict should be surfaced explicitly.

## Tool ownership

| Stage | Owner / tool |
| --- | --- |
| Product question and value hypothesis | Product Lab |
| Behavior exploration | Product Lab + optional Spool |
| Context/evidence recovery | direct Git/GitHub search + optional MimisBrunnr |
| Product/spec contract | GitHub issue model, optionally Spec Kit concepts |
| Implementation | Codex |
| Domain/unit/component proof | existing Vitest/testing stack |
| Agent-driven browser exercise | Playwright CLI skills if validated |
| Browser regression | Playwright tests |
| HTTP boundary proof | Bruno if #654 validates |
| CI/provider proof | existing deterministic CI/quality stack |
| Repository/CI reasoning | bounded read-only agent workflow if validated |

## Spec Kit relationship

Spec Kit concepts should structure a product/implementation handoff; they
should not become a knowledge store.

Preferred flow:

```text
product question
  -> retrieve relevant reviewed context
  -> WHY / BEHAVIOR / DATA / MVP / NON-GOALS
  -> acceptance + validation contract
  -> Codex task
```

A context adapter may provide citations and likely dependencies before the
spec/task is rendered, but the resulting GitHub issue remains the reviewed
contract.

## Minimal MimisBrunnr slice

Do not import or deploy the full Mimir stack into IronForge merely to obtain
repository context.

First useful slice:

```text
exact pinned MimisBrunnr revision
  -> repository-only index
  -> source-path citations
  -> retrieval/evaluation health
  -> disposable local cache
  -> no product/runtime write access
```

Not required initially:

- Qdrant;
- embeddings/vector search;
- always-on service;
- network-exposed MCP;
- canonical memory writes;
- model-backed drafting;
- coding runtime.

Direct Git/GitHub search remains the fallback and baseline.

## Candidate Product Lab use cases

### 1. Today / adaptive quest flow

Before Codex touches a Today-flow issue, retrieve relevant issue/docs evidence
for:

- three-choice quest behavior;
- Minimum / Good / Optimal modes;
- no make-up debt;
- quit-smart outcomes;
- interruption/return behavior;
- recovery-aware constraints.

Retrieval helps discover the contract. It does not rank today's real workout.

### 2. Integration boundaries

For Intervals.icu, Hevy, Garmin, Strava, future MCP, or webhook changes,
retrieve:

- auth/idempotency contracts;
- existing route/tests;
- security/non-goal decisions;
- related issues and integration docs.

Bruno may later prove selected HTTP boundaries; retrieval only prepares the
context.

### 3. CI / agent rework

When a PR fails, a read-only diagnosis agent may use cited repository context to
identify likely ownership, prior decisions, or relevant validation contracts.
The CI/provider evidence remains the failure proof.

## Data contract for advisory context

A useful context packet should expose at least:

```text
repository
indexed revision / commit SHA
retrieved_at
included/excluded paths
source citations
freshness / stale status
retrieval health
coverage/gap notes
conflict/supersession notes
```

It must not contain:

- real secrets;
- private user/training data;
- raw production logs;
- hidden chat transcripts;
- broad home/workspace indexing;
- credentials or token-bearing URLs.

## Adoption gate

Keep the adapter only if a bounded pilot improves one or more of:

- time from Product Lab decision to agent-ready issue;
- missed dependency/decision rate;
- Codex rework caused by missing context;
- source/citation quality in implementation handoffs;
- operator effort when diagnosing repository changes.

Outcomes:

- `ADOPT_SELECTIVELY` — retain as optional evidence/context adapter;
- `LIMIT` — narrow to named workflows/repos;
- `DROP` — direct Git/GitHub search remains sufficient.

No broad memory platform adoption follows automatically from a successful
repository-retrieval pilot.

## Panopticon boundary

Panopticon owns the broader agentic operations and authority model.
IronForge should reuse the principle, not copy infrastructure-control
complexity into the application repo:

> Agents reason. Deterministic systems prove. Controlled interfaces mutate.

For IronForge this means product intent is explicit, implementation is bounded,
and proof remains deterministic. MimisBrunnr is only the optional evidence
layer that helps agents find the right reviewed context.

## Removal / fallback

If the context adapter is unavailable or removed:

```text
Product Lab / Codex
  -> direct Git/GitHub/docs search
  -> same product contracts
  -> same tests and CI
```

No IronForge product data, canonical decision, or runtime dependency should
need migration when removing the adapter.
