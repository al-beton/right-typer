import { EvidenceBuffer } from '../core/observation';
import type { Frame } from '../core/types';
import { frameTime, sourceFrameTime } from './timing';
import { displayOptions, displayError, DisplayDiagnostics } from './display';
export type CameraStatus = 'off' | 'loading' | 'ready' | 'error';
export class Camera {
  // Optional local recorder; pixels are copied before the production bitmap is transferred.
  recordInput?: (
    bitmap: ImageBitmap,
    metadata: {
      id: number;
      at: number;
      clock: Frame['clock'];
      mediaTime: number;
      presentedFrames: number;
    },
  ) => void;
  recordSkip?: (reason: string, metadata: { mediaTime: number; presentedFrames: number }) => void;
  stream?: MediaStream;
  source: 'camera' | 'window' = 'camera';
  sourceId = '';
  private inputs = new Map<number, Pick<Frame, 'at' | 'clock' | 'timing'>>();
  get timingSource(): 'camera' | 'desk-view' | 'window' {
    return this.source === 'window'
      ? 'window'
      : /desk.?view/i.test(this.stream?.getVideoTracks()[0]?.label ?? '')
        ? 'desk-view'
        : 'camera';
  }
  diagnostics = new DisplayDiagnostics();
  status: CameraStatus = 'off';
  loadingStage: 'picker' | 'playback' | 'model' = 'picker';
  error = '';
  latest?: Frame;
  readonly evidence = new EvidenceBuffer();
  private worker?: Worker;
  private generation = 0;
  private callbackId = 0;
  private sequence = 0;
  private busy = false;
  private heartbeat = 0;
  private modelTimeout = 0;
  private lastArrival = 0;
  private lastFrameAt = -Infinity;
  constructor(
    readonly video: HTMLVideoElement,
    private changed: () => void,
    private onFrame: (frame: Frame) => void,
  ) {}
  async start(deviceId = '', source: 'camera' | 'window' = 'camera') {
    this.stop();
    this.source = source;
    this.sourceId = source === 'window' ? `window-session-${this.generation}` : deviceId;
    this.diagnostics = new DisplayDiagnostics();
    const generation = this.generation;
    this.status = 'loading';
    this.loadingStage = 'picker';
    this.error = '';
    this.changed();
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        !this.video.requestVideoFrameCallback ||
        typeof VideoFrame === 'undefined' ||
        typeof createImageBitmap === 'undefined'
      )
        throw new Error(
          'Open this page in an up-to-date browser on HTTPS or localhost to use video tracking.',
        );
      if (source === 'window' && !navigator.mediaDevices.getDisplayMedia)
        throw new Error(
          'Window sharing is unavailable in this browser. Open this page in current Chrome on HTTPS or localhost.',
        );
      const stream =
        source === 'window'
          ? await navigator.mediaDevices.getDisplayMedia(displayOptions)
          : await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                width: { ideal: 960 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
              },
            });
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      // Audio is never consumed, including if a provider ignores audio:false.
      stream
        .getTracks()
        .filter((t) => t.kind === 'audio')
        .forEach((t) => {
          t.stop();
          stream.removeTrack(t);
        });
      stream.getVideoTracks()[0]!.onended = () => {
        if (generation === this.generation)
          this.fail(
            source === 'window'
              ? 'Window sharing ended. Choose Share window again, then map the keyboard for the new share.'
              : 'The camera disconnected. Reconnect it, then check the keyboard alignment.',
          );
      };
      this.loadingStage = 'playback';
      this.changed();
      this.video.srcObject = stream;
      this.modelTimeout = window.setTimeout(() => {
        if (generation === this.generation)
          this.fail(
            source === 'window'
              ? 'The selected window preview did not start. Keep Desk View open and visible, then choose Share window again.'
              : 'The camera preview did not start. Reconnect the camera and try again.',
          );
      }, 15000);
      await this.video.play();
      if (generation !== this.generation) return;
      clearTimeout(this.modelTimeout);
      this.loadingStage = 'model';
      this.changed();
      this.worker = new Worker(
        new URL(`${import.meta.env.BASE_URL}tracking/tracking-worker.js`, document.baseURI),
      );
      this.worker.onerror = () => {
        if (generation === this.generation)
          this.fail(
            'The tracking worker could not run. Reload the page and check that all static model assets are available.',
          );
      };
      this.worker.onmessage = (event) => {
        if (generation !== this.generation) return;
        const message = event.data;
        if (message.type === 'ready') {
          clearTimeout(this.modelTimeout);
          this.status = 'ready';
          this.lastArrival = performance.now();
          this.changed();
          this.capture();
        } else if (message.type === 'error') this.fail(message.message);
        else if (message.type === 'frame') {
          this.busy = false;
          this.lastArrival = performance.now();
          const frame: Frame = {
            id: message.id,
            at: message.at,
            clock: message.clock,
            hands: message.hands,
            receivedAt: this.lastArrival,
            ...this.inputs.get(message.id),
          };
          this.inputs.delete(message.id);
          this.diagnostics.results++;
          this.latest = frame;
          this.evidence.add(frame);
          this.onFrame(frame);
        }
      };
      this.modelTimeout = window.setTimeout(
        () =>
          this.fail(
            'The model is taking too long to load. Check the local model files and try the camera again.',
          ),
        30000,
      );
      this.worker.postMessage({
        type: 'init',
        base: new URL(import.meta.env.BASE_URL, document.baseURI).href,
      });
      this.heartbeat = window.setInterval(() => {
        this.evidence.tick(performance.now());
        if (
          this.status === 'ready' &&
          performance.now() - this.lastArrival > 6000 &&
          !document.hidden
        )
          this.fail(
            this.source === 'window'
              ? 'Window frames stopped arriving. Restore the Desk View window, then choose Share window again and remap.'
              : 'Camera frames stopped arriving. Restart the camera and recheck the setup.',
          );
      }, 25);
    } catch (error) {
      if (generation !== this.generation) return;
      const e = error as DOMException;
      this.fail(
        source === 'window'
          ? displayError(e)
          : e.name === 'NotAllowedError'
            ? 'Camera permission is blocked. Allow Camera for this site in your browser settings, then try again.'
            : e.name === 'OverconstrainedError'
              ? 'The saved camera is unavailable. Reconnect it or choose another camera below.'
              : e.name === 'NotFoundError'
                ? 'No camera was found. Connect or enable the MacBook camera, then try again.'
                : e.name === 'NotReadableError'
                  ? 'The browser could not open the camera. Close another app using it, then try again.'
                  : e.message,
      );
    }
  }
  private capture() {
    const generation = this.generation;
    this.callbackId = this.video.requestVideoFrameCallback((_now, metadata) => {
      if (generation !== this.generation || this.status !== 'ready') return;
      this.capture();
      const callbackTime = performance.now();
      const nativeCaptureTime = frameTime(metadata, callbackTime);
      if (this.timingSource !== 'camera')
        this.diagnostics.observe(this.video, metadata, callbackTime, nativeCaptureTime);
      if (this.busy || document.hidden) {
        this.recordSkip?.(document.hidden ? 'hidden' : 'worker-busy', metadata);
        return;
      }
      // rVFC's `now` can be the earlier render-tick timestamp, even before captureTime.
      // Validate against the clock sampled here, not that scheduling timestamp.
      const timing = sourceFrameTime(metadata, callbackTime, this.timingSource);
      const { at, clock } = timing;
      if (at <= this.lastFrameAt) return;
      this.lastFrameAt = at;
      this.busy = true;
      const id = ++this.sequence;
      // Snapshot pixels synchronously inside rVFC so the metadata belongs to these pixels.
      let frozen: VideoFrame | undefined;
      try {
        frozen = new VideoFrame(this.video, { timestamp: Math.round(at * 1000) });
        if (this.source === 'window') this.diagnostics.sample(this.video, callbackTime);
      } catch {
        frozen?.close();
        this.fail(
          'Could not snapshot video frames. Restart the video input in an up-to-date browser.',
        );
        return;
      }
      this.inputs.set(id, timing);
      this.evidence.startFrame(id, at);
      createImageBitmap(frozen)
        .then((bitmap) => {
          if (generation !== this.generation) {
            bitmap.close();
            return;
          }
          this.recordInput?.(bitmap, {
            id,
            at,
            clock,
            mediaTime: metadata.mediaTime,
            presentedFrames: metadata.presentedFrames,
          });
          this.worker?.postMessage(
            {
              type: 'frame',
              bitmap,
              id,
              at,
              clock,
            },
            [bitmap],
          );
        })
        .catch(() => {
          if (generation === this.generation)
            this.fail('Could not read camera frames. Restart the camera.');
        })
        .finally(() => frozen?.close());
    });
  }
  settings() {
    return this.stream?.getVideoTracks()[0]?.getSettings();
  }
  fresh() {
    return this.status === 'ready' && !!this.latest && performance.now() - this.latest.at < 500;
  }
  private fail(message: string) {
    this.stop();
    this.status = 'error';
    this.error = message;
    this.changed();
  }
  stop() {
    this.generation++;
    this.video.cancelVideoFrameCallback?.(this.callbackId);
    this.worker?.terminate();
    this.worker = undefined;
    clearInterval(this.heartbeat);
    clearTimeout(this.modelTimeout);
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.stream = undefined;
    this.video.pause();
    this.video.srcObject = null;
    this.evidence.reset();
    this.inputs.clear();
    this.busy = false;
    this.latest = undefined;
    this.lastFrameAt = -Infinity;
    this.status = 'off';
    this.changed();
  }
}
