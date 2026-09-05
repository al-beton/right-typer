import { CALIBRATION_VERSION, type CalibrationRecord } from './calibration'

const STORAGE_KEY = 'right-typer.calibration.v1'

export function loadCalibration(): CalibrationRecord | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (!value) return null
    const parsed = JSON.parse(value) as CalibrationRecord
    return parsed.version === CALIBRATION_VERSION ? parsed : null
  } catch {
    return null
  }
}

export function saveCalibration(calibration: CalibrationRecord): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(calibration))
}

export function clearCalibration(): void {
  localStorage.removeItem(STORAGE_KEY)
}

