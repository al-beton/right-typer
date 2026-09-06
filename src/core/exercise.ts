import type { Observation, Press } from './types';
import { intended, isCorrectFinger, keyName } from './keyboard';
export type Attempt = {
  id: number;
  wordIndex: number;
  text: string;
  presses: Press[];
  submittedAt?: number;
};
export type Verdict = { pass: boolean; textWrong: boolean; wrong: Press[]; uncertain: Press[] };
export type Stats = {
  attempts: number;
  passedWords: number;
  textMistakes: number;
  wrongFingers: number;
  uncertainPresses: number;
  retries: number;
  elapsedMs: number;
  wpm: number;
};
export function grade(attempt: Attempt, word: string): Verdict {
  const wrong = attempt.presses.filter(
    (p) => p.observation?.kind === 'finger' && !isCorrectFinger(p.key, p.observation.finger),
  );
  const uncertain = attempt.presses.filter(
    (p) => !p.observation || p.observation.kind === 'uncertain',
  );
  const textWrong = attempt.text !== word;
  return { pass: !textWrong && !wrong.length, textWrong, wrong, uncertain };
}
export function feedback(verdict: Verdict, word: string): string {
  const parts: string[] = [];
  if (verdict.pass) parts.push('Word accepted.');
  if (verdict.textWrong) parts.push(`The text did not match “${word}”.`);
  if (verdict.wrong.length) {
    const p = verdict.wrong[0]!;
    const actual = p.observation?.kind === 'finger' ? p.observation.finger.replace('-', ' ') : '';
    parts.push(`For ${keyName(p.key)}, I saw ${actual}. Use ${intended(p.key)}.`);
  }
  if (verdict.uncertain.length)
    parts.push(
      `I could not verify ${verdict.uncertain.length} ${verdict.uncertain.length === 1 ? 'press' : 'presses'}. This is a camera uncertainty, not a finger mistake.`,
    );
  return parts.join(' ');
}
export class Exercise {
  index = 0;
  private nextPressId = 1;
  private nextAttemptId = 1;
  attempt: Attempt = { id: 1, wordIndex: 0, text: '', presses: [] };
  history: { attempt: Attempt; verdict: Verdict }[] = [];
  state: 'typing' | 'checking' | 'retry' | 'complete' | 'paused' = 'typing';
  startedAt?: number;
  endedAt?: number;
  lastVerdict?: Verdict;
  constructor(public readonly words: string[]) {}
  press(key: string, at: number): Press | null {
    if (this.state !== 'typing' || !/^[a-z,. ]$/.test(key)) return null;
    if (key === ' ' && !this.attempt.text.length && !this.attempt.presses.length) return null;
    if (this.startedAt === undefined) this.startedAt = at;
    const press = { id: this.nextPressId++, attemptId: this.attempt.id, key, at };
    this.attempt.presses.push(press);
    if (key === ' ') {
      this.state = 'checking';
      this.attempt.submittedAt = at;
    } else this.attempt.text += key;
    return press;
  }
  backspace() {
    if (this.state === 'typing') this.attempt.text = this.attempt.text.slice(0, -1);
  }
  observe(id: number, attemptId: number, observation: Observation): boolean {
    if (this.attempt.id !== attemptId || !['typing', 'checking'].includes(this.state)) return false;
    const press = this.attempt.presses.find((p) => p.id === id);
    if (!press || press.observation) return false;
    press.observation = observation;
    return true;
  }
  settle(): Verdict | null {
    if (this.state !== 'checking' || this.attempt.presses.some((p) => !p.observation)) return null;
    const verdict = grade(this.attempt, this.words[this.index]!);
    this.lastVerdict = verdict;
    this.history.push({ attempt: this.attempt, verdict });
    if (verdict.pass) {
      this.index++;
      if (this.index === this.words.length) {
        this.state = 'complete';
        this.endedAt = this.attempt.submittedAt;
      } else this.fresh();
    } else this.state = 'retry';
    return verdict;
  }
  retry() {
    if (this.state === 'retry' || this.state === 'paused') this.fresh();
  }
  pause() {
    if (this.state !== 'complete') {
      this.state = 'paused';
      this.nextAttemptId++;
    }
  }
  private fresh() {
    this.attempt = { id: ++this.nextAttemptId, wordIndex: this.index, text: '', presses: [] };
    this.state = 'typing';
  }
  stats(now: number): Stats {
    const elapsedMs =
      this.startedAt === undefined ? 0 : Math.max(0, (this.endedAt ?? now) - this.startedAt);
    const passed = this.history.filter((h) => h.verdict.pass);
    const characters = passed.reduce((n, h) => n + this.words[h.attempt.wordIndex]!.length + 1, 0);
    return {
      attempts: this.history.length,
      passedWords: passed.length,
      textMistakes: this.history.filter((h) => h.verdict.textWrong).length,
      wrongFingers: this.history.reduce((n, h) => n + h.verdict.wrong.length, 0),
      uncertainPresses: this.history.reduce((n, h) => n + h.verdict.uncertain.length, 0),
      retries: this.history.filter((h) => !h.verdict.pass).length,
      elapsedMs,
      wpm: elapsedMs > 0 ? characters / 5 / (elapsedMs / 60000) : 0,
    };
  }
}
