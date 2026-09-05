import type { LandmarkFrame, TrackingWorkerMessage } from './types'

export type TrackingStatus = 'loading' | 'ready' | 'error'

export class TrackingClient {
  private readonly worker: Worker
  private readonly video: HTMLVideoElement
  private readonly onFrame: (frame: LandmarkFrame) => void
  private readonly onStatus: (status: TrackingStatus, message?: string) => void
  private animationFrame = 0
  private busy = false
  private stopped = false
  private ready = false
  private errored = false
  private lastCaptureAt = 0

  constructor(
    video: HTMLVideoElement,
    onFrame: (frame: LandmarkFrame) => void,
    onStatus: (status: TrackingStatus, message?: string) => void,
  ) {
    this.video = video
    this.onFrame = onFrame
    this.onStatus = onStatus
    this.worker = new Worker(new URL('./handLandmarker.worker.ts', import.meta.url), { type: 'module' })
  }

  start(): void {
    this.onStatus('loading')
    const base = new URL(import.meta.env.BASE_URL, window.location.origin)
    this.worker.onmessage = (event: MessageEvent<TrackingWorkerMessage>) => {
      if (event.data.type === 'ready') {
        this.busy = false
        this.ready = true
        this.onStatus('ready')
        this.schedule()
        return
      }
      if (event.data.type === 'error') {
        this.busy = false
        this.errored = true
        this.onStatus('error', event.data.message)
        if (this.ready) this.schedule()
        return
      }
      this.busy = false
      if (this.errored) {
        this.errored = false
        this.onStatus('ready')
      }
      this.onFrame(event.data.frame)
      this.schedule()
    }
    this.worker.onerror = (event) => {
      this.busy = false
      this.onStatus('error', event.message || 'The tracking worker stopped unexpectedly.')
    }
    this.busy = true
    this.worker.postMessage({
      type: 'init',
      wasmBaseUrl: new URL('mediapipe/wasm', base).href,
      modelUrl: new URL('mediapipe/models/hand_landmarker.task', base).href,
    })
  }

  stop(): void {
    this.stopped = true
    cancelAnimationFrame(this.animationFrame)
    this.worker.terminate()
  }

  private schedule(): void {
    if (this.stopped || !this.ready) return
    this.animationFrame = requestAnimationFrame(() => void this.capture())
  }

  private async capture(): Promise<void> {
    if (this.stopped) return
    const now = performance.now()
    if (this.busy || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || now - this.lastCaptureAt < 48) {
      this.schedule()
      return
    }
    this.busy = true
    this.lastCaptureAt = now
    try {
      const bitmap = await createImageBitmap(this.video)
      if (this.stopped) {
        bitmap.close()
        return
      }
      this.worker.postMessage({ type: 'frame', bitmap, timestamp: now }, [bitmap])
    } catch (error) {
      this.busy = false
      this.onStatus('error', error instanceof Error ? error.message : 'Could not read a camera frame.')
      this.schedule()
    }
  }
}
