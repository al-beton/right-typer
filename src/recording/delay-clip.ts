import type { Frame, FrameTiming } from '../core/types';
import { cropPixels, type Crop } from '../view/crop';

export const CLIP_MS = 5000;
export const CLIP_MAX_FRAMES = 180;
export const CLIP_MAX_BYTES = 24 * 1024 * 1024;
export type ClipFrame = {
  id: number;
  basisAt: number;
  timing: FrameTiming;
  blob: Blob;
  width: number;
  height: number;
};
export type ClipKey = { key: string; code: string; at: number };
export function clipFrameForKey(
  frames: Pick<ClipFrame, 'basisAt'>[],
  at: number,
  delay: number,
  maxDistance = 500,
): number {
  let best = -1;
  let distance = Infinity;
  frames.forEach((frame, i) => {
    const gap = Math.abs(frame.basisAt - delay - at);
    if (gap < distance) {
      best = i;
      distance = gap;
    }
  });
  return distance <= maxDistance ? best : -1;
}
// Each JPEG belongs to a VideoFrame frozen synchronously in rVFC. Encoding order
// and blob arrival never supply its timestamp. No MediaRecorder clock is involved.
export class DelayClip {
  frames: ClipFrame[] = [];
  keys: ClipKey[] = [];
  state: 'empty' | 'recording' | 'finishing' | 'ready' = 'empty';
  message = 'Record a short clip while tapping F → R and E → R.';
  private epoch = 0;
  private timer?: number;
  private pending = 0;
  private inFlight = 0;
  private bytes = 0;
  private sequence = 0;
  private startAt = 0;
  private stopAt = 0;
  dropped = 0;
  constructor(private changed: () => void) {}
  start() {
    this.discard();
    this.state = 'recording';
    this.startAt = performance.now();
    this.message = 'Recording up to 5 seconds. Tap keys in the recording box.';
    this.timer = window.setTimeout(() => this.stop(), CLIP_MS);
    this.changed();
  }
  stop() {
    if (this.state !== 'recording') return;
    clearTimeout(this.timer);
    this.stopAt = Math.min(performance.now(), this.startAt + CLIP_MS);
    this.state = 'finishing';
    this.finish();
    this.changed();
  }
  key(key: ClipKey) {
    if (
      this.state === 'recording' &&
      key.at >= this.startAt &&
      key.at <= this.startAt + CLIP_MS &&
      this.keys.length < 100
    )
      this.keys.push({ ...key });
  }
  capture(
    video: HTMLVideoElement,
    timed: Pick<Frame, 'at' | 'clock' | 'timing'>,
    crop: Crop,
    rotation: number,
  ) {
    if (this.state !== 'recording' || !timed.timing) return;
    if (performance.now() - this.startAt >= CLIP_MS) {
      this.stop();
      return;
    }
    if (this.frames.length + this.pending >= CLIP_MAX_FRAMES) {
      this.stop();
      return;
    }
    if (this.inFlight >= 2) {
      this.dropped++;
      return;
    }
    const timing = structuredClone(timed.timing);
    const basisAt = timed.at - timing.offsetMs;
    const epoch = this.epoch;
    const id = ++this.sequence;
    const rect = cropPixels(crop, video.videoWidth, video.videoHeight);
    let frozen: VideoFrame;
    try {
      frozen = new VideoFrame(video, { timestamp: Math.round(basisAt * 1000) });
    } catch {
      this.message = 'Could not capture a frame. Retake the clip.';
      this.stop();
      return;
    }
    this.pending++;
    this.inFlight++;
    void createImageBitmap(frozen)
      .then(async (bitmap) => {
        try {
          if (epoch !== this.epoch) return;
          const scale = Math.min(1, 960 / Math.max(rect.width, rect.height));
          const w = Math.max(1, Math.round(rect.width * scale));
          const h = Math.max(1, Math.round(rect.height * scale));
          const sideways = rotation === 90 || rotation === 270;
          const canvas = new OffscreenCanvas(sideways ? h : w, sideways ? w : h);
          const ctx = canvas.getContext('2d')!;
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, -w / 2, -h / 2, w, h);
          const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
          if (epoch !== this.epoch) return;
          if (this.bytes + blob.size > CLIP_MAX_BYTES) {
            this.message = 'Clip reached its memory limit.';
            this.stop();
            return;
          }
          this.bytes += blob.size;
          this.frames.push({
            id,
            basisAt,
            timing,
            blob,
            width: canvas.width,
            height: canvas.height,
          });
        } finally {
          bitmap.close();
        }
      })
      .catch(() => {
        if (epoch === this.epoch) {
          this.dropped++;
          this.message = 'Some frames could not be encoded. Inspect the captured-frame gaps.';
        }
      })
      .finally(() => {
        frozen.close();
        this.inFlight--;
        if (epoch !== this.epoch) return;
        this.pending--;
        this.finish();
        this.changed();
      });
  }
  private finish() {
    if (this.state !== 'finishing' || this.pending) return;
    this.frames.sort((a, b) => a.basisAt - b.basisAt || a.id - b.id);
    this.state = 'ready';
    this.message = `${this.frames.length} captured frames, ${this.keys.length} keypresses over ${((this.stopAt - this.startAt) / 1000).toFixed(1)} seconds. ${this.dropped ? `${this.dropped} frames skipped; gaps are real.` : 'Only captured frames are shown.'}`;
  }
  discard() {
    this.epoch++;
    clearTimeout(this.timer);
    this.pending = 0;
    this.bytes = 0;
    this.sequence = 0;
    this.frames = [];
    this.keys = [];
    this.dropped = 0;
    this.state = 'empty';
    this.message = 'Clip discarded. Record a new clip to compare timing.';
    this.changed();
  }
}
