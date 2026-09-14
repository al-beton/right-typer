import { keyDistance } from '../core/calibration';
import { DIGITS, LANDMARK_TIPS, fingerName } from '../core/keyboard';
import { handSides } from '../core/observation';
import type { Calibration, Finger, Frame } from '../core/types';
import type { Camera } from '../tracking/camera';
import { keyTime } from '../tracking/timing';

export type TrialContext = {
  calibration: Calibration;
  key: string;
  code: string;
  intended: Finger[];
};

// Experimental geometry only. Source clocks are NEVER changed to 'capture'.
// Offset means rVFC callback time minus an assumed upstream delay, not sensor exposure.
export function estimateFinger(
  context: TrialContext,
  frames: readonly Frame[],
  keyAt: number,
  offsetMs: number,
) {
  const frame = frames
    .filter(
      (f) => Number.isFinite(f.at) && f.hands.length && Math.abs(f.at - offsetMs - keyAt) <= 100,
    )
    .toSorted((a, b) => Math.abs(a.at - offsetMs - keyAt) - Math.abs(b.at - offsetMs - keyAt))[0];
  if (!frame) return null;
  const sides = handSides(frame.hands, context.calibration);
  const closest = frame.hands
    .flatMap((hand, h) =>
      LANDMARK_TIPS.flatMap((tip, i) => {
        const point = hand.points[tip];
        return point
          ? [
              {
                finger: `${sides[h]!}-${DIGITS[i]!}` as Finger,
                distance: keyDistance(context.calibration, context.code, point),
              },
            ]
          : [];
      }),
    )
    .filter((p) => Number.isFinite(p.distance))
    .sort((a, b) => a.distance - b.distance)[0];
  return closest
    ? {
        ...closest,
        frameId: frame.id,
        sourceClock: frame.clock,
        callbackTimeMs: frame.at,
        inferenceArrivalMs: frame.receivedAt,
        estimatedEventTimeMs: frame.at - offsetMs,
        residualMs: frame.at - offsetMs - keyAt,
      }
    : null;
}

