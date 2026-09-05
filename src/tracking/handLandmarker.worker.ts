/// <reference lib="webworker" />

import type { HandLandmarker as HandLandmarkerInstance } from '@mediapipe/tasks-vision'
import type { FingerName } from '../typing/fingerMap'
import type { LandmarkFrame, TrackedHand, TrackingWorkerMessage } from './types'

declare const self: DedicatedWorkerGlobalScope

const TIP_INDEX: Record<FingerName, number> = {
  thumb: 4,
  index: 8,
  middle: 12,
  ring: 16,
  little: 20,
}

const originalFetch = self.fetch.bind(self)
self.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const candidate = input instanceof Request ? input.url : input.toString()
  const url = new URL(candidate, self.location.href)
  if (url.origin !== self.location.origin) {
    return Promise.reject(new TypeError(`Blocked an off-origin worker request to ${url.origin}.`))
  }
  return originalFetch(input, init)
}

let landmarker: HandLandmarkerInstance | null = null

function post(message: TrackingWorkerMessage): void {
  self.postMessage(message)
}

self.onmessage = async (
  event: MessageEvent<
    | { type: 'init'; wasmBaseUrl: string; modelUrl: string }
    | { type: 'frame'; bitmap: ImageBitmap; timestamp: number }
  >,
) => {
  if (event.data.type === 'init') {
    try {
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(event.data.wasmBaseUrl, true)
      landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: event.data.modelUrl,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
      post({ type: 'ready' })
    } catch (error) {
      post({ type: 'error', message: error instanceof Error ? error.message : 'Could not load hand tracking.' })
    }
    return
  }

  const { bitmap, timestamp } = event.data
  if (!landmarker) {
    bitmap.close()
    post({ type: 'error', message: 'Hand tracking is not ready yet.' })
    return
  }

  try {
    const startedAt = performance.now()
    const result = landmarker.detectForVideo(bitmap, timestamp)
    const hands: TrackedHand[] = result.landmarks.flatMap((landmarks, index) => {
      const category = result.handedness[index]?.[0]
      const side = category?.categoryName.toLowerCase()
      if (side !== 'left' && side !== 'right') return []
      const fingertips = Object.fromEntries(
        Object.entries(TIP_INDEX).map(([finger, landmarkIndex]) => {
          const point = landmarks[landmarkIndex]
          return [finger, { x: point?.x ?? 0, y: point?.y ?? 0, z: point?.z ?? 0 }]
        }),
      ) as TrackedHand['fingertips']
      return [{ hand: side, confidence: category.score, fingertips }]
    })
    const frame: LandmarkFrame = {
      timestamp,
      inferenceMs: performance.now() - startedAt,
      hands,
    }
    post({ type: 'frame', frame })
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : 'Hand tracking failed.' })
  } finally {
    bitmap.close()
  }
}
