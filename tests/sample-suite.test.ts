import { afterEach, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digest, runSuite } from '../scripts/sample-suite';
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'sample-suite-'));
  roots.push(root);
  const archive = path.join(root, 'sample.tar');
  await writeFile(archive, 'synthetic test bytes');
  const expected = {
    sessionId: 'synthetic',
    settledPresses: 2,
    submittedWords: 1,
    groundTruth: {
      confirmed: 2,
      unresolved: 0,
      correctPresses: 1,
      correctPressesRejected: 0,
      wrongPresses: 1,
      wrongPressesMissed: 0,
    },
  };
  const entry = { archive: 'sample.tar', sha256: await digest(archive), expected };
  const file = path.join(root, 'suite.json');
  await writeFile(file, JSON.stringify({ version: 1, cases: [entry] }));
  return { root, file, archive, entry, report: { ...expected, differences: [] as unknown[] } };
}
it('replays pinned inputs and checks independent-label counters', async () => {
  const f = await fixture();
  expect(
    (
      await runSuite(f.file, async (archive) => {
        expect(archive).toBe(f.archive);
        return f.report;
      })
    ).passed,
  ).toBe(1);
});
it('fails changed recordings before replay', async () => {
  const f = await fixture();
  await writeFile(f.archive, 'changed');
  const result = await runSuite(f.file, async () => {
    throw new Error('should not run');
  });
  expect(result.failed).toBe(1);
  expect(result.results[0]?.error).toContain('Checksum mismatch');
});
it('fails changed attribution and reduced wrong-finger detection', async () => {
  const f = await fixture();
  expect(
    (await runSuite(f.file, async () => ({ ...f.report, differences: ['changed'] }))).failed,
  ).toBe(1);
  expect(
    (
      await runSuite(f.file, async () => ({
        ...f.report,
        groundTruth: { ...f.report.groundTruth, wrongPressesMissed: 1 },
      }))
    ).failed,
  ).toBe(1);
});
it('rejects empty suites and duplicate sessions', async () => {
  const f = await fixture();
  await writeFile(f.file, JSON.stringify({ version: 1, cases: [] }));
  await expect(runSuite(f.file)).rejects.toThrow('nonempty');
  await writeFile(f.file, JSON.stringify({ version: 1, cases: [f.entry, f.entry] }));
  expect((await runSuite(f.file, async () => f.report)).failed).toBe(1);
});
it('pins label revisions and reports individual replay errors', async () => {
  const f = await fixture();
  const labels = path.join(f.root, 'labels.jsonl');
  await writeFile(labels, 'labels');
  const entry = { ...f.entry, labels: 'labels.jsonl', labelsSha256: await digest(labels) };
  await writeFile(f.file, JSON.stringify({ version: 1, cases: [entry] }));
  expect(
    (
      await runSuite(f.file, async (_archive, file) => {
        expect(file).toBe(labels);
        return f.report;
      })
    ).passed,
  ).toBe(1);
  await writeFile(labels, 'replaced labels');
  expect((await runSuite(f.file, async () => f.report)).failed).toBe(1);
  await writeFile(labels, 'labels');
  const result = await runSuite(f.file, async () => {
    throw new Error('invalid archive');
  });
  expect(result.failed).toBe(1);
});
