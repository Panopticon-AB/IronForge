import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [rawCiWorkflow] = await Promise.all([readFile('.github/workflows/ci-cd.yml', 'utf8')]);

const ciWorkflow = rawCiWorkflow.replace(/\r\n/g, '\n');

function publishImageBlock(content = ciWorkflow) {
  const start = content.indexOf('\n  publish-image:\n');
  assert.notEqual(start, -1, 'ci-cd.yml must contain publish-image job');

  // Next job or end of file
  const nextJobMatch = content.slice(start + 1).search(/\n {2}[a-zA-Z0-9_-]+:\n/);
  const end = nextJobMatch !== -1 ? start + 1 + nextJobMatch : content.length;
  return content.slice(start, end);
}

function parseRunsOnList(block) {
  const match = block.match(/runs-on:\s*\[([^\]]+)\]/);
  if (match) {
    return match[1].split(',').map((s) => s.trim());
  }
  const multilineMatch = block.match(/runs-on:\s*\n((?:\s*-\s*[^\n]+\n)+)/);
  if (multilineMatch) {
    return multilineMatch[1]
      .split('\n')
      .map((line) => line.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean);
  }
  return [];
}

function extractIfCondition(block) {
  const singleLineMatch = block.match(/^\s+if:\s*(.+)$/m);
  if (!singleLineMatch) {
    return '';
  }
  return singleLineMatch[1].trim();
}

function validatePublishImageIfCondition(ifExpr) {
  const normalized = ifExpr
    .replace(/^\${{\s*(.*)\s*}}$/, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  // Split at top-level OR to detect any disjunction
  if (/\s*\|\|\s*/.test(normalized)) {
    throw new Error(`publish-image.if must not contain disjunctions (||): received "${ifExpr}"`);
  }

  // Split into conjuncts by top-level &&
  const conjuncts = normalized.split(/\s+&&\s+/).map((c) =>
    c
      .trim()
      .replace(/^\((.*)\)$/, '$1')
      .trim()
  );

  let hasExactMainBranch = false;
  let hasExactPushEvent = false;

  for (const c of conjuncts) {
    if (c === "github.ref == 'refs/heads/main'" || c === 'github.ref == "refs/heads/main"') {
      hasExactMainBranch = true;
    } else if (c === "github.event_name == 'push'" || c === 'github.event_name == "push"') {
      hasExactPushEvent = true;
    } else {
      throw new Error(`publish-image.if contains unauthorized conjunct: "${c}"`);
    }
  }

  if (!hasExactMainBranch || !hasExactPushEvent || conjuncts.length !== 2) {
    throw new Error(
      `publish-image.if must be strictly a conjunction of main branch and push event: received "${ifExpr}"`
    );
  }
  return true;
}

test('publish-image requires live-approved trust class and cannot use generic self-hosted only', () => {
  const block = publishImageBlock();
  const runsOn = parseRunsOnList(block);

  assert.ok(runsOn.includes('self-hosted'), 'must be self-hosted');
  assert.ok(runsOn.includes('live-approved'), 'must explicitly include live-approved trust class');
  assert.ok(!runsOn.includes('pr-readonly'), 'must not be pr-readonly');

  // Negative assertion: if live-approved is missing, check fails
  const missingLiveApproved = block.replace(/,\s*live-approved/, '');
  const runsOnMissing = parseRunsOnList(missingLiveApproved);
  assert.strictEqual(
    runsOnMissing.includes('live-approved'),
    false,
    'regression check: missing live-approved must be detectable'
  );

  // Negative assertion: if changed to pr-readonly, check detects violation
  const prReadonlyBlock = block.replace(/live-approved/, 'pr-readonly');
  const runsOnPrReadonly = parseRunsOnList(prReadonlyBlock);
  assert.ok(runsOnPrReadonly.includes('pr-readonly'));
});

test('publish-image is strictly restricted to push on main branch (conjunctive event boundary)', () => {
  const block = publishImageBlock();
  const ifCondition = extractIfCondition(block);

  // Structural conjunction validation on current workflow
  assert.ok(validatePublishImageIfCondition(ifCondition));

  // Must not allow PR or dispatch or fix/* branches
  assert.doesNotMatch(block, /github\.event_name == 'pull_request'/);
  assert.doesNotMatch(block, /github\.event_name == 'workflow_dispatch'/);
  assert.doesNotMatch(block, /startsWith\(github\.ref,\s*'refs\/heads\/fix\/'\)/);
  assert.doesNotMatch(block, /needs:\s*\[classify-pr-impact/);

  // Negative tests against all mutations:
  // 1. main || push (disjunction)
  assert.throws(
    () =>
      validatePublishImageIfCondition(
        "github.ref == 'refs/heads/main' || github.event_name == 'push'"
      ),
    /must not contain disjunctions/
  );

  // 2. push only (missing main branch)
  assert.throws(
    () => validatePublishImageIfCondition("github.event_name == 'push'"),
    /must be strictly a conjunction of main branch and push event/
  );

  // 3. main only (missing push event)
  assert.throws(
    () => validatePublishImageIfCondition("github.ref == 'refs/heads/main'"),
    /must be strictly a conjunction of main branch and push event/
  );

  // 4. pull_request
  assert.throws(
    () =>
      validatePublishImageIfCondition(
        "github.ref == 'refs/heads/main' && github.event_name == 'pull_request'"
      ),
    /contains unauthorized conjunct/
  );

  // 5. workflow_dispatch
  assert.throws(
    () =>
      validatePublishImageIfCondition(
        "github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch'"
      ),
    /contains unauthorized conjunct/
  );

  // 6. fix/* branch broadening
  assert.throws(
    () =>
      validatePublishImageIfCondition(
        "startsWith(github.ref, 'refs/heads/fix/') && github.event_name == 'push'"
      ),
    /contains unauthorized conjunct/
  );

  // 7. Extra conjunct added
  assert.throws(
    () =>
      validatePublishImageIfCondition(
        "github.ref == 'refs/heads/main' && github.event_name == 'push' && true"
      ),
    /contains unauthorized conjunct/
  );
});

test('publish-image retains package-write and Docker push authority guarded by live-approved', () => {
  const block = publishImageBlock();

  assert.match(block, /packages:\s*write/);
  assert.match(block, /docker\/build-push-action/);
  assert.match(block, /push:\s*true/);
});
