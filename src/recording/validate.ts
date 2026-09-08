import { validCalibration } from '../core/calibration';
import { allowedFingers, isFingeringMode, DIGITS } from '../core/keyboard';
import type { Sample } from './types';
import { profileFingers } from '../core/profile';
import type { Press } from '../core/types';
export function validateSample(sample: Sample): void {
  const { manifest: m, calibration: c, frames, events, labels } = sample;
  const require = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  require(m.schemaVersion === 1 || m.schemaVersion === 2, 'Unsupported sample schema');
  require(m.schemaVersion === 2
    ? !!c.profile
    : !c.profile, 'Profile snapshot does not match sample schema');
  require(isFingeringMode(m.mode), 'Invalid fingering mode');
  require(validCalibration(c), 'Invalid calibration');
  require(c.deviceId === 'sample-camera', 'Sample must not contain a browser device identifier');
  require(m.camera.width === c.width &&
    m.camera.height === c.height &&
    m.camera.coordinates === 'native-normalized', 'Camera/calibration geometry mismatch');
  require(m.words.length > 0 && m.words.every((w) => /^[a-z,.]+$/.test(w)), 'Invalid passage');
  require(Number.isFinite(m.durationMs) && m.durationMs >= 0, 'Invalid duration');
  if (c.profile) {
    require(Object.keys(m.expectedFingers).length ===
      c.profile.keys.length, 'Incomplete physical-code finger map');
    for (const key of c.profile.keys)
      require(JSON.stringify(m.expectedFingers[key.code]) ===
        JSON.stringify(
          profileFingers(c.profile, key.code, m.mode),
        ), `Finger map mismatch: ${key.code}`);
  } else {
    for (const [key, fingers] of Object.entries(m.expectedFingers))
      require(JSON.stringify(fingers) ===
        JSON.stringify(allowedFingers(key, m.mode)), `Finger map mismatch: ${key}`);
  }
  const validatePress = (press: Press) => {
    if (!c.profile) {
      require(press.code === undefined &&
        press.allowedFingers === undefined, 'Legacy sample contains profile-aware press fields');
      return;
    }
    const physical = c.profile.keys.find((key) => key.code === press.code);
    require(physical &&
      physical.outputs.some(
        (output) => output.text === press.key,
      ), 'Press code/output missing or inconsistent with profile');
    require(Array.isArray(press.allowedFingers) &&
      press.allowedFingers.length > 0 &&
      JSON.stringify(press.allowedFingers) ===
        JSON.stringify(
          m.expectedFingers[press.code!],
        ), 'Press allowed-finger snapshot missing or inconsistent with profile');
  };
  const frameIds = new Set<number>();
  for (const frame of frames) {
    require(!frameIds.has(frame.id), `Duplicate input frame ${frame.id}`);
    frameIds.add(frame.id);
    require(Number.isFinite(frame.at) &&
      Number.isFinite(frame.dispatchedAt) &&
      Number.isFinite(frame.mediaTime), `Invalid frame timing: ${frame.id}`);
    require(frame.file === `inputs/${frame.id}.png` &&
      (m.files[frame.file]?.bytes ?? 0) > 0 &&
      !frame.error, `Missing input pixels: ${frame.id}`);
    require(frame.at <= frame.dispatchedAt + 5, `Capture after dispatch: ${frame.id}`);
  }
  require(frames.length > 0, 'No camera input frames recorded; try a longer sample');
  require((m.files['camera.webm']?.bytes ?? 0) > 0, 'Missing viewing video');
  const presses = new Map<string, Press>();
  let lastAt = -Infinity;
  let seq = 0;
  for (const event of events) {
    require(event.seq === ++seq &&
      Number.isFinite(event.at) &&
      event.at >= lastAt &&
      event.at <= m.durationMs + 5, 'Invalid event sequence/timeline');
    lastAt = event.at;
    if (event.type === 'evidence') {
      const e = event.event;
      if (e.type === 'request') {
        const id = `${e.press.attemptId}/${e.press.id}`;
        require(!presses.has(id) &&
          Number.isFinite(e.press.at) &&
          /^[a-z,. ]$/.test(e.press.key), `Invalid/duplicate press ${id}`);
        validatePress(e.press);
        presses.set(id, e.press);
      }
      if (e.type === 'frame-result')
        require(Number.isFinite(e.frame.at) &&
          Number.isFinite(e.frame.receivedAt) &&
          e.frame.receivedAt >= e.frame.at - 5, 'Invalid landmark timing');
    }
    if (event.type === 'observation') {
      require(presses.has(
        `${event.attemptId}/${event.pressId}`,
      ), 'Observation references missing press');
      if (event.observation.kind === 'finger')
        require(event.observation.frameIds.every((id) =>
          events.some(
            (e) =>
              e.seq < event.seq &&
              e.type === 'evidence' &&
              e.event.type === 'frame-result' &&
              e.event.frame.id === id,
          ),
        ), 'Observation references missing/future frame');
    }
    if (event.type === 'verdict') {
      require(event.attempt.mode === m.mode, 'Attempt fingering mode differs from sample');
      for (const press of event.attempt.presses) {
        validatePress(press);
        const original = presses.get(`${press.attemptId}/${press.id}`);
        require(original &&
          original.key === press.key &&
          original.code === press.code &&
          original.at === press.at &&
          JSON.stringify(original.allowedFingers) ===
            JSON.stringify(press.allowedFingers), 'Verdict press differs from recorded request');
      }
    }
  }
  const labelled = new Set<string>();
  for (const label of labels) {
    const id = `${label.attemptId}/${label.pressId}`;
    require(presses.has(id) && !labelled.has(id), `Invalid/duplicate label ${id}`);
    labelled.add(id);
    require(['unreviewed', 'confirmed', 'unlabelable'].includes(
      label.status,
    ), 'Invalid label status');
    require(label.status === 'confirmed'
      ? /^(left|right)-/.test(label.finger ?? '') &&
          DIGITS.some((d) => label.finger === `left-${d}` || label.finger === `right-${d}`) &&
          label.source.trim().length > 0
      : label.finger ===
          null, 'Confirmed labels need an actual finger and independent source; other labels use null');
  }
  require(labelled.size ===
    presses.size, 'Missing press labels (use unreviewed where not yet labelled)');
}
