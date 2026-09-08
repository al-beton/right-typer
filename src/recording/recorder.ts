import type { Camera } from '../tracking/camera';
import type { Calibration } from '../core/types';
import { allowedFingers, CALIBRATION_KEYS, type FingeringMode } from '../core/keyboard';
import { archive, sha256 } from './archive';
import type { InputFrame, Label, Manifest, SampleEvent } from './types';
import { validateSample } from './validate';

type Payload = SampleEvent extends infer E
  ? E extends SampleEvent
    ? Omit<E, 'seq' | 'at'>
    : never
  : never;
export type RecordingOptions = {
  calibration: Calibration;
  mode: FingeringMode;
  words: string[];
  rotation: number;
  participantId: string;
  setupId: string;
  notes: string;
};
const MAX_BYTES = 256 * 1024 * 1024;
const MAX_MS = 5 * 60 * 1000;
const json = (value: unknown) =>
  new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
const jsonl = (values: unknown[]) =>
  new Blob([values.map((v) => JSON.stringify(v)).join('\n') + (values.length ? '\n' : '')]);
export class SampleRecorder {
  state: 'recording' | 'stopping' | 'ready' | 'error' | 'discarded' = 'recording';
  message = 'Recording camera and practice keys locally.';
  readonly origin = performance.now();
  readonly id = crypto.randomUUID();
  readonly events: SampleEvent[] = [];
  readonly frames: InputFrame[] = [];
  private files: Record<string, Blob> = {};
  private chunks: Blob[] = [];
  private bytes = 0;
  private pending = new Set<Promise<void>>();
  private timer: number;
  private media: MediaRecorder;
  private sequence = 0;
  private artifact?: Blob;
  private stopPromise?: Promise<void>;
  private metadata: Promise<Manifest['app']>;
  private warnings: string[] = [];
  private calibration: Calibration;
  constructor(
    private camera: Camera,
    private options: RecordingOptions,
    private changed: () => void,
  ) {
    if (!camera.stream || camera.status !== 'ready')
      throw new Error('Start the camera and map keys first.');
    if (
      !/^[a-zA-Z0-9_-]{1,40}$/.test(options.participantId) ||
      !/^[a-zA-Z0-9_-]{1,40}$/.test(options.setupId)
    )
      throw new Error('Use 1–40 letters, numbers, underscores or hyphens for anonymous IDs.');
    const mimeType = ['video/webm;codecs=vp8', 'video/webm'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    if (!mimeType) throw new Error('This browser cannot record WebM. Use Chrome.');
    this.calibration = {
      ...structuredClone(options.calibration),
      deviceId: 'sample-camera',
      savedAt: 0,
    };
    this.media = new MediaRecorder(new MediaStream(camera.stream.getVideoTracks()), { mimeType });
    this.media.ondataavailable = ({ data }) => {
      if (this.state === 'discarded') return;
      if (data.size) {
        this.chunks.push(data);
        this.account(data.size);
      }
    };
    this.media.onerror = () => {
      this.warnings.push('Video encoder error');
      void this.stop('video-error');
    };
    this.media.start(1000);
    this.metadata = Promise.all(
      ['models/hand_landmarker.task', 'tracking/tracking-worker.js'].map(async (path) => {
        const response = await fetch(
          new URL(`${import.meta.env.BASE_URL}${path}`, document.baseURI),
        );
        if (!response.ok) throw new Error(`Could not fingerprint ${path}`);
        return sha256(await response.arrayBuffer());
      }),
    ).then(([modelSha256, trackingWorkerSha256]) => ({
      commit: __APP_COMMIT__,
      dirty: __APP_DIRTY__,
      modelSha256: modelSha256!,
      trackingWorkerSha256: trackingWorkerSha256!,
      mediapipe: '0.10.32',
    }));
    // Attach a rejection handler immediately; export still reports the failure.
    void this.metadata.catch(() => {
      this.warnings.push('Asset fingerprint failed');
      void this.stop('asset-error');
    });
    camera.evidence.trace = (event) => {
      const copy = structuredClone(event);
      if (copy.type === 'frame-start' || copy.type === 'tick') copy.at -= this.origin;
      if (copy.type === 'frame-result') {
        copy.frame.at -= this.origin;
        copy.frame.receivedAt -= this.origin;
      }
      if (copy.type === 'request') copy.press.at -= this.origin;
      this.event({ type: 'evidence', event: copy });
    };
    camera.recordInput = (bitmap, metadata) => {
      if (this.state !== 'recording') return;
      const at = performance.now();
      const input: InputFrame = {
        ...metadata,
        at: metadata.at - this.origin,
        dispatchedAt: at - this.origin,
        file: `inputs/${metadata.id}.png`,
        copyMs: 0,
      };
      this.frames.push(input);
      // Snapshot the exact production ImageBitmap before it is transferred. PNG is
      // lossless in canvas pixel space, not a claim of preserving camera sensor bytes.
      try {
        if (this.pending.size >= 8) throw new Error('Frame export fell behind');
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not create frame canvas');
        context.drawImage(bitmap, 0, 0);
        input.copyMs = performance.now() - at;
        const job = canvas
          .convertToBlob({ type: 'image/png' })
          .then((blob) => {
            if (this.state === 'discarded') return;
            this.files[input.file] = blob;
            input.encodedAt = performance.now() - this.origin;
            this.account(blob.size);
          })
          .catch((error) => {
            input.error = String(error);
            this.warnings.push(`Frame ${input.id}: ${String(error)}`);
            void this.stop('frame-error');
          })
          .finally(() => this.pending.delete(job));
        this.pending.add(job);
      } catch (error) {
        input.error = String(error);
        this.warnings.push(String(error));
        void this.stop('frame-error');
      }
    };
    camera.recordSkip = (reason, metadata) =>
      this.event({
        type: 'lifecycle',
        name: 'frame-skipped',
        detail: JSON.stringify({
          reason,
          mediaTime: metadata.mediaTime,
          presentedFrames: metadata.presentedFrames,
        }),
      });
    this.timer = window.setTimeout(() => void this.stop('five-minute-limit'), MAX_MS);
  }
  event(payload: Payload) {
    if (this.state !== 'recording') return;
    this.events.push({
      ...structuredClone(payload),
      seq: ++this.sequence,
      at: performance.now() - this.origin,
    } as SampleEvent);
  }
  private account(bytes: number) {
    this.bytes += bytes;
    if (this.bytes >= MAX_BYTES && this.state === 'recording') void this.stop('256-MiB-limit');
  }
  private detach() {
    clearTimeout(this.timer);
    this.camera.evidence.trace = undefined;
    this.camera.recordInput = undefined;
    this.camera.recordSkip = undefined;
  }
  stop(reason = 'user'): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    if (this.state !== 'recording') return Promise.resolve();
    this.event({ type: 'lifecycle', name: 'stop', detail: reason });
    this.state = 'stopping';
    const durationMs = performance.now() - this.origin;
    this.detach();
    this.message = 'Preparing local download…';
    this.changed();
    this.stopPromise = this.finish(reason, durationMs).catch((error) => {
      this.state = 'error';
      this.message = `Sample export failed: ${String(error)}. Discard and try a short sample.`;
      this.changed();
    });
    return this.stopPromise;
  }
  private async finish(stopReason: string, durationMs: number) {
    await new Promise<void>((resolve) => {
      if (this.media.state === 'inactive') return resolve();
      this.media.onstop = () => resolve();
      this.media.stop();
    });
    await Promise.all([...this.pending]);
    const app = await this.metadata;
    this.files['camera.webm'] = new Blob(this.chunks, { type: this.media.mimeType });
    this.chunks = [];
    this.files['calibration.json'] = json(this.calibration);
    this.files['frames.jsonl'] = jsonl(this.frames);
    this.files['events.jsonl'] = jsonl(this.events);
    this.files['landmarks.jsonl'] = jsonl(
      this.events.flatMap((e) =>
        e.type === 'evidence' && e.event.type === 'frame-result' ? [e.event.frame] : [],
      ),
    );
    const labels: Label[] = this.events.flatMap((e) =>
      e.type === 'evidence' && e.event.type === 'request'
        ? [
            {
              pressId: e.event.press.id,
              attemptId: e.event.press.attemptId,
              status: 'unreviewed',
              finger: null,
              source: '',
            },
          ]
        : [],
    );
    this.files['labels.jsonl'] = jsonl(labels);
    const manifest: Manifest = {
      schemaVersion: 1,
      sessionId: this.id,
      participantId: this.options.participantId,
      setupId: this.options.setupId,
      createdAt: new Date(performance.timeOrigin + this.origin).toISOString(),
      durationMs,
      stopReason,
      app,
      mode: this.options.mode,
      expectedFingers: Object.fromEntries(
        [...CALIBRATION_KEYS.filter((k) => !k.startsWith('space')), ' '].map((key) => [
          key,
          allowedFingers(key, this.options.mode),
        ]),
      ),
      words: this.options.words,
      camera: {
        width: this.calibration.width,
        height: this.calibration.height,
        frameRate: this.camera.settings()?.frameRate,
        rotation: this.options.rotation,
        mirrored: false,
        coordinates: 'native-normalized',
        videoMimeType: this.media.mimeType,
      },
      browser: navigator.userAgent,
      setupNotes: this.options.notes,
      timing: {
        unit: 'milliseconds',
        origin: 'session-start',
        video: 'viewing-only; use timestamped PNG inputs for alignment',
        unobservedCameraDrops: null,
      },
      files: {},
      warnings: this.warnings,
    };
    for (const [path, file] of Object.entries(this.files))
      manifest.files[path] = { bytes: file.size, sha256: await sha256(await file.arrayBuffer()) };
    validateSample({
      manifest,
      calibration: this.calibration,
      events: this.events,
      frames: this.frames,
      labels,
    });
    this.files['manifest.json'] = json(manifest);
    this.artifact = await archive(this.files);
    this.files = {};
    this.state = 'ready';
    this.message = `Sample ready (${(this.artifact.size / 1024 / 1024).toFixed(1)} MiB; ${stopReason}). Download before leaving this page.`;
    this.changed();
  }
  download() {
    if (!this.artifact || this.state !== 'ready') return;
    const url = URL.createObjectURL(this.artifact);
    const link = document.createElement('a');
    link.href = url;
    link.download = `right-typer-${this.options.participantId}-${this.options.setupId}-${this.id}.tar`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  discard() {
    if (this.state === 'stopping') return;
    this.state = 'discarded';
    this.detach();
    if (this.media.state !== 'inactive') this.media.stop();
    this.files = {};
    this.chunks = [];
    this.artifact = undefined;
    this.events.length = 0;
    this.frames.length = 0;
    this.message = 'Sample discarded.';
    this.changed();
  }
}
