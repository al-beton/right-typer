import { mkdir, cp, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await mkdir('public/wasm', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/wasm', { recursive: true });
const model = await readFile('public/models/hand_landmarker.task');
const expected = (await readFile('public/models/SHA256SUMS', 'utf8')).trim().split(/\s/)[0];
if (createHash('sha256').update(model).digest('hex') !== expected)
  throw new Error('Model checksum mismatch');
console.log('Local MediaPipe runtime copied; model checksum verified.');
