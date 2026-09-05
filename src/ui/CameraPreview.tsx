import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { CalibrationSample, KeyCentre } from '../calibration/calibration'
import { type FingerTarget } from '../typing/fingerMap'
import { TrackingClient, type TrackingStatus } from '../tracking/trackingClient'
import type { LandmarkFrame } from '../tracking/types'

interface CameraPreviewProps {
  stream: MediaStream
  mode: 'setup' | 'calibration' | 'confirm' | 'lesson'
  activeTarget?: FingerTarget
  awaitingCentre?: boolean
  keySamples?: Record<string, CalibrationSample>
  onCentre?: (centre: KeyCentre) => void
  onFrame: (frame: LandmarkFrame) => void
  onTrackingStatus: (status: TrackingStatus, message?: string) => void
}

const FINGER_COLOURS = {
  thumb: '#f4b942',
  index: '#ff7a67',
  middle: '#b79cff',
  ring: '#68d7bd',
  little: '#65a8ff',
} as const

export function CameraPreview({
  stream,
  mode,
  activeTarget,
  awaitingCentre = false,
  keySamples = {},
  onCentre,
  onFrame,
  onTrackingStatus,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latestFrame = useRef<LandmarkFrame | undefined>(undefined)
  const [status, setStatus] = useState<TrackingStatus>('loading')
  const [statusMessage, setStatusMessage] = useState<string>()
  const onFrameRef = useRef(onFrame)
  const onStatusRef = useRef(onTrackingStatus)

  useEffect(() => {
    onFrameRef.current = onFrame
  }, [onFrame])

  useEffect(() => {
    onStatusRef.current = onTrackingStatus
  }, [onTrackingStatus])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    let client: TrackingClient | null = null
    let cancelled = false
    const startTracking = async () => {
      try {
        await video.play()
        if (cancelled) return
        client = new TrackingClient(
          video,
          (frame) => {
            latestFrame.current = frame
            onFrameRef.current(frame)
          },
          (nextStatus, message) => {
            setStatus(nextStatus)
            setStatusMessage(message)
            onStatusRef.current(nextStatus, message)
          },
        )
        client.start()
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'The camera preview could not start.'
        setStatus('error')
        setStatusMessage(message)
        onStatusRef.current('error', message)
      }
    }
    void startTracking()
    return () => {
      cancelled = true
      client?.stop()
      video.pause()
    }
  }, [stream])

  useEffect(() => {
    let animationFrame = 0
    const draw = () => {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (!canvas || !video) return
      const rect = video.getBoundingClientRect()
      const scale = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(rect.width * scale) || canvas.height !== Math.round(rect.height * scale)) {
        canvas.width = Math.round(rect.width * scale)
        canvas.height = Math.round(rect.height * scale)
      }
      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(scale, 0, 0, scale, 0, 0)
      context.clearRect(0, 0, rect.width, rect.height)

      for (const [code, sample] of Object.entries(keySamples)) {
        const isActive = activeTarget?.code === code
        context.beginPath()
        context.arc((1 - sample.centre.x) * rect.width, sample.centre.y * rect.height, isActive ? 8 : 4, 0, Math.PI * 2)
        context.fillStyle = isActive ? '#f4b942' : 'rgba(255,255,255,.82)'
        context.fill()
      }

      const frame = latestFrame.current
      if (frame) {
        for (const hand of frame.hands) {
          for (const [finger, point] of Object.entries(hand.fingertips)) {
            context.beginPath()
            context.arc((1 - point.x) * rect.width, point.y * rect.height, 5, 0, Math.PI * 2)
            context.fillStyle = FINGER_COLOURS[finger as keyof typeof FINGER_COLOURS]
            context.fill()
          }
        }
      }
      animationFrame = requestAnimationFrame(draw)
    }
    animationFrame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animationFrame)
  }, [activeTarget?.code, keySamples])

  const handlePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!awaitingCentre || !onCentre) return
    const rect = event.currentTarget.getBoundingClientRect()
    onCentre({
      x: 1 - (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    })
  }

  return (
    <section className="camera-card" aria-label="Live camera preview">
      <div
        className={`camera-viewport ${awaitingCentre ? 'is-marking' : ''}`}
        onPointerDown={handlePointer}
      >
        <video ref={videoRef} muted playsInline aria-label="Mirrored live camera view" />
        <canvas ref={canvasRef} aria-hidden="true" />
        {mode === 'setup' ? <div className="keyboard-guide" aria-hidden="true" /> : null}
        {mode === 'calibration' && awaitingCentre ? (
          <div className="marking-hint">Click the centre of {activeTarget?.label}</div>
        ) : null}
      </div>
      <div className="camera-meta">
        <span className={`status-dot status-${status}`} aria-hidden="true" />
        <span>{status === 'ready' ? 'On-device tracking ready' : status === 'loading' ? 'Loading hand tracking…' : statusMessage}</span>
        <span className="privacy-chip">never uploaded</span>
      </div>
    </section>
  )
}
