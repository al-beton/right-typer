import { useCallback, useEffect, useRef, useState } from 'react'
import type { CalibrationRecord } from '../calibration/calibration'

export interface CameraState {
  stream: MediaStream | null
  info: CalibrationRecord['camera'] | null
  error: string | null
  requesting: boolean
}

const INITIAL_CAMERA_STATE: CameraState = {
  stream: null,
  info: null,
  error: null,
  requesting: false,
}

export function useCamera() {
  const [camera, setCamera] = useState<CameraState>(INITIAL_CAMERA_STATE)
  const streamRef = useRef<MediaStream | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCamera(INITIAL_CAMERA_STATE)
  }, [])

  const start = useCallback(async () => {
    setCamera((current) => ({ ...current, requesting: true, error: null }))
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
      })
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = stream
      const settings = stream.getVideoTracks()[0]?.getSettings()
      setCamera({
        stream,
        info: {
          deviceId: settings?.deviceId ?? '',
          width: settings?.width ?? 1280,
          height: settings?.height ?? 720,
        },
        error: null,
        requesting: false,
      })
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow it in Chrome’s site settings, then try again.'
          : 'I could not start the built-in camera. Check that another app is not using it.'
      setCamera({ ...INITIAL_CAMERA_STATE, error: message })
    }
  }, [])

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), [])

  return { ...camera, start, stop }
}
