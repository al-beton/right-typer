import { isCameraDelay, MAX_CAMERA_DELAY_MS } from '../core/camera-delay';
import { fingerName } from '../core/keyboard';
import type { Finger, Observation, Press } from '../core/types';

type State = {
  adjustable: boolean;
  ready: boolean;
  delayMs: number;
  scope: string;
  reusable?: number;
};
type Check = { press: Press; observation: Observation; intended: Finger[] };
const checks = {
  fr: 'Quick F → R: use your left index for both. Move naturally and press quickly.',
  er: 'Quick E → R: left middle on E, then left index on R.',
  slow: 'Slow control: press F → R, pause, then E → R. Verify each actual finger yourself.',
  wrong:
    'Clear-finger control: deliberately press R with your left middle finger. The camera should report middle, even though the usual intended finger is index.',
};
export function cameraDelayControls(
  host: HTMLElement,
  state: () => State,
  apply: (value: number) => void,
  observe: (event: KeyboardEvent) => Promise<Check> | string,
) {
  host.innerHTML = `<fieldset class="delay-settings"><legend>Camera delay adjustment</legend>
    <p>Positive delay uses later camera images for each press. Adjust only the extra lag after browser timing. Start at 0 ms; this is a manual setting, not a latency measurement.</p>
    <label for="camera-delay">Additional camera delay (ms)</label>
    <input id="camera-delay" type="number" min="0" max="${MAX_CAMERA_DELAY_MS}" step="5" value="0" inputmode="numeric" />
    <button type="button" id="apply-camera-delay">Apply & save delay</button>
    <button type="button" id="reset-camera-delay">Reset to 0 ms</button>
    <button type="button" id="reuse-camera-delay" hidden>Reuse previous window delay</button>
    <p id="camera-delay-status" role="status"></p>
    <details><summary>Check the delay before practice</summary>
      <p>These checks do not affect practice progress, heatmaps or your daily goal. Compare the camera observation with the finger you actually used; unknown is not a successful detection.</p>
      <label for="delay-check-mode">Try a transition or control</label>
      <select id="delay-check-mode"><option value="fr">Quick F → R</option><option value="er">Quick E → R</option><option value="slow">Slow F → R, E → R</option><option value="wrong">Deliberate middle-finger R</option></select>
      <p id="delay-check-instruction"></p>
      <button type="button" id="repeat-delay-check">Start / repeat check</button>
      <label for="delay-check-input">Press the check keys here</label><input id="delay-check-input" readonly autocomplete="off" placeholder="Start a check, then type here" />
      <p id="delay-check-status" role="status"></p><ol id="delay-check-results"></ol>
      <p>Adjust, apply and repeat if needed. Use Close & resume when ready.</p>
    </details></fieldset>`;
  const find = <T extends HTMLElement>(id: string) => host.querySelector<T>(`#${id}`)!;
  const input = find<HTMLInputElement>('camera-delay');
  const status = find('camera-delay-status');
  const mode = find<HTMLSelectElement>('delay-check-mode');
  const checkInput = find<HTMLInputElement>('delay-check-input');
  const checkStatus = find('delay-check-status');
  const results = find('delay-check-results');
  let revision = 0;
  let remaining = '';
  let previousAt: number | undefined;
  const clearCheck = () => {
    revision++;
    remaining = '';
    previousAt = undefined;
    results.replaceChildren();
    checkStatus.textContent = 'Choose a check and start when ready.';
  };
  const instruction = () => {
    find('delay-check-instruction').textContent = checks[mode.value as keyof typeof checks];
  };
  mode.onchange = () => {
    clearCheck();
    instruction();
  };
  const refresh = () => {
    const current = state();
    input.value = String(current.delayMs);
    for (const id of [
      'camera-delay',
      'apply-camera-delay',
      'reset-camera-delay',
      'repeat-delay-check',
      'delay-check-input',
    ])
      (find(id) as HTMLInputElement | HTMLButtonElement).disabled = !current.ready;
    for (const id of ['camera-delay', 'apply-camera-delay', 'reset-camera-delay'])
      (find(id) as HTMLInputElement | HTMLButtonElement).disabled =
        !current.ready || !current.adjustable;
    status.textContent = `Applied: ${current.delayMs} ms. ${current.scope}`;
    const reuse = find<HTMLButtonElement>('reuse-camera-delay');
    reuse.hidden = current.reusable === undefined;
    reuse.disabled = !current.ready;
    reuse.textContent = `Reuse previous window delay (${current.reusable ?? 0} ms)`;
  };
  find('apply-camera-delay').onclick = () => {
    const value = input.valueAsNumber;
    if (!isCameraDelay(value)) {
      status.textContent = `Enter a whole number from 0 to ${MAX_CAMERA_DELAY_MS} ms.`;
      return;
    }
    apply(value);
    refresh();
  };
  find('reset-camera-delay').onclick = () => {
    apply(0);
    refresh();
  };
  find('reuse-camera-delay').onclick = () => {
    const value = state().reusable;
    if (value !== undefined) apply(value);
    refresh();
  };
  find('repeat-delay-check').onclick = () => {
    clearCheck();
    remaining = ({ fr: 'fr', er: 'er', slow: 'frer', wrong: 'r' } as Record<string, string>)[
      mode.value
    ]!;
    checkStatus.textContent = 'Ready. Use the instructed fingers and verify them yourself.';
    checkInput.focus();
  };
  checkInput.onkeydown = (event) => {
    if (
      event.repeat ||
      event.isComposing ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.key.length !== 1
    )
      return;
    event.preventDefault();
    if (!remaining) {
      checkStatus.textContent = 'Start / repeat a check first.';
      return;
    }
    if (event.key.toLowerCase() !== remaining[0]) {
      checkStatus.textContent = `Next key: ${remaining[0]!.toUpperCase()}.`;
      return;
    }
    const request = observe(event);
    if (typeof request === 'string') {
      checkStatus.textContent = request;
      return;
    }
    remaining = remaining.slice(1);
    const generation = revision;
    const row = document.createElement('li');
    row.textContent = `${event.key.toUpperCase()}: waiting for camera evidence…`;
    results.append(row);
    const interval =
      previousAt === undefined
        ? ''
        : ` Key interval: ${Math.round(event.timeStamp - previousAt)} ms.`;
    previousAt = event.timeStamp;
    checkStatus.textContent = remaining
      ? `Next key: ${remaining[0]!.toUpperCase()}.`
      : 'Check entered. Compare observations with your actual fingers; repeat both quick and slow controls.';
    void request.then(({ press, observation: o, intended }) => {
      if (generation !== revision) return;
      const expected = intended.map(fingerName).join(' or ');
      row.textContent = `${press.key.toUpperCase()} — usual intended: ${expected}. Camera: ${o.kind === 'finger' ? fingerName(o.finger) : `unknown (${o.reason})`}.${interval}`;
      if (o.kind === 'finger')
        row.textContent += ` Frame ${o.frameIds.join(', ')}: ${Math.round(o.offsetMs)} ms from press; ${o.timing?.basis ?? 'capture'}, extra delay ${o.timing?.residualDelayMs ?? 0} ms; uncertainty unmeasured.`;
    });
  };
  clearCheck();
  instruction();
  refresh();
  return { refresh, clearCheck };
}
