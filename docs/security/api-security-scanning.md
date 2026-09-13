# API security scanning policy

## Status

The legacy `EthicalCheck-Workflow` was retired under #636.

It referenced the unavailable `apisec-inc/ethicalcheck-action` and scanned APISEC's public Netbanking demonstration API rather than an IronForge-owned API surface. Keeping the workflow produced a persistent red GitHub Actions signal without providing repository-specific security coverage.

## Current rule

Do not add a third-party DAST/API scanning action merely to restore a green badge.

A future API-security scanner must be admitted only when all of the following are true:

- the scanned endpoint or OpenAPI document is owned by IronForge;
- the workflow has a documented threat/coverage purpose;
- third-party actions are immutable-SHA pinned where supported;
- permissions are least-privilege;
- pull-request code cannot receive production credentials or trusted write tokens;
- test targets are non-production or explicitly approved for security testing;
- findings are reproducible and actionable enough to justify the CI cost;
- failure semantics are deterministic and do not depend on an unrelated vendor demo service.

## Existing security signals

Retiring EthicalCheck does not retire IronForge security governance. Existing repository security workflows and dependency/code-scanning controls remain separate from this decision.

## Reintroduction gate

If IronForge gains a stable owned HTTP/OpenAPI surface that benefits from DAST, open a focused issue first. The issue should name the target, authentication boundary, runner/trust class, expected findings, failure policy and rollback/removal plan before a new workflow is added.
