import { type KeyboardProfile, profileFingers } from '../core/profile';
import { type FingeringMode } from '../core/keyboard';
import type { Observation, Finger } from '../core/types';

export const WINDOW = 32;
export const ORDER = [...'enarit', ' ', ...'osldhcumfpgwybvkxjqz', ',', '.'];
export const CORPUS_ID = 'english-curated-v1';
export type Prompted = { correct: boolean; word: string; round: number };
export type Timing = { ms: number; word: string; round: number };
export type FingerOutcome = 'pending' | 'unknown' | 'compliant' | 'same-hand' | 'wrong-hand';
export type TargetProgress = {
  character: string;
  code: string;
  total: number;
  correct: number;
  excludedTimings: number;
  recent: Prompted[];
  timings: Timing[];
};
export type ActualProgress = {
  total: number;
  observed: number;
  compliant: number;
  handCompliant: number;
  unknown: number;
  recent: { outcome: FingerOutcome }[];
};
export type Slot = { word: string; mark: '' | ',' | '.'; target: string };
export type Round = {
  sequence: number;
  focus: string;
  slots: Slot[];
  introduced?: string;
  diagnostic?: string;
};
export type Course = {
  included: number;
  qualified: string[];
  seed: number;
  sequence: number;
  reviewQueue: string[];
  usage: Record<string, number>;
  lastWords: string[];
  round?: Round;
};
export type Cohort = {
  signature: string;
  targets: Record<string, TargetProgress>;
  actual: Record<string, ActualProgress>;
  total: number;
  correct: number;
  corrections: number;
  course: Course;
};
export type ProgressData = { version: 1; corpus: typeof CORPUS_ID; cohorts: Cohort[] };
export const emptyData = (): ProgressData => ({ version: 1, corpus: CORPUS_ID, cohorts: [] });
export function signature(profile: KeyboardProfile, mode: FingeringMode) {
  // Names, ids, camera coordinates and calibration dates are deliberately absent.
  return JSON.stringify({
    language: 'en',
    curriculum: CORPUS_ID,
    metrics: 1,
    attribution: 'nearest-capture-frame-v1',
    grading: 'wrong-finger-veto',
    geometry: profile.geometry,
    keys: [...profile.keys]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((k) => ({
        code: k.code,
        x: k.x,
        y: k.y,
        width: k.width,
        height: k.height,
        outputs: [...k.outputs].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        fingers: [...profileFingers(profile, k.code, mode)].sort(),
      })),
  });
}
export function getCohort(data: ProgressData, identity: string, seed: number): Cohort {
  let cohort = data.cohorts.find((c) => c.signature === identity);
  if (!cohort) {
    cohort = {
      signature: identity,
      targets: {},
      actual: {},
      total: 0,
      correct: 0,
      corrections: 0,
      course: {
        included: 7,
        qualified: [],
        seed: seed >>> 0 || 1,
        sequence: 0,
        reviewQueue: ORDER.slice(0, 7),
        usage: {},
        lastWords: [],
      },
    };
    data.cohorts.push(cohort);
  }
  return cohort;
}
export const targetId = (character: string, code: string) => JSON.stringify([character, code]);
const recent = <T>(items: T[], item: T) => {
  items.push(item);
  if (items.length > WINDOW) items.shift();
};
export function median(values: number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
export type InputSnapshot = {
  code: string;
  expected?: { character: string; code: string };
  correct: boolean;
  correctPrefix: boolean;
  allowed: Finger[];
  word: string;
  round: number;
  at: number;
};
export type PendingPress = {
  cohort: Cohort;
  actual: ActualProgress;
  outcome: { outcome: FingerOutcome };
  allowed: Finger[];
  closed: boolean;
};
export class Progress {
  private pending = new Set<PendingPress>();
  private previous?: { at: number; correctPrefix: boolean };
  constructor(
    public cohort: Cohort,
    private changed: () => void = () => {},
  ) {}
  accept(input: InputSnapshot): PendingPress {
    const c = this.cohort;
    c.total++;
    if (input.correct) c.correct++;
    let target: TargetProgress | undefined;
    if (input.expected) {
      const id = targetId(input.expected.character, input.expected.code);
      target = c.targets[id] ??= {
        ...input.expected,
        total: 0,
        correct: 0,
        excludedTimings: 0,
        recent: [],
        timings: [],
      };
      target.total++;
      if (input.correct) target.correct++;
      recent(target.recent, { correct: input.correct, word: input.word, round: input.round });
    }
    if (target && input.correct && input.correctPrefix && this.previous?.correctPrefix) {
      const ms = input.at - this.previous.at;
      if (ms > 0 && ms <= 5000)
        recent(target.timings, { ms, word: input.word, round: input.round });
      else target.excludedTimings++;
    }
    this.previous = { at: input.at, correctPrefix: input.correct && input.correctPrefix };
    const actual = (c.actual[input.code] ??= {
      total: 0,
      observed: 0,
      compliant: 0,
      handCompliant: 0,
      unknown: 0,
      recent: [],
    });
    actual.total++;
    const outcome = { outcome: 'pending' as FingerOutcome };
    recent(actual.recent, outcome);
    const handle = { cohort: c, actual, outcome, allowed: [...input.allowed], closed: false };
    this.pending.add(handle);
    this.changed();
    return handle;
  }
  observe(handle: PendingPress, observation: Observation) {
    if (handle.closed || !this.pending.has(handle)) return false;
    handle.closed = true;
    this.pending.delete(handle);
    const a = handle.actual;
    if (observation.kind === 'finger') {
      const compliant = handle.allowed.includes(observation.finger);
      const hand = handle.allowed.some((f) => f.split('-')[0] === observation.finger.split('-')[0]);
      a.observed++;
      if (compliant) a.compliant++;
      if (hand) a.handCompliant++;
      handle.outcome.outcome = compliant ? 'compliant' : hand ? 'same-hand' : 'wrong-hand';
    } else {
      a.unknown++;
      handle.outcome.outcome = 'unknown';
    }
    this.changed();
    return true;
  }
  correction() {
    this.cohort.corrections++;
    this.breakTiming();
    this.changed();
  }
  breakTiming() {
    this.previous = undefined;
  }
  abandon() {
    for (const handle of this.pending)
      this.observe(handle, { kind: 'uncertain', reason: 'Attempt abandoned' });
    this.breakTiming();
  }
}
