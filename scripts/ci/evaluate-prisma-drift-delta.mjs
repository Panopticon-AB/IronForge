import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function normalizeDiffOutput(value) {
  return String(value ?? '').replaceAll('\r\n', '\n').trim();
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

export function evaluatePrismaDriftDelta({
  baseStatus,
  candidateStatus,
  baseOutput,
  candidateOutput,
}) {
  if (![0, 2].includes(baseStatus)) {
    return {
      pass: false,
      classification: 'base_diff_error',
      reason: `Trusted base prisma migrate diff returned unexpected exit code ${baseStatus}.`,
    };
  }

  if (![0, 2].includes(candidateStatus)) {
    return {
      pass: false,
      classification: 'candidate_diff_error',
      reason: `Candidate prisma migrate diff returned unexpected exit code ${candidateStatus}.`,
    };
  }

  const normalizedBase = normalizeDiffOutput(baseOutput);
  const normalizedCandidate = normalizeDiffOutput(candidateOutput);

  if (candidateStatus === 0) {
    return {
      pass: true,
      classification: baseStatus === 0 ? 'clean_matches_clean_base' : 'candidate_removes_baseline_drift',
      reason:
        baseStatus === 0
          ? 'Candidate migration history matches the schema and trusted base is also clean.'
          : 'Candidate removes existing trusted-base migration drift.',
    };
  }

  if (
    baseStatus === 2 &&
    normalizedBase.length > 0 &&
    normalizedBase === normalizedCandidate
  ) {
    return {
      pass: true,
      classification: 'baseline_drift_unchanged',
      reason: 'Candidate introduces no migration drift beyond the current trusted-base baseline.',
    };
  }

  return {
    pass: false,
    classification: baseStatus === 0 ? 'new_candidate_drift' : 'candidate_changes_baseline_drift',
    reason:
      baseStatus === 0
        ? 'Candidate introduces migration drift relative to a clean trusted base.'
        : 'Candidate changes the existing migration-drift baseline; review or repair the migration/schema pair.',
    baseDigest: digest(normalizedBase),
    candidateDigest: digest(normalizedCandidate),
  };
}

function parseArguments(argv) {
  const options = {
    baseStatus: null,
    candidateStatus: null,
    baseFile: '',
    candidateFile: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === '--base-status') {
      options.baseStatus = Number(value);
    } else if (argument === '--candidate-status') {
      options.candidateStatus = Number(value);
    } else if (argument === '--base-file') {
      options.baseFile = value ?? '';
    } else if (argument === '--candidate-file') {
      options.candidateFile = value ?? '';
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }

    index += 1;
  }

  if (!Number.isInteger(options.baseStatus) || !Number.isInteger(options.candidateStatus)) {
    throw new Error('--base-status and --candidate-status must be integer exit codes');
  }
  if (!options.baseFile || !options.candidateFile) {
    throw new Error('--base-file and --candidate-file are required');
  }

  return options;
}

function runCli() {
  const options = parseArguments(process.argv.slice(2));
  const result = evaluatePrismaDriftDelta({
    baseStatus: options.baseStatus,
    candidateStatus: options.candidateStatus,
    baseOutput: readFileSync(options.baseFile, 'utf8'),
    candidateOutput: readFileSync(options.candidateFile, 'utf8'),
  });

  console.log(`IRONFORGE_PRISMA_DRIFT_CLASSIFICATION=${result.classification}`);
  console.log(`IRONFORGE_PRISMA_DRIFT_PASS=${String(result.pass)}`);
  console.log(result.reason);

  if (!result.pass) {
    if (result.baseDigest) {
      console.error(`Trusted-base drift digest: ${result.baseDigest}`);
    }
    if (result.candidateDigest) {
      console.error(`Candidate drift digest: ${result.candidateDigest}`);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('evaluate-prisma-drift-delta.mjs')) {
  try {
    runCli();
  } catch (error) {
    console.error('IRONFORGE_PRISMA_DRIFT_CLASSIFICATION=evaluator_error_fail_closed');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
