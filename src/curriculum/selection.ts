import corpus from './corpus.json';
import fallbacks from './fallback-pools.json';
import { characterKey, type KeyboardProfile } from '../core/profile';
import { ORDER, median, targetId, type Cohort, type Round, type Slot } from './progress';

export const WORDS_BY_ID = new Map(corpus.words.map((word) => [word.id, word.text]));
export const includedKeys = (cohort: Cohort) => ORDER.slice(0, cohort.course.included);
export const missingOutputs = (cohort: Cohort, profile: KeyboardProfile) =>
  includedKeys(cohort).filter((character) => !characterKey(profile, character));
export const roundWords = (round: Round) =>
  round.slots.map((slot) => WORDS_BY_ID.get(slot.word)! + slot.mark);
export function targetProgress(cohort: Cohort, profile: KeyboardProfile, character: string) {
  return cohort.targets[targetId(character, characterKey(profile, character)?.code ?? '')];
}
export function qualifies(cohort: Cohort, profile: KeyboardProfile, character: string) {
  const target = targetProgress(cohort, profile, character);
  if (!target || target.recent.length < 20 || target.timings.length < 20) return false;
  return (
    target.recent.filter((item) => item.correct).length / target.recent.length >= 0.95 &&
    median(target.timings.map((item) => item.ms))! <= 600 &&
    new Set(target.timings.map((item) => item.word)).size >= 3 &&
    new Set(target.timings.map((item) => item.round)).size >= 2 &&
    new Set(target.recent.map((item) => item.word)).size >= 3 &&
    new Set(target.recent.map((item) => item.round)).size >= 2
  );
}
export function selectFocus(cohort: Cohort, profile: KeyboardProfile) {
  const keys = includedKeys(cohort);
  const target = (key: string) => targetProgress(cohort, profile, key);
  const unqualified = keys.filter((key) => !cohort.course.qualified.includes(key));
  if (unqualified.length)
    return unqualified.sort(
      (a, b) => (target(a)?.recent.length ?? 0) - (target(b)?.recent.length ?? 0),
    )[0]!;
  const fingerRate = (key: string) => {
    const observed =
      cohort.actual[characterKey(profile, key)?.code ?? '']?.recent.filter(
        (item) => !['pending', 'unknown'].includes(item.outcome),
      ) ?? [];
    return observed.length >= 20
      ? observed.filter((item) => item.outcome === 'compliant').length / observed.length
      : 1;
  };
  const accuracy = (key: string) => {
    const recent = target(key)?.recent ?? [];
    return recent.length >= 20 ? recent.filter((item) => item.correct).length / recent.length : 1;
  };
  const weakFinger = keys.filter((key) => fingerRate(key) < 0.95);
  if (weakFinger.length) return weakFinger.sort((a, b) => fingerRate(a) - fingerRate(b))[0]!;
  const weakText = keys.filter((key) => accuracy(key) < 0.95);
  if (weakText.length) return weakText.sort((a, b) => accuracy(a) - accuracy(b))[0]!;
  const underexposed = keys.filter((key) => (target(key)?.timings.length ?? 0) < 20);
  if (underexposed.length)
    return underexposed.sort(
      (a, b) => (target(a)?.timings.length ?? 0) - (target(b)?.timings.length ?? 0),
    )[0]!;
  return keys.sort(
    (a, b) =>
      median(target(b)!.timings.map((item) => item.ms))! -
      median(target(a)!.timings.map((item) => item.ms))!,
  )[0]!;
}
function random(cohort: Cohort) {
  let seed = cohort.course.seed;
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  cohort.course.seed = seed >>> 0;
  return cohort.course.seed / 4294967296;
}
export function generateRound(
  cohort: Cohort,
  profile: KeyboardProfile,
  introduced?: string,
): Round {
  const course = cohort.course,
    keys = includedKeys(cohort),
    allowed = new Set(keys);
  const focus = selectFocus(cohort, profile);
  const eligible = corpus.words.filter((word) => [...word.text].every((key) => allowed.has(key)));
  const round: Round = {
    sequence: ++course.sequence,
    focus,
    slots: [],
    ...(introduced ? { introduced } : {}),
  };
  course.reviewQueue = course.reviewQueue.filter((key) => allowed.has(key));
  for (const key of keys) if (!course.reviewQueue.includes(key)) course.reviewQueue.push(key);
  for (let i = 0; i < 12; i++) {
    const target = i % 3 === 2 ? course.reviewQueue.shift()! : focus;
    if (i % 3 === 2) course.reviewQueue.push(target);
    const mark: Slot['mark'] = target === ',' || target === '.' ? target : '';
    let pool = eligible
      .filter((word) => target === ' ' || mark || word.text.includes(target))
      .map((word) => word.id);
    if (!pool.length) {
      const stage = fallbacks.stages[course.included - 7]!;
      const targets = stage.targets as Record<string, { wordId: string; text: string }[]>;
      pool = (targets[target] ?? [])
        .filter((word) => [...word.text].every((key) => allowed.has(key)))
        .map((word) => word.wordId);
      round.diagnostic =
        'Using a small practice pool. Reload to check for an updated word list; your level is preserved.';
    }
    if (!pool.length)
      throw new Error(`No words for ${target}. Update the app to restore this curriculum.`);
    const withoutRecent = pool.filter((id) => !course.lastWords.includes(id));
    if (withoutRecent.length) pool = withoutRecent;
    const least = Math.min(...pool.map((id) => course.usage[id] ?? -1));
    pool = pool.filter((id) => (course.usage[id] ?? -1) === least);
    const word = pool[Math.floor(random(cohort) * pool.length)]!;
    round.slots.push({ word, mark, target });
    course.usage[word] = round.sequence * 12 + i;
    course.lastWords = [...course.lastWords, word].slice(-2);
  }
  course.round = round;
  return round;
}
export function currentRound(cohort: Cohort, profile: KeyboardProfile) {
  return cohort.course.round ?? generateRound(cohort, profile);
}
export function completeRound(cohort: Cohort, profile: KeyboardProfile): Round {
  const course = cohort.course;
  for (const key of includedKeys(cohort)) {
    if (!course.qualified.includes(key) && qualifies(cohort, profile, key))
      course.qualified.push(key);
  }
  let introduced: string | undefined;
  if (
    course.included < ORDER.length &&
    includedKeys(cohort).every((key) => course.qualified.includes(key))
  ) {
    introduced = ORDER[course.included++]!;
    course.reviewQueue.push(introduced);
  }
  return generateRound(cohort, profile, introduced);
}