export function timingTrial(
  parent: HTMLElement,
  camera: Camera,
  contextFor: (event: KeyboardEvent) => TrialContext | undefined,
) {
  const details = document.createElement('details');
  details.id = 'timing-trial';
  details.innerHTML = `<summary>Staged finger timing trial (experimental estimates)</summary>
    <p>Map the keyboard first. Declare the finger you will actually use, choose a phase, then focus the test pad and tap one key. Include intended and deliberately different fingers. This test estimates finger identity; it does not update practice grades or progress.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <label>Actual finger <select id="trial-finger"><option value="">Choose before tapping</option>${(['left', 'right'] as const).flatMap((side) => DIGITS.map((digit) => `<option value="${side}-${digit}">${fingerName(`${side}-${digit}`)}</option>`)).join('')}</select></label>
      <label>Test phase <select id="trial-phase"><option value="explore">Explore offset</option><option value="heldout">Held-out check</option></select></label>
      <label>Assumed delay (ms) <input id="trial-delay" type="number" min="0" max="600" step="25" value="0" style="width:80px"></label>
      <label>Sensitivity ±ms <input id="trial-jitter" type="number" min="0" max="100" step="10" value="30" style="width:80px"></label>
      <input id="trial-pad" aria-label="Staged key test pad" placeholder="Focus here; tap one mapped key" readonly>
      <button id="trial-clear">Clear trial results</button>
    </div>
    <p id="trial-status" role="status">No staged presses yet. Results stay in memory only.</p>
    <p>Delay is a hypothesis. Exploration shows which offsets agree with your declaration; a stationary finger may fit every offset. Choose a delay, then keep it fixed for held-out presses. Agreement is user-labeled feasibility evidence, not sensor-clock proof or a calibrated confidence interval.</p>
    <pre id="trial-results" style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-height:300px;overflow:auto"></pre>`;
  parent.append(details);
  const get = <T extends HTMLElement>(id: string) => details.querySelector<T>(`#${id}`)!;
  const status = get('trial-status');
  const rows: Record<string, unknown>[] = [];
  let generation = 0;
  let pending = false;
  let timer = 0;
  get('trial-clear').onclick = () => {
    generation++;
    clearTimeout(timer);
    pending = false;
    rows.length = 0;
    get('trial-results').textContent = '';
    status.textContent = 'Trial results cleared.';
  };
  get('trial-pad').onkeydown = (event) => {
    if (event.key === 'Tab' || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat || event.isComposing || event.key.length !== 1) return;
    if (pending) {
      status.textContent = 'Wait for this press to finish before the next tap.';
      return;
    }
    const context = contextFor(event);
    const actual = get<HTMLSelectElement>('trial-finger').value as Finger;
    const delay = Number(get<HTMLInputElement>('trial-delay').value);
    const jitter = Number(get<HTMLInputElement>('trial-jitter').value);
    if (camera.status !== 'ready' || !context) {
      status.textContent = 'Start the camera and complete keyboard mapping first.';
      return;
    }
    if (!actual) {
      status.textContent = 'Declare the actual finger before tapping.';
      return;
    }
    if (
      !Number.isFinite(delay) ||
      delay < 0 ||
      delay > 600 ||
      !Number.isFinite(jitter) ||
      jitter < 0 ||
      jitter > 100
    ) {
      status.textContent = 'Use a delay from 0 to 600 ms and sensitivity from 0 to 100 ms.';
      return;
    }
    const phase = get<HTMLSelectElement>('trial-phase').value;
    const keyAt = keyTime(event, performance.now(), performance.timeOrigin);
    const stream = camera.stream;
    const calibration = JSON.stringify(context.calibration);
    const run = generation;
    pending = true;
    status.textContent = 'Collecting nearby frame results for this staged press…';
    // Bounded trial window allows delayed source-linked worker results to arrive.
    timer = window.setTimeout(() => {
      if (run !== generation) return;
      pending = false;
      const current = contextFor(event);
      if (
        stream !== camera.stream ||
        camera.status !== 'ready' ||
        !current ||
        JSON.stringify(current.calibration) !== calibration
      ) {
        status.textContent = 'Camera or mapping changed; this staged press was discarded.';
        return;
      }
      const frames = camera.evidence.frames;
      const nominal = estimateFinger(context, frames, keyAt, delay);
      const offsets = [
        ...new Set([
          delay - jitter,
          delay,
          delay + jitter,
          ...Array.from(
            { length: Math.floor((jitter * 2) / 10) + 1 },
            (_, i) => delay - jitter + i * 10,
          ),
        ]),
      ]
        .filter((n) => n >= 0)
        .sort((a, b) => a - b);
      const sensitivity = offsets.map((offset) => ({
        offsetMs: offset,
        estimate: estimateFinger(context, frames, keyAt, offset)?.finger ?? null,
      }));
      const stable = !!nominal && sensitivity.every((s) => s.estimate === nominal.finger);
      const exploratoryOffsets =
        phase === 'explore'
          ? Array.from({ length: 25 }, (_, i) => i * 25).filter(
              (offset) => estimateFinger(context, frames, keyAt, offset)?.finger === actual,
            )
          : undefined;
      const disposition = !nominal
        ? 'No nearby hands'
        : !stable
          ? 'Offset-sensitive estimate'
          : nominal.finger === actual
            ? 'Estimated finger matches declaration'
            : 'Estimated finger differs from declaration';
      rows.push({
        phase,
        key: context.key,
        code: context.code,
        declaredFinger: actual,
        intendedFingers: context.intended,
        declaredIntended: context.intended.includes(actual),
        assumedDelayMs: delay,
        sensitivityMs: jitter,
        provenance: 'estimated from rVFC callback minus assumed delay; not verified exposure time',
        disposition,
        nominal,
        stableAcrossSampledOffsets: stable,
        estimatedIntended: stable && nominal ? context.intended.includes(nominal.finger) : null,
        agreesWithDeclaration: stable && nominal ? nominal.finger === actual : null,
        exploratoryOffsetsAgreeingWithDeclaration: exploratoryOffsets,
        sensitivity,
      });
      if (rows.length > 60) rows.shift();
      get('trial-results').textContent = JSON.stringify(rows, null, 2);
      status.textContent = `${disposition}${nominal ? `: ${fingerName(nominal.finger)}` : ''}. ${rows.length} staged presses retained. Ordinary practice remains unknown.`;
    }, 1600);
  };
  window.addEventListener(
    'pagehide',
    () => {
      generation++;
      clearTimeout(timer);
      rows.length = 0;
    },
    { once: true },
  );
}
