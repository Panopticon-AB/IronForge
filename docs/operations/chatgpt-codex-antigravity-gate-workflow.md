# ChatGPT ↔ Codex/Antigravity Gate Workflow

## Purpose

This workflow defines the low-friction operating model for delivering bounded engineering gates in IronForge/Panopticon, especially when coordinating work from a phone with remote Codex or Antigravity.

The primary goals are:

- minimize window and context switching;
- keep agent context small and disposable;
- use GitHub as durable project memory;
- preserve explicit acceptance evidence;
- keep scope bounded to the current gate;
- make the workflow usable even with low energy or executive capacity.

## Core principle

> GitHub holds durable project memory.  
> ChatGPT controls the work.  
> Codex or Antigravity implements one bounded change at a time.

Chats are execution contexts, not the source of truth.

Issues, pull requests, acceptance criteria, architectural decisions and evidence belong in GitHub.

---

## Active-context limit

During a gate, keep normally only two relevant conversational contexts active:

1. one persistent ChatGPT control chat;
2. one temporary Codex or Antigravity implementation chat.

Avoid separate planning, implementation, review and architecture chats unless a concrete exceptional problem requires isolation.

The default interaction model is:

```text
ChatGPT ↔ Codex/Antigravity
```

not:

```text
ChatGPT → planner → Codex A → Codex B → reviewer → GitHub → ChatGPT
```

---

## 1. Persistent ChatGPT control chat

Create one ChatGPT control chat for the whole gate.

Example:

```text
IronForge — Gate 2 Control
```

The control chat owns:

- gate scope;
- prioritization;
- dependency reasoning;
- GitHub inspection;
- selection of the next smallest coherent change;
- Codex/Antigravity handoff prompts;
- acceptance review;
- scope control;
- deciding whether a PR needs correction or is ready to merge;
- selecting the next unit of work.

It should not accumulate unnecessary implementation details already preserved in GitHub.

---

## 2. Temporary Codex/Antigravity implementation chat

Use one fresh implementation conversation for each bounded implementation unit, normally one issue or one PR.

The implementation agent can be either:

- Codex;
- Antigravity.

Choose whichever produces the lowest-friction path for the task.

Examples:

```text
Codex — Gate2 production database
```

or:

```text
Antigravity — Gate2 Coolify deployment
```

The agent receives only enough context to implement the current task:

- repository;
- issue;
- goal;
- architectural boundary;
- real dependencies;
- Definition of Done;
- explicit non-goals;
- verification requirements.

Do not paste the full gate history into the implementation chat.

After the PR is accepted and merged, that implementation conversation is considered disposable.

Create a fresh Codex/Antigravity chat for the next PR.

---

# Standard workflow

## Step 1 — Select next work

In the persistent ChatGPT control chat, the user can simply say:

```text
Nästa steg
```

ChatGPT then:

1. inspects the master tracker and current GitHub state;
2. identifies the current blocker;
3. chooses the smallest coherent next PR;
4. verifies dependencies;
5. prevents unnecessary scope expansion;
6. prepares a ready-to-paste Codex or Antigravity prompt.

## Step 2 — Implement

Paste the generated prompt into a fresh remote Codex or Antigravity conversation.

The implementation agent:

1. inspects current repository truth;
2. implements only the bounded task;
3. runs targeted verification;
4. creates or updates the PR;
5. reports:
   - changes made;
   - tests run;
   - PR number;
   - remote head SHA;
   - remaining acceptance gaps, if any.

The agent must stop after the current task's Definition of Done.

It must not automatically begin the next gate item.

## Step 3 — Review

Return to the same persistent ChatGPT control chat.

Paste the Codex/Antigravity completion report and say:

```text
Granska
```

ChatGPT verifies actual GitHub state rather than trusting the agent report alone.

Review includes, when relevant:

- remote head SHA;
- changed files and implementation boundaries;
- tests and CI;
- security;
- acceptance criteria;
- scope creep;
- truthful PR evidence.

## Step 4A — Acceptance passes

If the PR satisfies its Definition of Done:

```text
PASS → merge
```

After merge:

- record acceptance evidence in GitHub;
- update the master tracker;
- discard the Codex/Antigravity implementation conversation;
- remain in the same ChatGPT control conversation.

Then the user may say:

```text
Nästa steg
```

and the cycle repeats.

## Step 4B — Acceptance fails

If a concrete gap exists:

```text
FAIL → correction prompt
```

ChatGPT creates one focused correction prompt.

Send it back to the **same** Codex/Antigravity conversation.

