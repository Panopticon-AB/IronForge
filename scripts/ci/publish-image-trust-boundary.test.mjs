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

test('publish-image is strictly restricted to push on main branch (no PR or dispatch access)', () => {
  const block = publishImageBlock();

  assert.match(block, /github\.event_name == 'push'/);
  assert.match(block, /github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(block, /github\.event_name == 'pull_request'/);
  assert.doesNotMatch(block, /github\.event_name == 'workflow_dispatch'/);
  assert.doesNotMatch(block, /startsWith\(github\.ref,\s*'refs\/heads\/fix\/'\)/);
  assert.doesNotMatch(block, /needs:\s*\[classify-pr-impact/);

  // Negative assertion: if broadened to pull_request, regression catches it
  const broadenedBlock = block.replace(
    /github\.event_name == 'push'/,
    "github.event_name == 'pull_request'"
  );
  assert.match(broadenedBlock, /github\.event_name == 'pull_request'/);
});

test('publish-image retains package-write and Docker push authority guarded by live-approved', () => {
  const block = publishImageBlock();

  assert.match(block, /packages:\s*write/);
  assert.match(block, /docker\/build-push-action/);
  assert.match(block, /push:\s*true/);
});
