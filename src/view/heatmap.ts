import { type KeyboardProfile, type PhysicalKey, characterKey } from '../core/profile';
import { fingerName, type FingeringMode } from '../core/keyboard';
import { profileFingers } from '../core/profile';
import { median, ORDER, targetId, type Cohort } from '../curriculum/progress';
import { ratio } from './progress';

export const VIEWS = {
  fingers: 'Finger guide',
  response: 'Response time',
  accuracy: 'Target-key accuracy',
  finger: 'Observed finger compliance',
  hand: 'Observed hand compliance',
  coverage: 'Observation coverage',
} as const;
export type KeyboardView = keyof typeof VIEWS;
export const isKeyboardView = (value: unknown): value is KeyboardView =>
  typeof value === 'string' && Object.hasOwn(VIEWS, value);
export const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const label = (text: string) => (text === ' ' ? 'Space' : text);

// A physical key can produce several characters. Never average their target evidence.
export function summarizedOutput(
  key: PhysicalKey,
  profile: KeyboardProfile,
  c: Cohort,
  next: string,
) {
  const owns = (text: string) => characterKey(profile, text)?.code === key.code;
  if (owns(next)) return next;
  return ORDER.slice(0, c.course.included).find(owns) ?? ORDER.find(owns) ?? key.outputs[0]?.text;
}
export function keyMetric(c: Cohort, code: string, output: string | undefined, view: KeyboardView) {
  const target = output === undefined ? undefined : c.targets[targetId(output, code)];
  const actual = c.actual[code];
  const pending = actual ? actual.total - actual.observed - actual.unknown : 0;
  let numerator = 0,
    denominator = 0,
    count: number;
  let value: number | undefined;
  if (view === 'response') {
    count = target?.timings.length ?? 0;
    value = median(target?.timings.map((t) => t.ms) ?? []);
  } else {
    numerator =
      view === 'accuracy'
        ? (target?.correct ?? 0)
        : view === 'finger'
          ? (actual?.compliant ?? 0)
          : view === 'hand'
            ? (actual?.handCompliant ?? 0)
            : (actual?.observed ?? 0);
    denominator =
      view === 'accuracy'
        ? (target?.total ?? 0)
        : view === 'coverage'
          ? (actual?.total ?? 0)
          : (actual?.observed ?? 0);
    count = view === 'coverage' ? (actual?.observed ?? 0) + (actual?.unknown ?? 0) : denominator;
    value = denominator && count ? (100 * numerator) / denominator : undefined;
  }
  const state = !count ? 'none' : count < 20 ? 'limited' : 'normal';
  const status =
    state === 'none' ? 'No data' : state === 'limited' ? 'Limited evidence' : 'Recorded evidence';
  const amount =
    value === undefined
      ? 'No data'
      : view === 'response'
        ? `${value.toFixed(0)} ms`
        : `${value.toFixed(1)}%`;
  const evidence =
    view === 'response'
      ? `${count} recent valid intervals; ${target?.excludedTimings ?? 0} lifetime exclusions`
      : `${numerator}/${denominator} ${view === 'accuracy' ? 'prompted presses' : view === 'coverage' ? 'accepted presses' : 'observed presses'} · lifetime`;
  // Fixed restrained gold-to-teal scale. Only the fill clamps; values never do.
  const score = Math.max(
    0,
    Math.min(1, view === 'response' ? (1200 - (value ?? 1200)) / 1000 : (value ?? 0) / 100),
  );
  const low = [241, 215, 177],
    high = [164, 212, 210];
  const color =
    state === 'normal'
      ? `rgb(${low.map((v, i) => Math.round(v + (high[i]! - v) * score)).join(', ')})`
      : state === 'limited'
        ? '#e8e8e3'
        : '#f3f4f3';
  return {
    value,
    numerator,
    denominator,
    count,
    pending,
    state,
    status,
    amount,
    evidence,
    color,
    score,
  };
}
export function legend(view: KeyboardView) {
  if (view === 'fingers') return '';
  return `<span class="heat-scale" aria-hidden="true"></span><span>${view === 'response' ? '1,200 ms slower → 200 ms faster · recent median' : `0% → 100% · lifetime ${view === 'accuracy' ? 'prompted targets' : 'actual keys'}`}</span><span>— No data · ◌ Limited evidence (1–19) · values in Key details. Finger colors remain in the bottom strip.</span>`;
}
export function keyDetail(
  c: Cohort,
  profile: KeyboardProfile,
  code: string,
  next: string,
  view: KeyboardView,
  mode: FingeringMode,
  history: number,
) {
  const key = profile.keys.find((k) => k.code === code);
  if (!key) return '<p>No key selected.</p>';
  const output = summarizedOutput(key, profile, c, next);
  const metric = keyMetric(c, code, output, view);
  const a = c.actual[code];
  const other = key.outputs
    .filter((o) => o.text !== output)
    .map((o) => `${label(o.text)}${o.shift ? ' (Shift)' : ''}${o.altGr ? ' (AltGr)' : ''}`);
  const fact = (title: string, value: string) =>
    `<div><dt>${escape(title)}</dt><dd>${escape(value)}</dd></div>`;
  const fingers = profileFingers(profile, code, mode).map(fingerName).join(' or ');
  const thumbs = c.space.left + c.space.right;
  return `<h4>${escape(label(output ?? key.label))} · ${escape(code)}</h4><p>History ${history} · active mapping and ${escape(mode)} finger policy. Intended: ${escape(fingers || 'not assigned')}.</p>
  <p>Summarized output: <strong>${escape(label(output ?? 'none'))}</strong>. ${other.length ? `Other outputs: ${escape([...new Set(other)].join(', '))}. Target evidence is kept separately for each output.` : 'No other output.'}</p>
  ${view === 'fingers' ? '<p>Finger guide. Choose a metric using View beside the keyboard.</p>' : `<p><strong>${VIEWS[view]}: ${metric.amount} · ${metric.status}</strong><br>${escape(metric.evidence)}.</p><p>${view === 'response' ? 'Expected target character and mapped physical key. Recent median uses valid consecutive correct-prefix intervals only; first presses and interrupted prefixes have no sample.' : view === 'accuracy' ? 'Expected target character and mapped physical key, including mistaken presses on other keys.' : 'Actual physical key pressed, including mistakes and erased presses; all outputs share physical-key observation counts.'} ${view === 'coverage' ? `${metric.count} finalized accepted presses determine evidence strength; ${metric.pending} pending remain in the accepted total.` : ''}</p>`}
  <dl class="progress-facts">${fact('Lifetime observation coverage', ratio(a?.observed ?? 0, a?.total ?? 0))}${fact('Lifetime unknown', ratio(a?.unknown ?? 0, a?.total ?? 0))}${fact('Pending observations', String(metric.pending))}</dl>
  ${code === 'Space' ? `<h4>Space usage · lifetime</h4><dl class="progress-facts">${fact('Left thumb', String(c.space.left))}${fact('Right thumb', String(c.space.right))}${fact('Other observed fingers', String(c.space.other))}${fact('Unknown', String(a?.unknown ?? 0))}${fact('Older observations without recorded side', String(c.space.unclassified))}${fact('Left / observed thumbs only', ratio(c.space.left, thumbs))}${fact('Right / observed thumbs only', ratio(c.space.right, thumbs))}</dl><p>Either thumb is allowed; this split does not imply a preferred thumb.</p>` : ''}`;
}
