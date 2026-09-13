import { execFileSync } from 'node:child_process';

const LINTABLE_PATTERNS = [
  '*.js',
  '*.jsx',
  '*.ts',
  '*.tsx',
  '*.json',
  '*.jsonc',
  '*.css',
  '*.graphql',
];

function getChangedLintableFiles(): string[] {
  const output = execFileSync(
    'git',
    [
      'diff',
      '--name-only',
      '-z',
      '--diff-filter=ACMR',
      'origin/main...HEAD',
      '--',
      ...LINTABLE_PATTERNS,
    ],
    { encoding: 'utf8' }
  );

  return output.split('\0').filter(Boolean);
}

function runBiome(files: string[]): void {
  if (files.length === 0) {
    console.log('✅ No changed lintable files.');
    return;
  }

  console.log(`🔎 Linting ${files.length} changed file(s).`);
  for (const file of files) console.log(`  → ${file}`);

  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  execFileSync(pnpm, ['exec', 'biome', 'lint', ...files], {
    stdio: 'inherit',
  });
}

runBiome(getChangedLintableFiles());
