import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { SeenHand } from '../core/types';
let model: HandLandmarker | undefined;
let canvas: OffscreenCanvas;
let context: OffscreenCanvasRenderingContext2D;
self.onmessage = async (event: MessageEvent) => {
  const message = event.data;
  if (message.type === 'init') {
    try {
      // Classic worker is intentional: the pinned Emscripten runtime uses importScripts.
      const files = await FilesetResolver.forVisionTasks(`${message.base}wasm`);
      model = await HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: `${message.base}models/hand_landmarker.task`,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      canvas = new OffscreenCanvas(640, 480);
      context = canvas.getContext('2d')!;
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({
        type: 'error',
        message: `The hand model could not start. ${String(error)}`,
      });
    }
    return;
  }
  if (message.type === 'frame') {
    const bitmap: ImageBitmap = message.bitmap;
    try {
      if (!model) throw new Error('Model is not ready');
      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
      }
      context.drawImage(bitmap, 0, 0);
      const result = model.detectForVideo(canvas, message.at);
      const hands: SeenHand[] = result.landmarks.map((points, i) => ({
        side: result.handedness[i]?.[0]?.categoryName.toLowerCase() === 'left' ? 'left' : 'right',
        score: result.handedness[i]?.[0]?.score ?? 0,
        points: points.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      }));
      self.postMessage({
        type: 'frame',
        id: message.id,
        at: message.at,
        clock: message.clock,
        hands,
      });
    } catch (error) {
      self.postMessage({ type: 'error', message: `Tracking stopped. ${String(error)}` });
    } finally {
      bitmap.close();
    }
  }
};
