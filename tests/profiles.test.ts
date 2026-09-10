import { describe, it, expect } from 'vitest';
import {
  PRESETS,
  parseProfile,
  coverage,
  resolveEvent,
  profileFingers,
  geometrySignature,
  calibrationCodes,
  suggestProfiles,
  type KeyEvent,
} from '../src/core/profile';
import { load, save } from '../src/core/storage';
import { calibration, frame } from './fixtures';
import { grade } from '../src/core/exercise';
import { validCalibration, keyDistance } from '../src/core/calibration';
import { attribute } from '../src/core/observation';
const event = (code: string, key: string, shiftKey = false, altGr = false): KeyEvent => ({
  code,
  key,
  shiftKey,
  altKey: altGr,
  ctrlKey: altGr,
  metaKey: false,
  isComposing: false,
  getModifierState: () => altGr,
});
describe('keyboard profiles', () => {
  it.each(PRESETS)(
    '$name is valid and covers the unchanged passage with physical mappings',
    (p) => {
      expect(parseProfile(JSON.stringify(p))).toEqual(p);
      expect(coverage(p)).toEqual([]);
      for (const key of p.keys)
        for (const o of key.outputs)
          expect(resolveEvent(p, event(key.code, o.text, o.shift, o.altGr))).toEqual({
            code: key.code,
          });
    },
  );
  it('shows dedicated regional letters without invalidating existing passage calibration', () => {
    for (const [index, letters] of [
      [3, 'äöüß'],
      [4, 'éèçàù'],
    ] as const) {
      const profile = PRESETS[index]!;
      for (const letter of letters)
        expect(profile.keys.some((k) => k.outputs.some((o) => o.text === letter))).toBe(true);
      const previous = structuredClone(profile);
      previous.keys = previous.keys.filter(
        (k) =>
          !['BracketLeft', 'Quote', 'Minus', 'Digit2', 'Digit7', 'Digit9', 'Digit0'].includes(
            k.code,
          ),
      );
      expect(geometrySignature(profile)).toBe(geometrySignature(previous));
      expect(calibrationCodes(profile)).toEqual(calibrationCodes(previous));
    }
  });
  it('grades German Y and French M and shifted period by position rather than QWERTY text', () => {
    for (const [index, code, text, finger] of [
      [3, 'KeyZ', 'y', 'left-little'],
      [4, 'Semicolon', 'm', 'right-little'],
      [4, 'Comma', '.', 'right-middle'],
    ] as const) {
      const p = PRESETS[index]!;
      const allowed = profileFingers(p, code, 'standard');
      expect(allowed).toEqual([finger]);
      const attempt = {
        id: 1,
        wordIndex: 0,
        text,
        presses: [
          {
            id: 1,
            attemptId: 1,
            key: text,
            code,
            at: 0,
            allowedFingers: allowed,
            observation: {
              kind: 'finger' as const,
              finger,
              frameIds: [1],
              distance: 0,
              offsetMs: 0,
            },
          },
        ],
      };
      expect(grade(attempt, text).pass).toBe(true);
    }
    expect(resolveEvent(PRESETS[4]!, event('Comma', '.', true))).toEqual({ code: 'Comma' });
    expect(resolveEvent(PRESETS[4]!, event('Period', '.'))).toHaveProperty('error');
  });
  it('supports AltGr direct mappings but rejects dead/composition and shortcuts', () => {
    const p = structuredClone(PRESETS[0]!);
    p.keys[0]!.outputs = [{ text: 'q', shift: false, altGr: true }];
    expect(resolveEvent(p, event('KeyQ', 'q', false, true))).toEqual({ code: 'KeyQ' });
    expect(resolveEvent(p, { ...event('KeyQ', 'q'), isComposing: true })).toHaveProperty('error');
    expect(resolveEvent(p, event('KeyQ', 'Dead'))).toHaveProperty('error');
    expect(resolveEvent(p, { ...event('KeyQ', 'q'), metaKey: true })).toHaveProperty('error');
  });
  it('migrates British calibration without losing original or camera preferences', () => {
    let raw: string | null = null;
    const storage = {
      getItem: () => raw,
      setItem: (_: string, v: string) => {
        raw = v;
      },
    };
    expect(load(storage).profileId).toBe('us-ansi');
    raw = JSON.stringify({
      calibration: calibration(),
      cameraRotation: 90,
      cameraDisconnected: true,
      cameraDeviceId: 'keep',
      practiceEnabled: true,
    });
    const s = load(storage);
    expect(s.profileId).toBe('apple-gb-iso');
    expect(s.legacyCalibration).toEqual(calibration());
    expect(s.calibration?.points.KeyQ).toEqual(calibration().points.q);
    expect(s).toMatchObject({
      cameraRotation: 90,
      cameraDisconnected: true,
      cameraDeviceId: 'keep',
      practiceEnabled: true,
    });
    expect(validCalibration(s.calibration)).toBe(true);
    save(s, storage);
    expect(load(storage)).toEqual(s);
    const observed = attribute(
      { key: 'q', code: 'KeyQ', at: 100 },
      [frame(1, 100, 'q', 'left-little')],
      s.calibration!,
    );
    expect(observed).toMatchObject({ kind: 'finger', finger: 'left-little' });
  });
  it('rejects unknown physical codes and reports missing passage mappings', () => {
    const p = structuredClone(PRESETS[0]!);
    p.keys[0]!.outputs = [];
    expect(coverage(p)).toEqual(['q']);
    p.keys[0]!.code = 'InventedKey';
    expect(() => parseProfile(JSON.stringify(p))).toThrow('browser character-key code');
  });
  it('retains unusable legacy maps and explains remapping', () => {
    const broken = { ...calibration(), points: { q: { x: 0, y: 0 } } };
    const s = load({ getItem: () => JSON.stringify({ calibration: broken }) });
    expect(s.legacyCalibration).toEqual(broken);
    expect(s.calibration).toBeUndefined();
  });
  it('does not conflate hardware geometry, required positions or profile text', () => {
    expect(geometrySignature(PRESETS[1]!)).not.toBe(geometrySignature(PRESETS[2]!));
    expect(geometrySignature(PRESETS[0]!)).not.toBe(geometrySignature(PRESETS[1]!));
    expect(geometrySignature(PRESETS[3]!)).not.toBe(geometrySignature(PRESETS[4]!));
  });
  it('detects suggestions, QWERTY ambiguity and incomplete maps', () => {
    const map = (i: number) =>
      new Map(
        PRESETS[i]!.keys.map((k) => [
          k.code,
          k.outputs.find((o) => !o.shift && !o.altGr)?.text ?? '',
        ]),
      );
    expect(suggestProfiles(map(4)).map((p) => p.id)).toEqual(['fr-iso']);
    expect(suggestProfiles(map(0))).toHaveLength(4);
    expect(suggestProfiles(new Map())).toEqual([]);
  });
  it('rejects oversized, duplicate-key, malformed, missing-finger profiles', () => {
    expect(() => parseProfile(' '.repeat(100001))).toThrow();
    for (const mutate of [
      (p: (typeof PRESETS)[number]) => {
        p.keys.push(p.keys[0]!);
      },
      (p: (typeof PRESETS)[number]) => {
        p.keys[0]!.standard = [];
      },
      (p: (typeof PRESETS)[number]) => {
        p.version = 2 as 1;
      },
      (p: (typeof PRESETS)[number]) => {
        p.keys[0]!.x = Infinity;
      },
    ]) {
      const p = structuredClone(PRESETS[0]!);
      mutate(p);
      expect(() => parseProfile(JSON.stringify(p))).toThrow();
    }
  });
  it('supports split geometry and explicit custom finger assignments without letter guesses', () => {
    const p = structuredClone(PRESETS[0]!);
    p.id = 'split';
    p.geometry = 'split';
    for (const k of p.keys) if (k.x > 4) k.x += 2;
    const c = {
      ...calibration(),
      profile: p,
      points: Object.fromEntries(
        p.keys.map((k) => [k.code, { x: 0.05 + (k.x + 0.5) * 0.06, y: 0.1 + (k.y + 0.5) * 0.18 }]),
      ),
    };
    c.points['space-left'] = { x: 0.2, y: 0.85 };
    c.points['space-right'] = { x: 0.7, y: 0.85 };
    expect(validCalibration(c)).toBe(true);
    expect(keyDistance(c, 'KeyY', c.points.KeyY!)).toBe(0);
    expect(calibrationCodes(p)).toContain('KeyY');
    p.keys.find((k) => k.code === 'KeyY')!.alternate = ['left-ring'];
    expect(profileFingers(p, 'KeyY', 'alternate')).toEqual(['left-ring']);
  });
});
