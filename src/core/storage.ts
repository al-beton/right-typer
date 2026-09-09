import {
  PRESETS,
  parseProfile,
  LEGACY_CODES,
  LEGACY_APPLE_BRITISH,
  geometrySignature,
  type KeyboardProfile,
} from './profile';
import { isFingeringMode, type FingeringMode } from './keyboard';
import { validCalibration } from './calibration';
import type { Calibration } from './types';
import type { Stats } from './exercise';
import { isCameraRotation, type CameraRotation } from '../view/rotation';
const KEY = 'right-typer.v1';
export type SavedResult = Stats & {
  date: string;
  fingeringModes?: FingeringMode[];
  gradingPolicy: 'verified-only' | 'wrong-finger-veto';
};
export type Saved = {
  profileId?: string;
  customProfiles?: KeyboardProfile[];
  calibrations?: Record<string, Calibration>;
  legacyCalibration?: unknown;
  migrationNotice?: string;
  calibration?: Calibration;
  fingeringMode?: FingeringMode;
  cameraRotation?: CameraRotation;
  cameraDeviceId?: string;
  practiceEnabled?: boolean;
  cameraDisconnected?: boolean;
  results: SavedResult[];
};
export function load(storage: Pick<Storage, 'getItem'> = localStorage): Saved {
  try {
    const raw = storage.getItem(KEY);
    const parsed = JSON.parse(raw ?? '{}');
    const results = Array.isArray(parsed.results)
      ? parsed.results
          .filter(
            (r: SavedResult) =>
              r &&
              typeof r.date === 'string' &&
              (r.gradingPolicy === undefined ||
                r.gradingPolicy === 'verified-only' ||
                r.gradingPolicy === 'wrong-finger-veto') &&
              [
                'attempts',
                'passedWords',
                'textMistakes',
                'wrongFingers',
                'uncertainPresses',
                'retries',
                'elapsedMs',
                'wpm',
              ].every(
                (k) =>
                  typeof r[k as keyof Stats] === 'number' &&
                  Number.isFinite(r[k as keyof Stats]) &&
                  r[k as keyof Stats] >= 0,
              ),
          )
          // Results without a policy predate ALO-181. Keep their original counts
          // and label the old rule; do not reinterpret uncertainty retries as presses.
          .map((r: SavedResult) => ({
            ...r,
            gradingPolicy: r.gradingPolicy ?? 'verified-only',
            fingeringModes:
              Array.isArray(r.fingeringModes) &&
              r.fingeringModes.length &&
              r.fingeringModes.every(isFingeringMode)
                ? [...new Set(r.fingeringModes)]
                : ['standard'],
          }))
          .slice(-10)
      : [];
    const customProfiles: KeyboardProfile[] = [];
    for (const p of Array.isArray(parsed.customProfiles)
      ? parsed.customProfiles.slice(0, 21)
      : []) {
      try {
        const valid = parseProfile(JSON.stringify(p));
        if (
          !PRESETS.some((x) => x.id === valid.id) &&
          !customProfiles.some((x) => x.id === valid.id)
        )
          customProfiles.push(valid);
      } catch {
        /* retain valid profiles */
      }
    }
    const profiles = [...PRESETS, ...customProfiles];
    let profileId = profiles.some((p) => p.id === parsed.profileId)
      ? parsed.profileId
      : raw
        ? 'apple-gb-iso'
        : 'us-ansi';
    const calibrations: Record<string, Calibration> = Object.create(null);
    for (const [id, c] of Object.entries(parsed.calibrations ?? {}).slice(0, 28))
      if (validCalibration(c)) calibrations[id] = c;
    let legacyCalibration = parsed.legacyCalibration;
    let migrationNotice =
      typeof parsed.migrationNotice === 'string' ? parsed.migrationNotice.slice(0, 300) : undefined;
    if (!parsed.profileId && raw) {
      legacyCalibration = parsed.calibration;
      migrationNotice =
        'Existing setup kept as Apple British ISO. Original calibration retained locally.';
      if (validCalibration(parsed.calibration)) {
        const c = structuredClone(parsed.calibration) as Calibration;
        c.points = Object.fromEntries(
          Object.entries(c.points).map(([k, v]) => [LEGACY_CODES[k] ?? k, v]),
        );
        c.profile = structuredClone(LEGACY_APPLE_BRITISH);
        if (validCalibration(c)) calibrations['apple-gb-iso'] = c;
        else migrationNotice += ' Remap positions before practice.';
      } else if (parsed.calibration) migrationNotice += ' Remap positions before practice.';
    }
    // Preserve calibrated geometry as a separate selectable setup. Never rewrite
    // camera points or the original snapshot to match a revised built-in preset.
    const old =
      parsed.profileId === 'apple-gb-iso' && validCalibration(parsed.calibration)
        ? (parsed.calibration as Calibration)
        : calibrations['apple-gb-iso'];
    if (old?.profile && geometrySignature(old.profile) !== geometrySignature(PRESETS[2]!)) {
      const snapshot = old.profile;
      let retained = customProfiles.find(
        (p) =>
          p.id.startsWith('saved-apple-gb-iso') &&
          geometrySignature(p) === geometrySignature(snapshot),
      );
      if (!retained) {
        let id = 'saved-apple-gb-iso';
        for (let suffix = 2; profiles.some((p) => p.id === id); suffix++)
          id = `saved-apple-gb-iso-${suffix}`;
        retained = { ...structuredClone(snapshot), id, name: 'MacBook British — saved geometry' };
        customProfiles.push(retained);
      }
      calibrations[retained.id] ??= structuredClone(old);
      delete calibrations['apple-gb-iso'];
      if (profileId === 'apple-gb-iso') {
        profileId = retained.id;
        migrationNotice =
          'Your saved MacBook geometry and camera map are kept. Choose MacBook British QWERTY — ISO and remap to use the corrected spacebar.';
      }
    }
    return {
      profileId,
      customProfiles,
      calibrations,
      legacyCalibration,
      migrationNotice,
      fingeringMode: isFingeringMode(parsed.fingeringMode) ? parsed.fingeringMode : 'standard',
      calibration:
        parsed.profileId && validCalibration(parsed.calibration)
          ? parsed.calibration
          : calibrations[profileId],
      results,
      ...(typeof parsed.cameraDeviceId === 'string'
        ? { cameraDeviceId: parsed.cameraDeviceId }
        : {}),
      ...(typeof parsed.cameraDisconnected === 'boolean'
        ? { cameraDisconnected: parsed.cameraDisconnected }
        : {}),
      ...(typeof parsed.practiceEnabled === 'boolean'
        ? { practiceEnabled: parsed.practiceEnabled }
        : {}),
      ...(isCameraRotation(parsed.cameraRotation) ? { cameraRotation: parsed.cameraRotation } : {}),
    };
  } catch {
    return { results: [] };
  }
}
export function save(data: Saved, storage: Pick<Storage, 'setItem'> = localStorage): boolean {
  try {
    storage.setItem(
      KEY,
      JSON.stringify({
        calibration: data.calibration,
        profileId: data.profileId,
        customProfiles: data.customProfiles,
        calibrations: data.calibrations,
        legacyCalibration: data.legacyCalibration,
        migrationNotice: data.migrationNotice,
        fingeringMode: data.fingeringMode,
        cameraRotation: data.cameraRotation,
        cameraDeviceId: data.cameraDeviceId,
        practiceEnabled: data.practiceEnabled,
        cameraDisconnected: data.cameraDisconnected,
        results: data.results.slice(-10),
      }),
    );
    return true;
  } catch {
    return false;
  }
}
export function reset(storage: Pick<Storage, 'removeItem'> = localStorage): boolean {
  try {
    storage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
