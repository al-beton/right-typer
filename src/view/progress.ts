import {
  median,
  ORDER,
  type Cohort,
  type ProgressData,
  type ActualProgress,
} from '../curriculum/progress';
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const label = (text: string) => (text === ' ' ? 'Space' : text);
export function ratio(numerator: number, denominator: number) {
  if (!denominator) return 'No data';
  return `${((100 * numerator) / denominator).toFixed(1)}% (${numerator}/${denominator})${denominator < 20 ? ' · Limited evidence' : ''}`;
}
export function duration(ms: number) {
  return ms < 60000
    ? `${(ms / 1000).toFixed(1)} s`
    : `${Math.floor(ms / 60000)} min ${Math.floor((ms % 60000) / 1000)} s`;
}
function actualSummary(values: ActualProgress[]) {
  return values.reduce(
    (a, b) => ({
      total: a.total + b.total,
      observed: a.observed + b.observed,
      compliant: a.compliant + b.compliant,
      handCompliant: a.handCompliant + b.handCompliant,
      unknown: a.unknown + b.unknown,
    }),
    { total: 0, observed: 0, compliant: 0, handCompliant: 0, unknown: 0 },
  );
}
const pending = (a: ReturnType<typeof actualSummary>) => a.total - a.observed - a.unknown;
const cell = (value: string | number) => `<td>${escape(String(value))}</td>`;
const table = (title: string, headers: string[], rows: string[]) =>
  `<details class="progress-detail"><summary>${title}</summary><div class="progress-table" tabindex="0" role="region" aria-label="${title}"><table><thead><tr>${headers.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}">No data</td></tr>`}</tbody></table></div></details>`;
export function progressMarkup(
  data: ProgressData,
  current: Cohort,
  selected: string,
  resetArmed: boolean,
  notice: string,
) {
  const c = data.cohorts.find((c) => c.signature === selected) ?? current;
  const a = actualSummary(Object.values(c.actual));
  const fact = (title: string, value: string) =>
    `<div><dt>${title}</dt><dd>${escape(value)}</dd></div>`;
  const targets = Object.values(c.targets).sort(
    (a, b) =>
      ORDER.indexOf(a.character) - ORDER.indexOf(b.character) || a.code.localeCompare(b.code),
  );
  const targetRows = targets.map(
    (t) =>
      `<tr><th scope="row">${escape(label(t.character))} <small>${escape(t.code)}</small></th>${cell(ratio(t.correct, t.total))}${cell(ratio(t.recent.filter((p) => p.correct).length, t.recent.length))}${cell(t.timings.length ? `${median(t.timings.map((t) => t.ms))!.toFixed(0)} ms (${t.timings.length} samples)${t.timings.length < 20 ? ' · Limited evidence' : ''}` : 'No data')}${cell(t.excludedTimings)}</tr>`,
  );
  const actualRows = Object.entries(c.actual)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, a]) => {
      const observed = a.recent.filter((p) => !['unknown', 'pending'].includes(p.outcome));
      return `<tr><th scope="row">${escape(code)}</th>${cell(ratio(a.compliant, a.observed))}${cell(ratio(a.handCompliant, a.observed))}${cell(ratio(a.observed, a.total))}${cell(ratio(a.unknown, a.total))}${cell(pending(a))}${cell(ratio(observed.filter((p) => p.outcome === 'compliant').length, observed.length))}</tr>`;
    });
  const space = c.actual.Space,
    thumbs = c.space.left + c.space.right;
  return `<h3 id="progress-title">Typing progress</h3>${notice ? `<p id="progress-status" class="storage-alert" role="status">${escape(notice)}</p>` : ''}
    <label for="progress-cohort">Keyboard and fingering history</label><select id="progress-cohort">${data.cohorts.map((item, i) => `<option value="${i}" ${item === c ? 'selected' : ''}>History ${i + 1}${item === current ? ' · current' : ''} · ${item.course.included} practice keys</option>`).join('')}</select>
    <p>Lifetime totals for this compatible mapping and finger policy. Cosmetic names and camera changes share a history; changed mappings or policies start another.</p>
    <dl class="progress-facts">${fact('Text accuracy', ratio(c.correct, c.total))}${fact('Observed finger compliance', ratio(a.compliant, a.observed))}${fact('Observed hand compliance', ratio(a.handCompliant, a.observed))}${fact('Observation coverage', ratio(a.observed, a.total))}${fact('Unknown observations', ratio(a.unknown, a.total))}${fact('Pending observations', String(pending(a)))}${fact('Corrections', String(c.corrections))}${fact('Active practice', duration(c.activeMs))}</dl>
    <p class="progress-note">Unknown is not correct-finger evidence. Compliance uses observed presses only. Active time sums focused inter-action gaps up to 5 seconds, including meaningful Backspace; it excludes idle, checking and pauses. It is separate from result WPM.</p>
    ${table('Expected target keys', ['Target / mapped key', 'Lifetime accuracy', 'Recent accuracy · last 32 prompts', 'Response · last 32 valid intervals', 'Excluded intervals'], targetRows)}
    <p class="progress-note">A mistaken X while N is expected affects target N. First presses and interrupted prefixes have no response sample. Recent evidence stays separate from lifetime totals.</p>
    ${table('Actual physical keys', ['Physical key', 'Lifetime finger compliance', 'Lifetime hand compliance', 'Lifetime coverage', 'Lifetime unknown', 'Pending', 'Recent finger compliance · last 32 presses'], actualRows)}
    <details class="progress-detail"><summary>Space and thumb usage</summary><dl class="progress-facts">${fact('Left thumb / recorded thumbs', ratio(c.space.left, thumbs))}${fact('Right thumb / recorded thumbs', ratio(c.space.right, thumbs))}${fact('Other observed fingers', String(c.space.other))}${fact('Unknown Space', String(space?.unknown ?? 0))}${fact('Pending Space', String(space ? pending(space) : 0))}${fact('Space coverage', ratio(space?.observed ?? 0, space?.total ?? 0))}${fact('Older observed Space without a recorded side', String(c.space.unclassified))}</dl></details>
    ${table(
      'Active time by local date · all histories',
      ['Local date', 'Active time'],
      [...data.activity.days]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((day) => `<tr><th scope="row">${escape(day.date)}</th>${cell(duration(day.ms))}</tr>`),
    )}
    <p class="progress-note">${data.activity.clockAnomalies} wall-clock anomalies (${duration(data.activity.undatedMs)} without a reliable date); ${c.excludedActivity} invalid or idle activity gaps. Older progress retains its evidence; no historical active time or thumb side is invented.</p>
    <div class="progress-actions"><button id="progress-export">Export progress JSON</button><button id="progress-reset">${resetArmed ? 'Confirm reset progress' : 'Reset progress only'}</button></div>
    <p id="progress-reset-scope">Reset clears all typing progress and curriculum histories. Calibration, keyboard profiles, preferences and completed result history stay. Import is not supported.</p>`;
}
