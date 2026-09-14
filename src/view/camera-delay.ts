import { isCameraDelay, MAX_CAMERA_DELAY_MS } from '../core/camera-delay';
import { DelayClip, clipFrameForKey } from '../recording/delay-clip';
import { keyTime } from '../tracking/timing';
import type { Frame } from '../core/types';
import type { Crop } from './crop';

type State = {
  adjustable: boolean;
  ready: boolean;
  delayMs: number;
  scope: string;
  reusable?: number;
};
export function cameraDelayControls(
  host: HTMLElement,
  state: () => State,
  apply: (value: number) => void,
) {
  host.innerHTML = `<fieldset class="delay-settings"><legend>Camera delay adjustment</legend>
    <p>Record a short clip while tapping F → R and E → R. Compare the visible key contact with the keypress markers, then adjust the delay on this same clip.</p>
    <button type="button" id="record-delay-clip">Record a short clip</button>
    <button type="button" id="stop-delay-clip" hidden>Stop recording</button>
    <button type="button" id="retake-delay-clip" hidden>Retake</button>
    <button type="button" id="discard-delay-clip" hidden>Discard clip</button>
    <label for="delay-clip-keys" id="delay-clip-key-label" hidden>Tap keys here while recording (up to 5 seconds)</label>
    <input id="delay-clip-keys" readonly autocomplete="off" hidden placeholder="Tap F → R, E → R, and slow controls" />
    <p id="delay-clip-status" role="status"></p>
    <div id="delay-clip-review" hidden>
      <canvas id="delay-clip-view" aria-label="Recorded camera frame"></canvas>
      <p id="delay-clip-position" role="status"></p>
      <div class="clip-transport"><button type="button" id="clip-play">Play</button><button type="button" id="clip-prev">Previous frame</button><button type="button" id="clip-next">Next frame</button>
      <label for="clip-speed">Playback speed</label><select id="clip-speed"><option value="1">1×</option><option value="0.5">0.5×</option><option value="0.25">0.25×</option></select></div>
      <label for="clip-scrub">Captured-frame timeline</label><input id="clip-scrub" type="range" min="0" max="1" step="1" value="0" />
      <div id="clip-event-timeline" aria-hidden="true"></div>
      <div id="clip-markers" aria-label="Recorded keypresses"></div>
      <p>Choose a keypress marker, then compare nearby captured frames. Frame gaps are real; no in-between image is invented.</p>
    </div>
    <label for="camera-delay">Additional camera delay (ms)</label>
    <input id="camera-delay" type="number" min="0" max="${MAX_CAMERA_DELAY_MS}" step="5" value="0" inputmode="numeric" />
    <button type="button" id="apply-camera-delay">Apply & save delay</button>
    <button type="button" id="reset-camera-delay">Reset to 0 ms</button>
    <button type="button" id="cancel-camera-delay">Cancel adjustment</button>
    <button type="button" id="reuse-camera-delay" hidden>Reuse previous window delay</button>
    <p id="camera-delay-status" role="status"></p>
    <p>Positive delay uses later images for each press. Start at 0 ms. This is visual human calibration, not a measurement of sensor exposure. Clips and key events stay only in browser memory: no microphone, upload, download or training statistics. Discard or close settings to remove them.</p>
  </fieldset>`;
  const find = <T extends HTMLElement>(id: string) => host.querySelector<T>(`#${id}`)!;
  const input = find<HTMLInputElement>('camera-delay');
  const status = find('camera-delay-status');
  const canvas = find<HTMLCanvasElement>('delay-clip-view');
  const scrub = find<HTMLInputElement>('clip-scrub');
  const speed = find<HTMLSelectElement>('clip-speed');
  const keys = find<HTMLInputElement>('delay-clip-keys');
  let current = 0;
  let selectedKey = -1;
  let paintRevision = 0;
  let playing = false;
  let animation = 0;
  let markerCount = -1;
  let reviewed = false;
  const candidate = () =>
    isCameraDelay(input.valueAsNumber) ? input.valueAsNumber : state().delayMs;
  const clip = new DelayClip(update);
  function pause() {
    playing = false;
    cancelAnimationFrame(animation);
    find('clip-play').textContent = 'Play';
  }
  function draw() {
    const frame = clip.frames[current];
    if (!frame) return;
    const revision = ++paintRevision;
    const updatePosition = () => {
      const first = clip.frames[0]!.basisAt;
      const event = clip.keys[selectedKey];
      const effective = frame.basisAt - candidate();
      find('delay-clip-position').textContent =
        `Frame ${current + 1}/${clip.frames.length} (captured #${frame.id}) · source +${Math.round(frame.basisAt - first)} ms · ${frame.timing.basis}. ${event ? `Selected ${event.key === ' ' ? 'Space' : event.key.toUpperCase()} at +${Math.round(event.at - first)} ms; frame − key after delay: ${Math.round(effective - event.at)} ms.` : 'Select a keypress marker to compare contact.'}`;
      canvas.dataset.frameId = String(frame.id);
      canvas.dataset.basisAt = String(frame.basisAt);
      canvas.dataset.effectiveAt = String(effective);
      scrub.max = String(Math.max(0, clip.frames.at(-1)!.basisAt - first));
      scrub.value = String(frame.basisAt - first);
      const span = Math.max(1, clip.frames.at(-1)!.basisAt - first);
      find('clip-event-timeline').replaceChildren(
        ...clip.keys.map((key, i) => {
          const tick = document.createElement('span');
          tick.style.left = `${Math.max(0, Math.min(100, ((key.at + candidate() - first) / span) * 100))}%`;
          tick.textContent = key.key === ' ' ? '␣' : key.key.toUpperCase();
          tick.classList.toggle('selected', i === selectedKey);
          return tick;
        }),
      );
      for (const button of find('clip-markers').querySelectorAll<HTMLButtonElement>('button'))
        button.setAttribute(
          'aria-pressed',
          String(Number(button.dataset.keyIndex) === selectedKey),
        );
    };
    void createImageBitmap(frame.blob)
      .then((bitmap) => {
        try {
          if (revision !== paintRevision) return;
          canvas.width = frame.width;
          canvas.height = frame.height;
          canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
          updatePosition();
        } finally {
          bitmap.close();
        }
      })
      .catch(() => {
        if (revision === paintRevision)
          find('delay-clip-status').textContent =
            'This frame could not be decoded. Try a nearby frame or retake.';
      });
  }
  function align() {
    pause();
    const event = clip.keys[selectedKey];
    if (event) {
      const found = clipFrameForKey(clip.frames, event.at, candidate());
      if (found < 0) {
        paintRevision++;
        canvas.width = 0;
        canvas.height = 0;
        delete canvas.dataset.frameId;
        delete canvas.dataset.basisAt;
        delete canvas.dataset.effectiveAt;
        for (const button of find('clip-markers').querySelectorAll<HTMLButtonElement>('button'))
          button.setAttribute(
            'aria-pressed',
            String(Number(button.dataset.keyIndex) === selectedKey),
          );
        find('delay-clip-position').textContent =
          `Selected ${event.key === ' ' ? 'Space' : event.key.toUpperCase()}: no recorded frame within 500 ms at this delay. Retake with keys away from the clip edges.`;
        return;
      }
      current = found;
    }
    draw();
  }
  function update() {
    const recording = clip.state === 'recording';
    const finishing = clip.state === 'finishing';
    find('delay-clip-status').textContent = clip.message;
    find('stop-delay-clip').hidden = !recording;
    keys.hidden = !recording;
    find('delay-clip-key-label').hidden = !recording;
    find('record-delay-clip').hidden = clip.state !== 'empty';
    find('retake-delay-clip').hidden = clip.state !== 'ready';
    find('discard-delay-clip').hidden = clip.state === 'empty';
    find('delay-clip-review').hidden = clip.state !== 'ready' || !clip.frames.length;
    for (const id of [
      'camera-delay',
      'apply-camera-delay',
      'reset-camera-delay',
      'reuse-camera-delay',
    ])
      (find(id) as HTMLInputElement | HTMLButtonElement).disabled =
        !state().ready || !state().adjustable || recording || finishing;
    (find('record-delay-clip') as HTMLButtonElement).disabled = !state().ready;
    if (clip.state === 'ready' && markerCount !== clip.keys.length) {
      markerCount = clip.keys.length;
      find('clip-markers').replaceChildren(
        ...clip.keys.map((event, i) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.keyIndex = String(i);
          button.textContent = `${event.key === ' ' ? 'Space' : event.key.toUpperCase()} · ${Math.round(event.at - (clip.frames[0]?.basisAt ?? event.at))} ms`;
          button.onclick = () => {
            selectedKey = i;
            align();
          };
          return button;
        }),
      );
    }
    if (clip.state === 'ready' && !reviewed) {
      reviewed = true;
      selectedKey = clip.keys.length ? 0 : -1;
      current = 0;
      align();
    }
  }
  function discard() {
    pause();
    paintRevision++;
    reviewed = false;
    markerCount = -1;
    selectedKey = -1;
    current = 0;
    clip.discard();
    input.value = String(state().delayMs);
    status.textContent = `Applied: ${state().delayMs} ms. ${state().scope}`;
    canvas.width = 0;
    canvas.height = 0;
    delete canvas.dataset.frameId;
    delete canvas.dataset.basisAt;
    delete canvas.dataset.effectiveAt;
    find('clip-markers').replaceChildren();
    find('clip-event-timeline').replaceChildren();
  }
  function record() {
    discard();
    clip.start();
    keys.focus();
  }
  function refresh() {
    input.value = String(state().delayMs);
    status.textContent = `Applied: ${state().delayMs} ms. ${state().scope}`;
    const reuse = find<HTMLButtonElement>('reuse-camera-delay');
    reuse.hidden = state().reusable === undefined;
    reuse.textContent = `Reuse previous window delay (${state().reusable ?? 0} ms)`;
    update();
    if (clip.state === 'ready') align();
  }
  find('record-delay-clip').onclick = record;
  find('retake-delay-clip').onclick = record;
  find('stop-delay-clip').onclick = () => clip.stop();
  find('discard-delay-clip').onclick = discard;
  keys.onkeydown = (event) => {
    if (
      event.isComposing ||
      event.repeat ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.key.length !== 1
    )
      return;
    event.preventDefault();
    clip.key({
      key: event.key,
      code: event.code,
      at: keyTime(event, performance.now(), performance.timeOrigin),
    });
  };
  input.oninput = () => {
    status.textContent = `Previewing ${candidate()} ms on this clip. Applied value remains ${state().delayMs} ms until saved.`;
    align();
  };
  find('apply-camera-delay').onclick = () => {
    if (!isCameraDelay(input.valueAsNumber)) {
      status.textContent = `Enter a whole number from 0 to ${MAX_CAMERA_DELAY_MS} ms.`;
      return;
    }
    apply(input.valueAsNumber);
    refresh();
  };
  find('reset-camera-delay').onclick = () => {
    apply(0);
    refresh();
  };
  find('cancel-camera-delay').onclick = () => {
    discard();
    refresh();
  };
  find('reuse-camera-delay').onclick = () => {
    const value = state().reusable;
    if (value !== undefined) apply(value);
    refresh();
  };
  find('clip-prev').onclick = () => {
    pause();
    current = Math.max(0, current - 1);
    draw();
  };
  find('clip-next').onclick = () => {
    pause();
    current = Math.min(clip.frames.length - 1, current + 1);
    draw();
  };
  scrub.oninput = () => {
    pause();
    const target = (clip.frames[0]?.basisAt ?? 0) + scrub.valueAsNumber;
    current = clipFrameForKey(clip.frames, target, 0, Infinity);
    if (current < 0) current = 0;
    draw();
  };
  find('clip-play').onclick = () => {
    if (playing) {
      pause();
      return;
    }
    if (current === clip.frames.length - 1) current = 0;
    playing = true;
    find('clip-play').textContent = 'Pause';
    const origin = performance.now();
    const start = clip.frames[current]?.basisAt ?? 0;
    const rate = Number(speed.value);
    const tick = () => {
      if (!playing) return;
      const at = start + (performance.now() - origin) * rate;
      const next = clip.frames.findLastIndex((frame) => frame.basisAt <= at);
      if (next >= 0 && next !== current) {
        current = next;
        draw();
      }
      if (at >= (clip.frames.at(-1)?.basisAt ?? at)) {
        pause();
        return;
      }
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
  };
  speed.onchange = pause;
  refresh();
  return {
    refresh,
    discard,
    capture: (
      video: HTMLVideoElement,
      timing: Pick<Frame, 'at' | 'clock' | 'timing'>,
      crop: Crop,
      rotation: number,
    ) => clip.capture(video, timing, crop, rotation),
  };
}
