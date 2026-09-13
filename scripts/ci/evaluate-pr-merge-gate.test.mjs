import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluatePrMergeGate } from './evaluate-pr-merge-gate.mjs';

test('passes when runtime-impacting PR has successful classifier, policy and L1', () => {
  assert.deepEqual(
    evaluatePrMergeGate({
      classifyResult: 'success',
      policyResult: 'success',
      runL1: 'true',
      l1Result: 'success',
    }),
    { ok: true, failures: [] },
  );
});

test('passes when control-plane-only PR explicitly skips L1', () => {
  assert.deepEqual(
    evaluatePrMergeGate({
      classifyResult: 'success',
      policyResult: 'success',
      runL1: 'false',
      l1Result: 'skipped',
    }),
    { ok: true, failures: [] },
  );
});

test('fails closed when classifier output is missing', () => {
  const result = evaluatePrMergeGate({
    classifyResult: 'success',
    policyResult: 'success',
    runL1: '',
    l1Result: 'skipped',
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /run-l1 output must be true or false/);
});

test('fails when classifier or policy fails', () => {
  const result = evaluatePrMergeGate({
    classifyResult: 'failure',
    policyResult: 'cancelled',
    runL1: 'false',
    l1Result: 'skipped',
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /classifier result must be success/);
  assert.match(result.failures.join('\n'), /policy result must be success/);
});

test('fails when required L1 is skipped or failing', () => {
  for (const l1Result of ['skipped', 'failure', 'cancelled', '']) {
    const result = evaluatePrMergeGate({
      classifyResult: 'success',
      policyResult: 'success',
      runL1: 'true',
      l1Result,
    });

    assert.equal(result.ok, false, `expected ${l1Result || 'missing'} to fail`);
  }
});

test('fails on unexpected optional L1 state', () => {
  const result = evaluatePrMergeGate({
    classifyResult: 'success',
    policyResult: 'success',
    runL1: 'false',
    l1Result: 'cancelled',
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /L1 is optional but result is unexpected/);
});
