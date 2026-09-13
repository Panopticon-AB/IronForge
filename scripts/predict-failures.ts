/**
 * Predict Failures
 *
 * Analyzes git diff to predict which CI specialists will likely be needed.
 * Runs as a pre-step in l1-verify to give early warnings.
 *
 * Usage: npx tsx scripts/predict-failures.ts
 */

import { execSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { appendFileSync } from 'node:fs';
import { Socket } from 'node:net';

interface RiskArea {
  specialist: string;
  risk: 'high' | 'medium' | 'low';
  reason: string;
  matchedFiles: string[];
}

interface DatabasePreflightResult {
  configuration: 'missing' | 'invalid' | 'valid';
  schema: 'skipped' | 'invalid' | 'valid';
  dns: 'skipped' | 'failed' | 'resolved';
  tcp: 'skipped' | 'timed-out' | 'refused' | 'unreachable' | 'reachable';
}

const RISK_PATTERNS: {
  pattern: RegExp;
  specialist: string;
  risk: 'high' | 'medium';
  reason: string;
}[] = [
  {
    pattern: /prisma\/schema\.prisma/,
    specialist: 'doctor-infra',
    risk: 'high',
    reason: 'Prisma schema changed — DB Guard will verify drift',
  },
  {
    pattern: /prisma\/migrations\//,
    specialist: 'doctor-infra',
    risk: 'high',
    reason: 'Migration files modified — shadow DB validation required',
  },
  {
    pattern: /tests\/e2e\//,
    specialist: 'doctor-qa',
    risk: 'medium',
    reason: 'E2E test files changed — Playwright suite may be affected',
  },
  {
    pattern: /\.github\/workflows\//,
    specialist: 'doctor-meta',
    risk: 'high',
    reason: 'CI workflow files changed — Governance Guard will validate',
  },
  {
    pattern: /docker-compose|Dockerfile/,
    specialist: 'doctor-infra',
    risk: 'high',
    reason: 'Docker config changed — container build may break',
  },
  {
    pattern: /src\/components\//,
    specialist: 'doctor-ui-ux',
    risk: 'medium',
    reason: 'UI components changed — visual/a11y regression possible',
  },
  {
    pattern: /package\.json|pnpm-lock/,
    specialist: 'doctor-code',
    risk: 'medium',
    reason: 'Dependencies changed — lockfile sync and audit needed',
  },
  {
    pattern: /src\/app\/api\//,
    specialist: 'doctor-code',
    risk: 'medium',
    reason: 'API routes changed — type safety and Zod validation at risk',
  },
  {
    pattern: /\.env|secrets/i,
    specialist: 'doctor-security',
    risk: 'high',
    reason: 'Environment/secret files touched — exposure risk',
  },
];

function getChangedFiles(): string[] {
  for (const command of [
    'git diff --name-only HEAD~1 HEAD',
    'git diff --name-only main...HEAD',
  ]) {
    try {
      const diff = execSync(command, { encoding: 'utf-8' }).trim();
      if (diff) return diff.split(/\r?\n/u).filter(Boolean);
    } catch {
      // Try the next safe diff source.
    }
  }
  return [];
}

function analyzeRisks(files: string[]): RiskArea[] {
  return RISK_PATTERNS.flatMap((rule) => {
    const matchedFiles = files.filter((file) => rule.pattern.test(file));
    return matchedFiles.length > 0 ? [{ ...rule, matchedFiles }] : [];
  });
}

function probeTcp(host: string, port: number): Promise<DatabasePreflightResult['tcp']> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const finish = (status: DatabasePreflightResult['tcp']) => {
      socket.destroy();
      resolve(status);
    };

    socket.setTimeout(3_000);
    socket.once('connect', () => finish('reachable'));
    socket.once('timeout', () => finish('timed-out'));
    socket.once('error', (error) => {
      const code = 'code' in error ? String(error.code) : '';
      finish(code === 'ECONNREFUSED' ? 'refused' : 'unreachable');
    });
    socket.connect(port, host);
  });
}

async function databasePreflight(): Promise<DatabasePreflightResult> {
  const result: DatabasePreflightResult = {
    configuration: 'missing',
    schema: 'skipped',
    dns: 'skipped',
    tcp: 'skipped',
  };
  const value = process.env.DATABASE_URL?.trim();

  if (value) {
    try {
      const parsed = new URL(value);
      if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) {
        throw new Error('invalid');
      }

      result.configuration = 'valid';
      try {
        execSync('npx prisma validate', { stdio: 'ignore', timeout: 15_000 });
        result.schema = 'valid';
      } catch {
        result.schema = 'invalid';
      }

      try {
        await lookup(parsed.hostname);
        result.dns = 'resolved';
        result.tcp = await probeTcp(parsed.hostname, Number(parsed.port || 5432));
      } catch {
        result.dns = 'failed';
      }
    } catch {
      result.configuration = 'invalid';
    }
  }

  const summary = [
    '## Sanitized database preflight',
    '',
    `- DATABASE_URL: \`${result.configuration}\``,
    `- Prisma schema: \`${result.schema}\``,
    `- DNS resolution: \`${result.dns}\``,
    `- TCP endpoint: \`${result.tcp}\``,
    '',
    'Endpoint values, credentials, database names and raw output are intentionally omitted.',
  ].join('\n');

  console.log(`Database preflight: ${JSON.stringify(result)}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, 'utf8');
  }
  return result;
}

function isHealthyPreflight(result: DatabasePreflightResult): boolean {
  return (
    result.configuration === 'valid' &&
    result.schema === 'valid' &&
    result.dns === 'resolved' &&
    result.tcp === 'reachable'
  );
}

function reportRisks(files: string[]): void {
  console.log('\n🔮 Predictive Failure Analysis');
  console.log(`  Files changed: ${files.length}`);

  const risks = analyzeRisks(files);
  if (risks.length === 0) {
    console.log('  ✅ No high-risk areas detected.');
    return;
  }

  for (const risk of risks) {
    const icon = risk.risk === 'high' ? '🔴' : '🟡';
    console.log(`\n  ${icon} ${risk.specialist}: ${risk.reason}`);
    for (const file of risk.matchedFiles) {
      console.log(`     → ${file}`);
    }

    if (process.env.GITHUB_ACTIONS && risk.risk === 'high') {
      console.log(
        `::warning title=Predictive Analysis::${risk.specialist}: ${risk.reason} (${risk.matchedFiles.length} files)`
      );
    }
  }
}

async function main(): Promise<void> {
  const preflight = await databasePreflight();
  reportRisks(getChangedFiles());

  if (!isHealthyPreflight(preflight)) {
    console.log(
      '::warning title=Database Preflight::One or more sanitized database readiness checks failed.'
    );
  }
}

main().catch(() => {
  console.error(
    '::error title=Predictive Failure Analysis::Predictive analysis could not complete safely.'
  );
  process.exitCode = 1;
});
