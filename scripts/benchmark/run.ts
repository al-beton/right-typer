import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import type { Sample } from '../../src/recording/types';
import type { SeenHand } from '../../src/core/types';
import { validateSample } from '../../src/recording/validate';
import { scoreSample, replaceLandmarks } from './score';

type Input = {
  name: string;
  labelledPresses: number;
  participantCount: number;
  split: string;
  recordings: {
    id: string;
    directory: string;
    labels: string;
    archiveSha256: string;
    labelsSha256: string;
  }[];
};
const args = process.argv.slice(2).filter((a) => a !== '--');
const argument = (key: string) => {
  const i = args.indexOf(key);
  return i < 0 ? undefined : args[i + 1];
};
const inputFile = argument('--input');
const output = argument('--output');
if (!inputFile || !output)
  throw new Error('Usage: pnpm benchmark:camera -- --input INPUT.json --output REPORT-DIRECTORY');
const root = process.cwd();
const input: Input = JSON.parse(await readFile(inputFile, 'utf8'));
const samples: Sample[] = [];
const media = new Map<string, string>();
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
for (const [index, record] of input.recordings.entries()) {
  const json = async (name: string) =>
    JSON.parse(await readFile(path.join(record.directory, name), 'utf8'));
  const lines = async (file: string) =>
    (await readFile(file, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  const manifest: Sample['manifest'] = await json('manifest.json');
  // Verify again at the point of use, including every PNG and the human labels.
  for (const [name, entry] of Object.entries(manifest.files)) {
    const file = path.resolve(record.directory, name);
    if (!file.startsWith(path.resolve(record.directory) + path.sep))
      throw new Error('Unsafe recording path');
    const bytes = await readFile(file);
    if (bytes.byteLength !== entry.bytes || digest(bytes) !== entry.sha256)
      throw new Error('Recording checksum mismatch: ' + name);
  }
  if (digest(await readFile(record.labels)) !== record.labelsSha256)
    throw new Error('Labels changed after preparation');
  const sample: Sample = {
    manifest,
    calibration: await json('calibration.json'),
    events: await lines(path.join(record.directory, 'events.jsonl')),
    frames: await lines(path.join(record.directory, 'frames.jsonl')),
    labels: await lines(record.labels),
  };
  validateSample(sample);
  replaceLandmarks(sample, []);
  samples.push(sample);
  for (const frame of sample.frames)
    media.set(
      `/__benchmark/frame/${index}/${frame.id}.png`,
      path.join(record.directory, frame.file),
    );
}
const server = await createServer({
  configFile: false,
  root,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'camera-benchmark-inputs',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url === '/__benchmark') {
            response.setHeader('Content-Type', 'text/html');
            response.end(
              '<!doctype html><title>Camera benchmark</title><body>Starting model…<script type="module" src="/scripts/benchmark/client.ts"></script>',
            );
          } else {
            const file = media.get(request.url ?? '');
            if (!file) return next();
            void readFile(file)
              .then((bytes) => {
                response.setHeader('Content-Type', 'image/png');
                response.end(bytes);
              })
              .catch(() => {
                response.statusCode = 500;
                response.end('Frame unavailable');
              });
          }
        });
      },
    },
  ],
});
await server.listen();
const address = server.httpServer!.address();
if (!address || typeof address === 'string') throw new Error('Benchmark server did not bind');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const browserVersion = browser.version();
const results = [];
const landmarks: {
  recording: string;
  frames: { id: number; at: number; hands: SeenHand[]; inferenceMs: number }[];
}[] = [];
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(600000);
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  await page.goto(origin + '/__benchmark');
  await page.waitForFunction(() => typeof window.runRecording === 'function');
  for (const [index, sample] of samples.entries()) {
    const id = input.recordings[index]!.id;
    console.log(`Running MediaPipe on ${id}: ${sample.frames.length} captured frames`);
    const ordered = [...sample.frames].sort((a, b) => a.at - b.at);
    const frames = await page.evaluate(
      (inputs) => window.runRecording(inputs),
      ordered.map((f) => ({ id: f.id, at: f.at, url: `/__benchmark/frame/${index}/${f.id}.png` })),
    );
    if (frames.length !== sample.frames.length) throw new Error('Incomplete model run');
    const resultFramesWithoutPixels = replaceLandmarks(sample, frames);
    const score = await scoreSample(sample);
    results.push({
      recording: id,
      ...score,
      inputFrames: frames.length,
      resultFramesWithoutPixels,
      meanInferenceMs: frames.reduce((s, f) => s + f.inferenceMs, 0) / frames.length,
    });
    landmarks.push({ recording: id, frames });
    console.log(`${id}: ${score.matches}/${score.labelled} human labels matched`);
  }
} finally {
  await browser.close();
  await server.close();
}
const labelled = results.reduce((sum, r) => sum + r.labelled, 0);
const matches = results.reduce((sum, r) => sum + r.matches, 0);
if (!labelled || labelled !== input.labelledPresses)
  throw new Error('Benchmark did not score every expected human label');
