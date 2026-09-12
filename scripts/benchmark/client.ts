import type { SeenHand } from '../../src/core/types';
type InputFrame = { id: number; at: number; url: string };
type ResultFrame = { id: number; at: number; hands: SeenHand[]; inferenceMs: number };
declare global {
  interface Window {
    runRecording: (frames: InputFrame[]) => Promise<ResultFrame[]>;
  }
}
window.runRecording = async (frames) => {
  // The same built worker and pinned MediaPipe assets used by the application.
  // A fresh VIDEO-mode worker per recording prevents tracking across sessions.
  const worker = new Worker('/tracking/tracking-worker.js');
  let resolveMessage: ((value: Record<string, unknown>) => void) | undefined;
  let rejectMessage: ((reason: Error) => void) | undefined;
  worker.onmessage = ({ data }) => {
    if (data.type === 'error') rejectMessage?.(new Error(data.message));
    else resolveMessage?.(data);
  };
  worker.onerror = (event) => rejectMessage?.(new Error(event.message));
  const next = () =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      resolveMessage = resolve;
      rejectMessage = reject;
    });
  const output: ResultFrame[] = [];
  try {
    const ready = next();
    worker.postMessage({ type: 'init', base: location.origin + '/' });
    if ((await ready).type !== 'ready') throw new Error('Unexpected worker initialization');
    for (const frame of frames) {
      const response = await fetch(frame.url);
      if (!response.ok) throw new Error('Could not read frame ' + frame.id);
      const bitmap = await createImageBitmap(await response.blob());
      const message = next();
      const start = performance.now();
      worker.postMessage({ type: 'frame', id: frame.id, at: frame.at, clock: 'capture', bitmap }, [
        bitmap,
      ]);
      const result = await message;
      if (result.type !== 'frame' || result.id !== frame.id || result.at !== frame.at)
        throw new Error('Worker returned a different frame');
      output.push({
        id: frame.id,
        at: frame.at,
        hands: result.hands as SeenHand[],
        inferenceMs: performance.now() - start,
      });
      document.body.textContent = `Processed ${output.length}/${frames.length} camera frames`;
    }
    return output;
  } finally {
    worker.terminate();
  }
};
