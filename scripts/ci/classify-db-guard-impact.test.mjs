import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyDbGuardImpact,
  isDatabaseGuardPath,
  normalizeRepositoryPath,
  parseChangedPathText,
} from './classify-db-guard-impact.mjs';

test('normalizes repository-relative paths and rejects traversal', () => {
  assert.equal(normalizeRepositoryPath('./prisma/schema.prisma'), 'prisma/schema.prisma');
  assert.equal(
    normalizeRepositoryPath('prisma\\migrations\\20260904_example\\migration.sql'),
    'prisma/migrations/20260904_example/migration.sql',
  );
  assert.equal(normalizeRepositoryPath('../outside'), null);
  assert.equal(normalizeRepositoryPath('C:/temp/schema.prisma'), null);
});

test('parses changed-file text deterministically', () => {
  assert.deepEqual(
    parseChangedPathText('prisma/schema.prisma\nsrc/services/planner.ts\n'),
    ['prisma/schema.prisma', 'src/services/planner.ts'],
  );
  assert.deepEqual(parseChangedPathText('\n'), []);
});

test('recognizes Prisma schema and migration changes', () => {
  assert.equal(isDatabaseGuardPath('prisma/schema.prisma'), true);
  assert.equal(
    isDatabaseGuardPath('prisma/migrations/20260904_training_context/migration.sql'),
    true,
  );
  assert.equal(isDatabaseGuardPath('prisma/seed.ts'), false);
  assert.equal(isDatabaseGuardPath('src/services/planner.ts'), false);
});

test('schema changes enable DB Guard', () => {
  assert.deepEqual(classifyDbGuardImpact(['prisma/schema.prisma']), {
    runDbGuard: true,
    classification: 'prisma_database_change',
    changedPathCount: 1,
    databasePathCount: 1,
  });
});

test('migration SQL changes enable DB Guard', () => {
  const result = classifyDbGuardImpact([
    'prisma/migrations/20260904_training_context/migration.sql',
  ]);
  assert.equal(result.runDbGuard, true);
  assert.equal(result.classification, 'prisma_database_change');
  assert.equal(result.databasePathCount, 1);
});

test('ordinary application-only changes keep DB Guard disabled', () => {
  const result = classifyDbGuardImpact(['src/services/planner.ts']);
  assert.equal(result.runDbGuard, false);
  assert.equal(result.classification, 'no_database_change');
  assert.equal(result.databasePathCount, 0);
});

test('unrelated Prisma files do not activate DB Guard', () => {
  const result = classifyDbGuardImpact(['prisma/seed.ts']);
  assert.equal(result.runDbGuard, false);
  assert.equal(result.classification, 'no_database_change');
});

test('mixed application and migration changes enable DB Guard once', () => {
  const result = classifyDbGuardImpact([
    'src/services/planner.ts',
    'prisma/migrations/20260904_training_context/migration.sql',
    './prisma/migrations/20260904_training_context/migration.sql',
  ]);
  assert.equal(result.runDbGuard, true);
  assert.equal(result.changedPathCount, 2);
  assert.equal(result.databasePathCount, 1);
});

test('empty or invalid evidence fails closed into DB Guard', () => {
  assert.deepEqual(classifyDbGuardImpact([]), {
    runDbGuard: true,
    classification: 'empty_fail_closed',
    changedPathCount: 0,
    databasePathCount: 0,
  });

  const invalid = classifyDbGuardImpact(['../outside']);
  assert.equal(invalid.runDbGuard, true);
  assert.equal(invalid.classification, 'invalid_path_fail_closed');
});