const methodFiles = [
  'src/core/observation.ts',
  'src/core/calibration.ts',
  'src/core/keyboard.ts',
  'src/core/profile.ts',
  'src/core/exercise.ts',
  'src/recording/replay.ts',
];
const method = createHash('sha256');
for (const file of methodFiles) method.update(file).update(await readFile(file));
const report = {
  schemaVersion: 1,
  browserVersion,
  platform: process.platform,
  architecture: process.arch,
  dataset: input.name,
  codeRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  modelSha256: digest(await readFile('public/models/hand_landmarker.task')),
  workerSha256: digest(await readFile('public/tracking/tracking-worker.js')),
  methodSha256: method.digest('hex'),
  mediapipe: JSON.parse(await readFile('package.json', 'utf8')).dependencies[
    '@mediapipe/tasks-vision'
  ],
  labelled,
  matches,
  accuracy: matches / labelled,
  unclassified: results.reduce((sum, r) => sum + r.unclassified, 0),
  participantCount: input.participantCount,
  split: input.split,
  recordings: results,
  inputs: input.recordings.map(({ id, archiveSha256, labelsSha256 }) => ({
    id,
    archiveSha256,
    labelsSha256,
  })),
  protocol:
    'Fresh production MediaPipe CPU worker per recording, all captured native PNG frames in capture order, then production evidence buffer and grading with original event timing. Cached landmarks are cleared. Missing-pixel results stay empty. Cold starts and original frame/timing gaps remain limitations; inference runtime is measured separately from replay timing.',
};
const percent = (100 * report.accuracy).toFixed(1) + '%';
const summary =
  `# Recorded-camera benchmark: ${percent}\n\n${matches}/${labelled} human-labelled presses matched; ${report.unclassified} unclassified.\n\n| Recording | Matches | Accuracy | Unclassified |\n| --- | --- | --- | --- |\n` +
  results
    .map(
      (r) =>
        `| ${r.recording} | ${r.matches}/${r.labelled} | ${(100 * (r.accuracy ?? 0)).toFixed(1)}% | ${r.unclassified} |`,
    )
    .join('\n') +
  `\n\nStarts from captured camera pixels and reruns the production MediaPipe worker. Uses the original capture/event timeline for the production attribution and grading logic. One participant, development data; this is not a general accuracy estimate.\n\nModel: \`${report.modelSha256}\`\n\nCode: \`${report.codeRevision}\`\n\nScores below 100% are valid results. The job fails on integrity, model, processing or coverage errors, not ordinary misclassifications. See report.json for every press and grading counts.\n`;
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(path.join(output, 'landmarks.json'), JSON.stringify(landmarks) + '\n');
await writeFile(path.join(output, 'summary.md'), summary);
console.log(`Camera benchmark: ${percent} (${matches}/${labelled}); report saved.`);
