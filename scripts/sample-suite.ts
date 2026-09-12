import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
type Report = {
  sessionId: string;
  settledPresses: number;
  submittedWords: number;
  differences: unknown[];
  groundTruth: Record<string, number>;
};
type Case = {
  archive: string;
  sha256: string;
  labels?: string;
  labelsSha256?: string;
  expected: Pick<Report, 'sessionId' | 'settledPresses' | 'submittedWords' | 'groundTruth'>;
};
const truthKeys = [
  'confirmed',
  'unresolved',
  'correctPresses',
  'correctPressesRejected',
  'wrongPresses',
  'wrongPressesMissed',
];
export async function digest(file: string) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}
async function replay(archive: string, labels?: string): Promise<Report> {
  const cli = fileURLToPath(new URL('./sample.mjs', import.meta.url));
  const { stdout } = await execute(
    process.execPath,
    [cli, archive, ...(labels ? ['--labels', labels] : [])],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}
export async function runSuite(file: string, run = replay) {
  const suite = JSON.parse(await readFile(file, 'utf8'));
  if (suite.version !== 1 || !Array.isArray(suite.cases) || !suite.cases.length)
    throw new Error('Expected version 1 and a nonempty cases array');
  const root = path.dirname(path.resolve(file));
  const sessions = new Set<string>();
  const results: { sessionId: string; status: string; error?: string; report?: Report }[] = [];
  for (const entry of suite.cases as Case[]) {
    try {
      if (
        !entry.expected ||
        typeof entry.expected.sessionId !== 'string' ||
        !entry.expected.sessionId
      )
        throw new Error('Missing expected sessionId');
      if (sessions.has(entry.expected.sessionId)) throw new Error('Duplicate session in suite');
      sessions.add(entry.expected.sessionId);
      for (const key of ['settledPresses', 'submittedWords'] as const)
        if (!Number.isSafeInteger(entry.expected[key]) || entry.expected[key] < 0)
          throw new Error(`Missing or invalid expected ${key}`);
      if (
        !entry.expected.groundTruth ||
        truthKeys.some(
          (key) =>
            !Number.isSafeInteger(entry.expected.groundTruth[key]) ||
            entry.expected.groundTruth[key]! < 0,
        )
      )
        throw new Error('Expected all six ground-truth counters, including confirmed');
      const checked = async (relative: string, hash: string) => {
        if (
          typeof relative !== 'string' ||
          !relative ||
          typeof hash !== 'string' ||
          !/^[a-f0-9]{64}$/.test(hash)
        )
          throw new Error('Each input needs a path and SHA-256');
        const target = path.resolve(root, relative);
        if ((await digest(target)) !== hash) throw new Error(`Checksum mismatch: ${relative}`);
        return target;
      };
      const archive = await checked(entry.archive, entry.sha256);
      const labels = entry.labels ? await checked(entry.labels, entry.labelsSha256!) : undefined;
      if (!entry.labels && entry.labelsSha256) throw new Error('Label hash without label file');
      const report = await run(archive, labels);
      if (!Array.isArray(report.differences) || report.differences.length)
        throw new Error('Recorded attribution or grading changed');
      for (const key of ['sessionId', 'settledPresses', 'submittedWords'] as const)
        if (report[key] !== entry.expected[key]) throw new Error(`Unexpected ${key}`);
      for (const key of truthKeys)
        if (report.groundTruth?.[key] !== entry.expected.groundTruth[key])
          throw new Error(`Ground-truth counter changed: ${key}`);
      results.push({ sessionId: report.sessionId, status: 'pass', report });
    } catch (error) {
      results.push({
        sessionId: entry?.expected?.sessionId ?? 'invalid',
        status: 'fail',
        error: String(error),
      });
    }
  }
  return {
    passed: results.filter((r) => r.status === 'pass').length,
    failed: results.filter((r) => r.status === 'fail').length,
    results,
    note: 'Cached production replay with pinned inputs and label revisions. Unlabelled agreement is behavior regression evidence, not accuracy. This does not rerun the hand model.',
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv.slice(2).find((arg) => arg !== '--');
  if (!file) throw new Error('Usage: pnpm test:samples -- /private/dataset/suite.json');
  const report = await runSuite(file);
  console.log(JSON.stringify(report, null, 2));
  if (report.failed) process.exitCode = 1;
}
