import { appendFileSync, readFileSync } from 'node:fs';

const exactDatabaseGuardPaths = new Set(['prisma/schema.prisma']);
const databaseGuardPrefixes = ['prisma/migrations/'];

export function normalizeRepositoryPath(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    normalized.length === 0 ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    return null;
  }

  return normalized;
}

export function parseChangedPathText(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }

  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function isDatabaseGuardPath(value) {
  const repositoryPath = normalizeRepositoryPath(value);
  if (!repositoryPath) {
    return false;
  }

  return (
    exactDatabaseGuardPaths.has(repositoryPath) ||
    databaseGuardPrefixes.some((prefix) => repositoryPath.startsWith(prefix))
  );
}

export function classifyDbGuardImpact(values) {
  const normalizedPaths = [];
  let invalidPathCount = 0;

  for (const value of values ?? []) {
    const repositoryPath = normalizeRepositoryPath(value);
    if (!repositoryPath) {
      invalidPathCount += 1;
      continue;
    }

    if (!normalizedPaths.includes(repositoryPath)) {
      normalizedPaths.push(repositoryPath);
    }
  }

  if (invalidPathCount > 0) {
    return {
      runDbGuard: true,
      classification: 'invalid_path_fail_closed',
      changedPathCount: normalizedPaths.length + invalidPathCount,
      databasePathCount: normalizedPaths.filter(isDatabaseGuardPath).length,
    };
  }

  if (normalizedPaths.length === 0) {
    return {
      runDbGuard: true,
      classification: 'empty_fail_closed',
      changedPathCount: 0,
      databasePathCount: 0,
    };
  }

  const databasePathCount = normalizedPaths.filter(isDatabaseGuardPath).length;
  return {
    runDbGuard: databasePathCount > 0,
    classification: databasePathCount > 0 ? 'prisma_database_change' : 'no_database_change',
    changedPathCount: normalizedPaths.length,
    databasePathCount,
  };
}

function parseArguments(argv) {
  const options = {
    filesFrom: '',
    githubOutput: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--files-from') {
      options.filesFrom = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (argument === '--github-output') {
      options.githubOutput = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!options.filesFrom) {
    throw new Error('--files-from is required');
  }

  return options;
}

function runCli() {
  const options = parseArguments(process.argv.slice(2));
  const changedPaths = parseChangedPathText(readFileSync(options.filesFrom, 'utf8'));
  const result = classifyDbGuardImpact(changedPaths);

  console.log(`IRONFORGE_DB_GUARD_CLASSIFICATION=${result.classification}`);
  console.log(`IRONFORGE_DB_GUARD_CHANGED_PATH_COUNT=${result.changedPathCount}`);
  console.log(`IRONFORGE_DB_GUARD_DATABASE_PATH_COUNT=${result.databasePathCount}`);
  console.log(`IRONFORGE_DB_GUARD_RUN=${String(result.runDbGuard)}`);

  if (options.githubOutput) {
    appendFileSync(
      options.githubOutput,
      [
        `run-db-guard=${String(result.runDbGuard)}`,
        `classification=${result.classification}`,
        `changed-path-count=${result.changedPathCount}`,
        `database-path-count=${result.databasePathCount}`,
        '',
      ].join('\n'),
      'utf8',
    );
  }
}

if (process.argv[1]?.endsWith('classify-db-guard-impact.mjs')) {
  try {
    runCli();
  } catch (error) {
    console.error('IRONFORGE_DB_GUARD_CLASSIFICATION=error_fail_closed');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
