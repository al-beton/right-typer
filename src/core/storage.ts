import { validCalibration } from './calibration';
import type { Calibration } from './types';
import type { Stats } from './exercise';
const KEY = 'right-typer.v1';
export type SavedResult = Stats & {
  date: string;
  gradingPolicy: 'verified-only' | 'wrong-finger-veto';
};
export type Saved = { calibration?: Calibration; results: SavedResult[] };
export function load(storage: Pick<Storage, 'getItem'> = localStorage): Saved {
  try {
    const parsed = JSON.parse(storage.getItem(KEY) ?? '{}');
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
          .map((r: SavedResult) => ({ ...r, gradingPolicy: r.gradingPolicy ?? 'verified-only' }))
          .slice(-10)
      : [];
    return {
      calibration: validCalibration(parsed.calibration) ? parsed.calibration : undefined,
      results,
    };
  } catch {
    return { results: [] };
  }
}
export function save(data: Saved, storage: Pick<Storage, 'setItem'> = localStorage): boolean {
  try {
    storage.setItem(
      KEY,
      JSON.stringify({ calibration: data.calibration, results: data.results.slice(-10) }),
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
