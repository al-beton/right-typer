import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { reviewPage } from './sample-review';
import { unarchive, sha256 } from '../src/recording/archive';
import { replaySample } from '../src/recording/replay';
import type { Sample } from '../src/recording/types';

// Usage: pnpm sample -- /private/path/sample.tar [--import /private/dataset-root]
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const source = args[0];
if (!source) throw new Error('Usage: pnpm sample -- sample.tar [--import /private/dataset-root]');
const files = unarchive(new Uint8Array(await readFile(source)));
const text = (name: string) => {
  if (!files[name]) throw new Error(`Missing ${name}`);
  return new TextDecoder().decode(files[name]);
};
const lines = (name: string) =>
  text(name)
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
const manifest: Sample['manifest'] = JSON.parse(text('manifest.json'));
for (const [name, info] of Object.entries(manifest.files)) {
  const bytes = files[name];
  if (
    !bytes ||
    bytes.byteLength !== info.bytes ||
    (await sha256(bytes.slice().buffer as ArrayBuffer)) !== info.sha256
  )
    throw new Error(`Checksum/size mismatch: ${name}`);
}
for (const name of Object.keys(files))
  if (name !== 'manifest.json' && !manifest.files[name]) throw new Error(`Unlisted file: ${name}`);
const sample: Sample = {
  manifest,
  calibration: JSON.parse(text('calibration.json')),
  events: lines('events.jsonl'),
  frames: lines('frames.jsonl'),
  labels: lines('labels.jsonl'),
};
const labelAt = args.indexOf('--labels');
if (labelAt >= 0) {
  if (!args[labelAt + 1]) throw new Error('Missing label revision path');
  sample.labels = (await readFile(args[labelAt + 1]!, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
const report = await replaySample(sample);
console.log(JSON.stringify(report, null, 2));
const importAt = args.indexOf('--import');
if (importAt >= 0) {
  if (!args[importAt + 1]) throw new Error('Missing dataset root');
  for (const id of [manifest.participantId, manifest.setupId, manifest.sessionId])
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(id)) throw new Error('Unsafe sample identity');
  const root = path.resolve(args[importAt + 1]!);
  // Data must live outside the public checkout, including in worktrees.
  const repo = process.cwd();
  if (root === repo || root.startsWith(repo + path.sep))
    throw new Error('Choose a private dataset root outside this checkout');
  const directory = path.join(
    root,
    'samples',
    manifest.participantId,
    manifest.setupId,
    manifest.sessionId,
  );
  await mkdir(directory, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) {
    const destination = path.join(directory, name);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: 'wx' });
  }
  await writeFile(path.join(directory, 'review.html'), reviewPage(sample), { flag: 'wx' });
  await mkdir(path.join(root, 'reports'), { recursive: true });
  await writeFile(
    path.join(root, 'reports', `${manifest.sessionId}-${Date.now()}.json`),
    JSON.stringify(report, null, 2),
  );
  await mkdir(path.join(root, 'splits'), { recursive: true });
  for (const split of ['regression', 'holdout']) {
    const target = path.join(root, 'splits', `${split}.json`);
    try {
      await access(target);
    } catch {
      await writeFile(target, '[]\n', { flag: 'wx' });
    }
  }
  const catalogPath = path.join(root, 'catalog.json');
  let catalog: unknown[] = [];
  try {
    catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  catalog.push({
    sessionId: manifest.sessionId,
    participantId: manifest.participantId,
    setupId: manifest.setupId,
    path: path.relative(root, directory),
    manifestSha256: await sha256(files['manifest.json']!.slice().buffer as ArrayBuffer),
    annotationStatus: 'unreviewed',
  });
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
  console.log(`Imported into ${directory}`);
}
if (report.differences.length) process.exitCode = 1;