Do not create a new agent conversation for a narrow correction to the same PR unless the existing context has become materially corrupted or overloaded.

Then repeat:

```text
Codex/Antigravity → ChatGPT → Granska
```

until accepted.

---

# Phone-first interaction model

Normal use from a phone should require approximately:

1. ChatGPT: `Nästa steg`
2. copy generated prompt
3. paste into Codex or Antigravity
4. copy agent completion report
5. return to ChatGPT
6. type `Granska`

The user should not normally need to:

- reconstruct project context;
- manually track dependencies;
- maintain multiple implementation-agent conversations;
- summarize previous architecture decisions;
- decide which acceptance tests matter;
- manually create a handoff package.

Those coordination costs belong to the system.

---

# Low-capacity mode

When energy or executive capacity is low, this should be enough:

```text
ChatGPT: Nästa steg
→ Codex/Antigravity
→ paste completion report into ChatGPT
→ ChatGPT: Granska
```

The user should not need to manually rebuild state from several windows or chats.

---

# GitHub as durable memory

## Master tracker

Contains:

- gate goal;
- gate status;
- dependency chain;
- accepted milestones;
- current blocker;
- next bounded step.

## Issues

Contain:

- purpose;
- architectural boundary;
- Definition of Done;
- dependencies;
- explicit non-goals.

## Pull requests

Contain:

- implementation summary;
- acceptance evidence;
- test results;
- relevant CI evidence;
- known limitations.

## Repository documentation

Contains:

- stable operating models;
- architectural principles;
- reusable workflows;
- governance rules.

The project state should be understandable without access to old ChatGPT, Codex or Antigravity transcripts.

---

# Codex/Antigravity handoff contract

Every implementation prompt should include:

## Repository

Exact repository.

## Task

One bounded change.

## Goal

One sentence describing the capability that must become true.

## Reuse

Existing components or infrastructure that should be extended rather than duplicated.

## Dependencies

Only actual blockers.

## Definition of Done

Concrete acceptance criteria.

## Non-goals

Things the agent must not implement.

## Verification

Required tests and CI evidence.

## Stop condition

Explicit instruction to stop after the current PR.

---

# Choosing Codex vs Antigravity

Both are implementation agents in this workflow.

### Codex

Good default for:

- focused code changes;
- clear repo tasks;
- implementation from a well-defined issue/DoD;
- small bounded PRs.

### Antigravity

Useful when the task benefits from more agentic repository navigation or a longer connected execution chain, for example:

- several related files;
- CI/repository governance;
- deployment/infrastructure;
- troubleshooting that requires several iterations.

This is a practical heuristic, not a hard architecture boundary.

ChatGPT may choose the agent based on the next task and lowest expected coordination cost.

---

# Context hygiene

Start a fresh Codex/Antigravity conversation when:

- the previous PR has merged;
- the task changes materially;
- previous implementation context no longer helps the next task.

Keep the existing implementation conversation when:

- fixing review findings in the same PR;
- rerunning or repairing tests;
- making narrow corrections to the same bounded task.

Keep the same ChatGPT control conversation throughout the gate while its accumulated context remains useful.

---

# Scope control

Before starting any new work, ask:

> Is this required to satisfy the current gate, or is it merely useful?

If it is useful but not required, defer it.

For Panopticon/IronForge, prioritize:

1. stability;
2. security;
3. recoverability;
4. simplicity;
5. automation;
6. performance;
7. new features.

---

# Gate completion

A gate closes only when acceptance evidence exists in GitHub.

An agent statement such as `done` is not acceptance evidence.

Typical evidence includes:

- merged PRs;
- CI results;
- automated acceptance tests;
- production verification where required;
- updated tracker status.

After gate closure:

1. summarize the accepted capability in the master tracker;
2. preserve reusable architectural decisions in repository docs;
3. start a fresh ChatGPT control chat for the next major gate when doing so materially reduces context overhead.

---

# Example — IronForge Gate 2

Persistent conversation:

```text
ChatGPT — IronForge Gate 2 Control
```

Temporary conversations:

```text
Codex — Gate2 production PostgreSQL
→ merge
→ discard

Antigravity — Gate2 Coolify deployment
→ merge
→ discard

Codex — Gate2 backup/restore proof
→ merge
→ discard
```

The ChatGPT control chat remains constant through Gate 2 and maintains the dependency chain and acceptance state.

---

# Success criterion

The workflow is working correctly when development can be driven from a phone primarily through:

```text
Nästa steg
```

and:

```text
Granska
```

while GitHub contains enough durable context that new ChatGPT, Codex or Antigravity conversations can start without reconstructing the full history.