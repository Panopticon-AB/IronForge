const allowedOptionalL1Results = new Set(['skipped', 'success']);

export function evaluatePrMergeGate({ classifyResult, policyResult, runL1, l1Result }) {
  const failures = [];

  if (classifyResult !== 'success') {
    failures.push(`classifier result must be success, got ${classifyResult || 'missing'}`);
  }

  if (policyResult !== 'success') {
    failures.push(`policy result must be success, got ${policyResult || 'missing'}`);
  }

  if (runL1 !== 'true' && runL1 !== 'false') {
    failures.push(`run-l1 output must be true or false, got ${runL1 || 'missing'}`);
  } else if (runL1 === 'true' && l1Result !== 'success') {
    failures.push(`L1 is required but result is ${l1Result || 'missing'}`);
  } else if (runL1 === 'false' && !allowedOptionalL1Results.has(l1Result)) {
    failures.push(`L1 is optional but result is unexpected: ${l1Result || 'missing'}`);
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

function runCli() {
  const result = evaluatePrMergeGate({
    classifyResult: process.env.CLASSIFY_RESULT ?? '',
    policyResult: process.env.POLICY_RESULT ?? '',
    runL1: process.env.RUN_L1 ?? '',
    l1Result: process.env.L1_RESULT ?? '',
  });

  if (!result.ok) {
    console.error('IRONFORGE_PR_MERGE_GATE=FAIL');
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('IRONFORGE_PR_MERGE_GATE=PASS');
}

if (process.argv[1]?.endsWith('evaluate-pr-merge-gate.mjs')) {
  runCli();
}
