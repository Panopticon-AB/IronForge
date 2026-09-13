import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluatePrismaDriftDelta } from './evaluate-prisma-drift-delta.mjs';

test('passes when both trusted base and candidate are clean', () => {
  const result = evaluatePrismaDriftDelta({
    baseStatus: 0,
    candidateStatus: 0,
    baseOutput: '',
    candidateOutput: '',
  });
  assert.equal(result.pass, true);
  assert.equal(result.classification, 'clean_matches_clean_base');
});

test('passes when candidate removes existing baseline drift', () => {
  const result = evaluatePrismaDriftDelta({
    baseStatus: 2,
    candidateStatus: 0,
    baseOutput: 'ALTER TABLE example ADD COLUMN legacy integer;',
    candidateOutput: '',
  });
  assert.equal(result.pass, true);
  assert.equal(result.classification, 'candidate_removes_baseline_drift');
});

test('passes when candidate preserves the exact existing drift baseline', () => {
  const result = evaluatePrismaDriftDelta({
    baseStatus: 2,
    candidateStatus: 2,
    baseOutput: 'ALTER TABLE example ADD COLUMN legacy integer;\n',
    candidateOutput: 'ALTER TABLE example ADD COLUMN legacy integer;\r\n',
  });
  assert.equal(result.pass, true);
  assert.equal(result.classification, 'baseline_drift_unchanged');
});

test('fails when candidate introduces drift against a clean base', () => {
  const result = evaluatePrismaDriftDelta({
    baseStatus: 0,
    candidateStatus: 2,
    baseOutput: '',
    candidateOutput: 'ALTER TABLE example ADD COLUMN unexpected integer;',
  });
  assert.equal(result.pass, false);
  assert.equal(result.classification, 'new_candidate_drift');
});

test('fails when candidate changes an existing drift baseline', () => {
  const result = evaluatePrismaDriftDelta({
    baseStatus: 2,
    candidateStatus: 2,
    baseOutput: 'ALTER TABLE example ADD COLUMN legacy integer;',
    candidateOutput: 'ALTER TABLE example ADD COLUMN different integer;',
  });
  assert.equal(result.pass, false);
  assert.equal(result.classification, 'candidate_changes_baseline_drift');
  assert.notEqual(result.baseDigest, result.candidateDigest);
});

test('fails closed on unexpected Prisma exit codes', () => {
  assert.deepEqual(
    evaluatePrismaDriftDelta({
      baseStatus: 1,
      candidateStatus: 0,
      baseOutput: '',
      candidateOutput: '',
    }),
    {
      pass: false,
      classification: 'base_diff_error',
      reason: 'Trusted base prisma migrate diff returned unexpected exit code 1.',
    },
  );

  const candidateError = evaluatePrismaDriftDelta({
    baseStatus: 0,
    candidateStatus: 1,
    baseOutput: '',
    candidateOutput: '',
  });
  assert.equal(candidateError.pass, false);
  assert.equal(candidateError.classification, 'candidate_diff_error');
});

test('does not treat empty drift output with exit code 2 as an unchanged baseline', () => {
  const result = evaluatePrismaDriftDelta({
    baseStatus: 2,
    candidateStatus: 2,
    baseOutput: '',
    candidateOutput: '',
  });
  assert.equal(result.pass, false);
  assert.equal(result.classification, 'candidate_changes_baseline_drift');
});
