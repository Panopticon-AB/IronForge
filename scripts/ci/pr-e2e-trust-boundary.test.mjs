import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const [ciWorkflow, publicSmokeWorkflow, playwrightConfig] = await Promise.all([
  readFile('.github/workflows/ci-cd.yml', 'utf8'),
  readFile('.github/workflows/pr-public-smoke.yml', 'utf8'),
  readFile('playwright.config.ts', 'utf8'),
]);

function classifierBlock() {
  const start = ciWorkflow.indexOf('\n  classify-pr-impact:\n');
  const end = ciWorkflow.indexOf(
    '\n  # ==================================================================\n  # TIER L1:',
    start
  );

  assert.notEqual(start, -1, 'ci-cd.yml must contain the PR impact classifier');
  assert.notEqual(end, -1, 'ci-cd.yml must retain the L1 boundary after the classifier');
  return ciWorkflow.slice(start, end);
}

function fullE2EBlock() {
  const start = ciWorkflow.indexOf('\n  e2e:\n');
  const end = ciWorkflow.indexOf('\n  # ==================================================================\n  # PHASE 3:', start);

  assert.notEqual(start, -1, 'ci-cd.yml must contain the full e2e job');
  assert.notEqual(end, -1, 'ci-cd.yml must retain the PHASE 3 boundary after the e2e job');
  return ciWorkflow.slice(start, end);
}

test('PR impact classifier is hosted, read-only and cannot persist on Panopticon runners', () => {
  const block = classifierBlock();

  assert.match(block, /runs-on:\s*ubuntu-latest/);
  assert.doesNotMatch(block, /self-hosted/);
  assert.doesNotMatch(block, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(block, /:\s*write\s*$/m);
  assert.match(block, /persist-credentials:\s*false/);
  assert.match(block, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
});

test('PR public smoke is base-controlled, hosted and secretless', () => {
  assert.match(publicSmokeWorkflow, /^\s*pull_request_target:\s*$/m);
  assert.match(publicSmokeWorkflow, /^\s*permissions:\s*\n\s+contents:\s*read\s*$/m);
  assert.match(publicSmokeWorkflow, /^\s*runs-on:\s*ubuntu-latest\s*$/m);
  assert.match(publicSmokeWorkflow, /repository:\s*\$\{\{ github\.event\.pull_request\.head\.repo\.full_name \}\}/);
  assert.match(publicSmokeWorkflow, /ref:\s*\$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(publicSmokeWorkflow, /persist-credentials:\s*false/);
  assert.match(publicSmokeWorkflow, /package-manager-cache:\s*false/);
  assert.match(
    publicSmokeWorkflow,
    /playwright test tests\/e2e\/critical-path\.spec\.ts --project=smoke/
  );

  assert.doesNotMatch(publicSmokeWorkflow, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(publicSmokeWorkflow, /self-hosted/);
  assert.doesNotMatch(publicSmokeWorkflow, /actions\/cache/);
  assert.doesNotMatch(publicSmokeWorkflow, /^\s*cache:\s*['"]?(?:npm|yarn|pnpm)['"]?\s*$/m);
  assert.doesNotMatch(publicSmokeWorkflow, /:\s*write\s*$/m);
  assert.doesNotMatch(publicSmokeWorkflow, /TEST_USER_(?:EMAIL|PASSWORD)/);
  assert.doesNotMatch(publicSmokeWorkflow, /SUPABASE_SERVICE_(?:KEY|ROLE_KEY)/);
});

test('credential-backed E2E is post-merge main-only and cannot run from PR or dispatch', () => {
  const block = fullE2EBlock();

  assert.match(block, /github\.event_name == 'push'/);
  assert.match(block, /github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(block, /github\.event_name == 'pull_request'/);
  assert.doesNotMatch(block, /github\.event_name == 'workflow_dispatch'/);
  assert.doesNotMatch(block, /needs:\s*\[classify-pr-impact/);
  assert.match(
    block,
    /runs-on:\s*\[self-hosted, linux, panopticon, ci, small(?:, live-approved)?\]/
  );
  assert.match(block, /persist-credentials:\s*false/);
});

test('public smoke explicitly skips credential-backed global setup', () => {
  assert.match(playwrightConfig, /IRONFORGE_E2E_SKIP_GLOBAL_SETUP/);
  assert.match(playwrightConfig, /\? undefined\s*:\s*'\.\/tests\/e2e\/setup\/e2e-seed\.ts'/);
  assert.match(publicSmokeWorkflow, /IRONFORGE_E2E_SKIP_GLOBAL_SETUP:\s*'true'/);
});
