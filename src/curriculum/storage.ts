import { CORPUS_ID, ORDER, WINDOW, emptyData, type ProgressData } from './progress';
import { WORDS_BY_ID } from './selection';

export const PROGRESS_KEY = 'right-typer.progress.v1';
export const MAX_BYTES = 1024 * 1024;
const count = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0;
const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const assert = (valid: unknown): void => {
  if (!valid) throw Error('Invalid progress data');
};
const word = (id: unknown) => typeof id === 'string' && WORDS_BY_ID.has(id);
const keys = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((k) => ORDER.includes(k)) &&
  new Set(value).size === value.length;
const code = (value: unknown) =>
  typeof value === 'string' &&
  /^(Key[A-Z]|Digit[0-9]|Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Comma|Equal|Enter)|Space|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|IntlBackslash|IntlRo|IntlYen)$/.test(
    value,
  );
// Validate the entire bounded store before using any persisted values. Never repair
// an unknown schema by overwriting it with an empty history.
export function parseProgress(raw: string): ProgressData {
  assert(new TextEncoder().encode(raw).length <= MAX_BYTES);
  const data = JSON.parse(raw) as Omit<ProgressData, 'version'> & { version: number };
  assert(
    data &&
      (data.version === 1 || data.version === 2) &&
      data.corpus === CORPUS_ID &&
      Array.isArray(data.cohorts) &&
      data.cohorts.length <= 16,
  );
  const legacy = data.version === 1;
  if (legacy) data.activity = { days: [], clockAnomalies: 0, undatedMs: 0 };
  assert(
    record(data.activity) &&
      count(data.activity.clockAnomalies) &&
      Number.isFinite(data.activity.undatedMs) &&
      data.activity.undatedMs >= 0 &&
      data.activity.undatedMs <= Number.MAX_SAFE_INTEGER &&
      Array.isArray(data.activity.days) &&
      data.activity.days.length <= 90,
  );
  const dates = new Set<string>();
  for (const day of data.activity.days) {
    assert(record(day) && /^\d{4}-\d{2}-\d{2}$/.test(day.date) && !dates.has(day.date));
    const time = Date.parse(day.date + 'T12:00:00Z');
    assert(
      Number.isFinite(time) &&
        new Date(time).toISOString().slice(0, 10) === day.date &&
        Number.isFinite(day.ms) &&
        day.ms >= 0 &&
        day.ms <= Number.MAX_SAFE_INTEGER,
    );
    dates.add(day.date);
  }
  const signatures = new Set<string>();
  for (const c of data.cohorts) {
    assert(
      record(c) &&
        typeof c.signature === 'string' &&
        c.signature.length <= 50000 &&
        !signatures.has(c.signature),
    );
    signatures.add(c.signature);
    assert([c.total, c.correct, c.corrections].every(count) && c.correct <= c.total);
    assert(
      record(c.targets) &&
        Object.keys(c.targets).length <= 2900 &&
        record(c.actual) &&
        Object.keys(c.actual).length <= 100,
    );
    for (const [id, t] of Object.entries(c.targets)) {
      assert(
        record(t) &&
          ORDER.includes(t.character) &&
          code(t.code) &&
          id === JSON.stringify([t.character, t.code]),
      );
      assert([t.total, t.correct, t.excludedTimings].every(count) && t.correct <= t.total);
      assert(Array.isArray(t.recent) && t.recent.length <= WINDOW && t.recent.length <= t.total);
      assert(
        Array.isArray(t.timings) && t.timings.length <= WINDOW && t.timings.length <= t.correct,
      );
      for (const item of t.recent)
        assert(
          record(item) && typeof item.correct === 'boolean' && word(item.word) && count(item.round),
        );
      for (const item of t.timings)
        assert(
          record(item) &&
            Number.isFinite(item.ms) &&
            item.ms > 0 &&
            item.ms <= 5000 &&
            word(item.word) &&
            count(item.round),
        );
    }
    for (const [physical, a] of Object.entries(c.actual)) {
      assert(
        code(physical) &&
          record(a) &&
          [a.total, a.observed, a.compliant, a.handCompliant, a.unknown].every(count),
      );
      assert(
        a.compliant <= a.handCompliant &&
          a.handCompliant <= a.observed &&
          a.observed + a.unknown <= a.total,
      );
      assert(Array.isArray(a.recent) && a.recent.length <= WINDOW && a.recent.length <= a.total);
      for (const item of a.recent)
        assert(
          record(item) &&
            ['pending', 'unknown', 'compliant', 'same-hand', 'wrong-hand'].includes(item.outcome),
        );
      // An interrupted session has no future camera evidence. Counts include even
      // pending presses that already fell outside the last-32 display window.
      a.unknown += a.total - a.observed - a.unknown;
      for (const item of a.recent) if (item.outcome === 'pending') item.outcome = 'unknown';
    }
    assert(Object.values(c.actual).reduce((n, a) => n + a.total, 0) === c.total);
    assert(Object.values(c.targets).reduce((n, t) => n + t.total, 0) <= c.total);
    assert(Object.values(c.targets).reduce((n, t) => n + t.correct, 0) <= c.correct);
    if (legacy) {
      c.activeMs = 0;
      c.excludedActivity = 0;
      c.space = { left: 0, right: 0, other: 0, unclassified: c.actual.Space?.observed ?? 0 };
    }
    assert(
      Number.isFinite(c.activeMs) &&
        c.activeMs >= 0 &&
        c.activeMs <= Number.MAX_SAFE_INTEGER &&
        count(c.excludedActivity),
    );
    assert(
      record(c.space) &&
        [c.space.left, c.space.right, c.space.other, c.space.unclassified].every(count),
    );
    assert(
      c.space.left + c.space.right + c.space.other + c.space.unclassified ===
        (c.actual.Space?.observed ?? 0),
    );
    const course = c.course;
    assert(
      record(course) &&
        count(course.included) &&
        course.included >= 7 &&
        course.included <= ORDER.length,
    );
    const included = ORDER.slice(0, course.included);
    assert(keys(course.qualified) && course.qualified.every((k) => included.includes(k)));
    assert(
      keys(course.reviewQueue) &&
        course.reviewQueue.length === included.length &&
        course.reviewQueue.every((k) => included.includes(k)),
    );
    assert(
      count(course.seed) &&
        course.seed > 0 &&
        course.seed <= 0xffffffff &&
        count(course.sequence) &&
        course.sequence <= 1e12,
    );
    assert(
      record(course.usage) &&
        Object.entries(course.usage).every(
          ([id, n]) => word(id) && count(n) && n <= course.sequence * 12 + 11,
        ),
    );
    assert(
      Array.isArray(course.lastWords) &&
        course.lastWords.length <= 2 &&
        course.lastWords.every(word),
    );
    if (course.round) {
      const round = course.round;
      assert(record(round) && round.sequence === course.sequence && included.includes(round.focus));
      assert(round.introduced === undefined || included.includes(round.introduced));
      assert(
        round.diagnostic === undefined ||
          (typeof round.diagnostic === 'string' && round.diagnostic.length <= 300),
      );
      assert(Array.isArray(round.slots) && round.slots.length === 12);
      for (const slot of round.slots)
        assert(
          record(slot) &&
            word(slot.word) &&
            ['', ',', '.'].includes(slot.mark) &&
            included.includes(slot.target) &&
            [...((WORDS_BY_ID.get(slot.word) ?? '') + slot.mark)].every((k) =>
              included.includes(k),
            ),
        );
    }
  }
  data.version = 2;
  return data as ProgressData;
}
export class ProgressStore {
  data = emptyData();
  notice = 'Starting local progress saving…';
  private writable = false;
  private owned = false;
  private unreadable = false;
  private timer?: ReturnType<typeof setTimeout>;
  private original: string | null = null;
  constructor(private changed: () => void = () => {}) {
    try {
      this.original = localStorage.getItem(PROGRESS_KEY);
      if (this.original) this.data = parseProgress(this.original);
    } catch {
      this.notice =
        'Saved progress could not be read. Practice continues in memory; existing data is preserved. Export or reset progress in Practice & history to start a new saved history.';
      this.unreadable = true;
    }
    if (!navigator.locks) {
      this.notice =
        'This browser cannot safely save progress across tabs. Practice continues in memory.';
      return;
    }
    void navigator.locks
      .request(PROGRESS_KEY, { ifAvailable: true }, async (lock) => {
        if (!lock || (!this.unreadable && localStorage.getItem(PROGRESS_KEY) !== this.original)) {
          this.notice =
            'Another tab owns saved progress. This tab practises in memory; close the other tab and reload to resume saving.';
          this.changed();
          return;
        }
        this.owned = true;
        this.writable = !this.unreadable;
        if (!this.unreadable) this.notice = '';
        this.flush();
        this.changed();
        await new Promise<void>(() => {});
      })
      .catch(() => {
        this.writable = false;
        this.notice = 'Progress saving is unavailable. Practice continues in memory.';
        this.changed();
      });
  }
  schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, 500);
  }
  flush() {
    if (!this.writable) return;
    try {
      const raw = JSON.stringify(this.data);
      if (
        this.data.cohorts.length > 16 ||
        this.data.activity.days.length > 90 ||
        new TextEncoder().encode(raw).length > MAX_BYTES
      ) {
        this.notice =
          'Local progress is full. This session continues in memory; your saved history is preserved. Export or reset progress in Practice & history.';
        this.writable = false;
        this.changed();
        return;
      }
      // Validate counters as well as byte/collection caps before replacing the last good store.
      parseProgress(raw);
      localStorage.setItem(PROGRESS_KEY, raw);
    } catch {
      this.notice =
        'Progress could not be saved. Practice continues in memory; check browser storage before reloading.';
      this.writable = false;
      this.changed();
    }
  }
  reset() {
    this.data = emptyData();
    if (!this.owned) return false;
    try {
      localStorage.removeItem(PROGRESS_KEY);
      this.writable = true;
      this.unreadable = false;
      this.notice = '';
      return true;
    } catch {
      return false;
    }
  }
}
