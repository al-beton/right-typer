import { hardwareKeys, HARDWARE, type HardwareKey } from './view/hardware';
import {
  PRESETS,
  calibrationCodes,
  characterKey,
  coverage,
  displayCharacters,
  calibrationGeometrySignature,
  profileFingers,
  resolveEvent,
} from './core/profile';
import { profileControls } from './view/profiles';
import './style.css';
import './view/brand.css';
import { brandWordmark } from './view/brand';
import { orderedFingers, fingerBackground, readFingerPalette } from './view/finger-colours';
import { drawCalibrationDot } from './view/calibration-dot';
import { SampleRecorder } from './recording/recorder';
import { unrotatePoint, isCameraRotation } from './view/rotation';
import { Camera } from './tracking/camera';
import { keyTime } from './tracking/timing';
import {
  DIGITS,
  allowedFingers,
  MODES,
  isFingeringMode,
  policyLabel,
  LANDMARK_TIPS,
  fingerName,
  intended,
  keyName,
} from './core/keyboard';
import { validCalibration } from './core/calibration';
import { Exercise, feedback } from './core/exercise';
import { load, reset, save } from './core/storage';
import type { Calibration, Frame, Point, Press } from './core/types';
import { Progress, getCohort, signature } from './curriculum/progress';
import { currentRound, completeRound, roundWords, missingOutputs } from './curriculum/selection';
import { ProgressStore } from './curriculum/storage';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
let saved = load();
let profile =
  [...PRESETS, ...(saved.customProfiles ?? [])].find((p) => p.id === saved.profileId) ??
  PRESETS[0]!;
saved.profileId = profile.id;
let CALIBRATION_KEYS = calibrationCodes(profile);
const physicalLabel = (code: string) => {
  if (code === 'Space') return 'space';
  const key = profile.keys.find((k) => k.code === code);
  const characters = key ? displayCharacters(key) : [];
  return characters?.length ? [...new Set(characters)].join(' / ') : code.replace('-', ' ');
};
const fingersForText = (text: string) =>
  profileFingers(profile, characterKey(profile, text)?.code ?? '', fingeringMode);
const hintForText = (text: string) =>
  text === ' ' ? 'either thumb' : fingersForText(text).map(fingerName).join(' or ');
let fingeringMode = saved.fingeringMode ?? 'standard';
let cameraRotation = saved.cameraRotation ?? 0;
let autoStartPending = saved.practiceEnabled ?? !!saved.calibration;
let selectedCamera = saved.cameraDeviceId ?? saved.calibration?.deviceId ?? '';
let phase: 'setup' | 'calibrate' | 'verify' | 'practice' | 'results' = 'setup';
let calibration: Calibration | undefined;
let disconnectedDraft: Calibration | undefined;
let points: Record<string, Point> = {};
let selectedKey = 0;
let swapHands = saved.calibration?.swapHands ?? false;
const progressStore = new ProgressStore(showStorageWarning);
const progressSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]!;
let progress = new Progress(
  getCohort(progressStore.data, signature(profile, fingeringMode), progressSeed()),
  () => progressStore.schedule(),
);
let round = currentRound(progress.cohort, profile);
let exercise = new Exercise(roundWords(round), fingeringMode);
function selectCourse() {
  const identity = signature(profile, fingeringMode);
  if (identity === progress.cohort.signature) return;
  progress.abandon();
  progress = new Progress(getCohort(progressStore.data, identity, progressSeed()), () =>
    progressStore.schedule(),
  );
  round = currentRound(progress.cohort, profile);
  exercise = new Exercise(roundWords(round), fingeringMode);
  resuming = false;
  if (phase === 'results') phase = 'verify';
  progressStore.flush();
}
let resuming = false;
let setupOpen = true;
let message = saved.migrationNotice ?? '';
let storageWarning = '';
let boundaryKeys = 0;
let diagnosticsId = -1;
let cameraErrorHandled = false;
let resetArmed = false;
let sample: SampleRecorder | undefined;
const openDebugging = new URLSearchParams(location.search).get('record') === '1';

$('#app').innerHTML = `
  <header class="topbar"><h1 class="brand" aria-label="Right Typer"><span aria-hidden="true">${brandWordmark()}</span></h1><nav aria-label="App"><a href="https://github.com/al-beton/right-typer" target="_blank" rel="noreferrer">Source</a><button id="settings-open" class="text-button">Settings & progress</button></nav></header>
  <main>
    <div id="content" aria-label="Typing practice"></div>
    <section id="finger-map" aria-label="Intended finger map"></section><p id="keyboard-caption"></p>
    <section id="camera-section" aria-label="Live camera and finger tracking">
      <div id="camera-preview"></div><div class="camera-strip-info"><span id="camera-badge">Camera off</span><p>Frames stay in this browser.</p><button id="camera-settings" class="text-button">Camera settings</button><button id="sample-indicator" class="text-button" hidden></button></div>
    </section>
    <div id="storage-warning" class="storage-alert" role="status" hidden></div>
  </main>
  <dialog id="settings" aria-labelledby="settings-title"><div class="drawer-header"><h2 id="settings-title" tabindex="-1">Settings & progress</h2><button id="settings-close">Close</button></div><p id="settings-state">Changes stay in this browser.</p>
    <details id="camera-group"><summary>Camera & key positions</summary>
      <div class="camera-layout"><div id="mapping-host">
        <div class="view-wrap" id="view-wrap"><div id="camera-image"><video id="camera" autoplay playsinline muted aria-label="Live view of your keyboard"></video><canvas id="overlay" aria-label="Keyboard calibration. Click the center of the requested key, or use arrow keys and Enter." tabindex="0"></canvas></div><div class="camera-empty" id="camera-empty"><strong>Allow camera access</strong><span>Tilt your MacBook screen toward the keyboard.<br/>Use your external display for this page.</span></div></div>
        </div><aside>
          <div class="camera-options"><label for="camera-rotation">Rotate camera view</label><select id="camera-rotation"><option value="0">0°</option><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">270° clockwise</option></select><button id="swap" aria-pressed="false">Swap left/right hand labels</button></div>
          <div id="camera-controls"><label for="device">Camera</label><select id="device"><option value="">MacBook / default camera</option></select><button id="start-camera">Enable camera</button><button id="disconnect-camera" hidden>Disconnect camera</button></div>
          <div id="setup-panel"></div>
          <p id="tracking-readout">Camera frames stay in this browser.</p>
        </aside>
      </div>
    </details>
    <details id="keyboard-group"><summary>Keyboard & fingering</summary>    <div class="fingering-control"><label for="fingering-mode">Fingering</label><select id="fingering-mode">${Object.entries(
      MODES,
    )
      .map(([value, name]) => `<option value="${value}">${name}</option>`)
      .join('')}</select><span id="policy-status" role="status"></span></div>
    <section id="profile-settings" aria-label="Keyboard settings"></section>
</details>
    <details id="history-group"><summary>Practice & history</summary><div id="history-list"></div></details>
    <details id="debugging"><summary>Debugging</summary><section id="sample-panel" aria-label="Debug sample recording"></section></details>
    <details id="about-group"><summary>Local data & about</summary><p id="data-notice"></p><a href="https://github.com/al-beton/right-typer">Source on GitHub</a>
    <footer><span>Local processing · Keyboard profiles · Chrome</span><button class="text-button" id="reset">Reset local data</button><span id="build-version" aria-label="App version">${import.meta.env.VITE_BUILD_LABEL} · <a href="https://github.com/al-beton/right-typer/commit/${import.meta.env.VITE_BUILD_SHA}" title="${import.meta.env.VITE_BUILD_SHA}">${import.meta.env.VITE_BUILD_SHA.slice(0, 7)}</a></span></footer>
    </details><button id="settings-resume" class="primary">Close & resume</button>
  </dialog>`;
const video = $<HTMLVideoElement>('#camera');
const canvas = $<HTMLCanvasElement>('#overlay');
const camera = new Camera(video, cameraChanged, drawFrame);
const fingerPalette = readFingerPalette(getComputedStyle(document.documentElement));
const content = $('#content');
const settings = $<HTMLDialogElement>('#settings');
let settingsOpener: HTMLElement | null = null;
const heldActivations = new Set<string>();
const blockedActivations = new Set<string>();
document.addEventListener(
  'keydown',
  (event) => {
    if (event.key === ' ' || event.key === 'Enter') heldActivations.add(event.key);
  },
  true,
);
document.addEventListener(
  'keyup',
  (event) => {
    heldActivations.delete(event.key);
    if (blockedActivations.delete(event.key)) event.preventDefault();
  },
  true,
);
function moveCamera() {
  $(settings.open ? '#mapping-host' : '#camera-preview').append($('#view-wrap'));
  canvas.tabIndex = settings.open ? 0 : -1;
  layoutCameraView();
  if (video.srcObject) void video.play().catch(() => {});
}
function openSettings(
  group = 'camera-group',
  opener = document.activeElement as HTMLElement | null,
) {
  if (!settings.open) {
    settingsOpener = opener;
    if (phase === 'practice') pause(false);
    disableAutoStart();
    settings.showModal();
    document.body.classList.add('settings-open');
  }
  $<HTMLDetailsElement>(`#${group}`).open = true;
  moveCamera();
  render();
  const summary = $<HTMLElement>(`#${group} > summary`);
  summary.focus({ preventScroll: true });
  summary.scrollIntoView({ block: 'nearest' });
}
function closeSettings(resume = false) {
  for (const key of heldActivations) blockedActivations.add(key);
  settings.close();
  document.body.classList.remove('settings-open');
  moveCamera();
  render();
  if (resume && ready()) startPractice();
  else {
    const opener = settingsOpener?.isConnected
      ? settingsOpener
      : settingsOpener?.id
        ? document.getElementById(settingsOpener.id)
        : null;
    (opener ?? $('#settings-open')).focus({ preventScroll: true });
  }
}
$('#settings-open').onclick = () => openSettings();
$('#camera-settings').onclick = () => openSettings('camera-group');
$('#sample-indicator').onclick = () => openSettings('debugging');
$('#settings-close').onclick = () => closeSettings();
$('#settings-resume').onclick = () => closeSettings(true);
settings.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const controls = [
    ...settings.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, a[href], summary, [tabindex="0"]',
    ),
  ].filter((el) => !el.matches(':disabled') && el.getClientRects().length > 0);
  const first = controls[0],
    last = controls.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === settings)) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
});
settings.addEventListener('cancel', (event) => {
  event.preventDefault();
  if (!$('#profile-editor').hidden) {
    profilesUI.closeEditor();
    $('#custom-layout').focus();
  } else closeSettings();
});
const rotationControl = $<HTMLSelectElement>('#camera-rotation');
rotationControl.value = String(cameraRotation);
function layoutCameraView() {
  const stage = $('#view-wrap');
  const aspect =
    video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3;
  const sideways = cameraRotation === 90 || cameraRotation === 270;
  const width = Math.min(
    sideways ? stage.clientHeight : stage.clientWidth,
    (sideways ? stage.clientWidth : stage.clientHeight) * aspect,
  );
  const image = $('#camera-image');
  image.style.width = `${width}px`;
  image.style.height = `${width / aspect}px`;
  image.style.transform = `translate(-50%, -50%) rotate(${cameraRotation}deg)`;
}
new ResizeObserver(layoutCameraView).observe($('#view-wrap'));
video.addEventListener('loadedmetadata', layoutCameraView);
rotationControl.onchange = () => {
  const angle = Number(rotationControl.value);
  if (!isCameraRotation(angle)) return;
  void sample?.stop('camera-view-changed');
  cameraRotation = angle;
  saved.cameraRotation = angle;
  store();
  layoutCameraView();
  if (camera.latest) drawOverlay(camera.latest);
};

function showStorageWarning() {
  const element = document.querySelector<HTMLElement>('#storage-warning');
  if (!element) return;
  element.textContent = [storageWarning, progressStore.notice].filter(Boolean).join(' ');
  element.hidden = !element.textContent;
}
function store() {
  if (!save(saved))
    storageWarning =
      'Local storage is unavailable. This session still works; calibration will not survive a reload.';
  showStorageWarning();
}
function keyboard() {
  const key = (draw: HardwareKey) => {
    const k = draw.code;
    const contextual = !profile.keys.some((key) => key.code === k);
    const fingers = orderedFingers(profileFingers(profile, k, fingeringMode));
    const label =
      k === 'Space'
        ? 'either thumb'
        : profileFingers(profile, k, fingeringMode).map(fingerName).join(' or ');
    const names = fingers.map(fingerName);
    const [first, second] = fingers;
    const compactLabel =
      k === 'Space'
        ? label
        : first && second && first.split('-')[0] === second.split('-')[0]
          ? `${names[0]}/${second.split('-')[1]}`
          : first && second && first.split('-')[1] === second.split('-')[1]
            ? `left/right ${first.split('-')[1]}`
            : names.join('/');
    const background = `background:${fingerBackground(fingers)}`;
    // Hardware legends only: regional letters/symbols and output semantics stay intact.
    const legend = draw.legends
      .map((text, i) => `<span class="legend-${i}">${escapeHtml(text)}</span>`)
      .join('');
    return `<span class="key ${contextual ? 'context-key' : k === 'Space' ? 'space-key' : `finger-${fingers[0]}`} ${draw.isoReturn ? 'iso-return' : ''}" style="${contextual ? '' : background};--notch:${25 / draw.width}%" title="${escapeHtml(contextual ? draw.legends.join(' / ') : label)}" aria-label="${escapeHtml(k === 'Space' ? 'Space' : draw.legends.join(' / '))}${contextual ? '' : ': ' + label}" data-key="${k}"><b aria-hidden="true">${legend}</b>${contextual ? '' : `<small${fingers.length > 1 && k !== 'Space' ? ' data-multiple' : ''}>${compactLabel}</small>`}</span>`;
  };
  const visibleKeys = hardwareKeys(profile);
  const minX = Math.min(...visibleKeys.map((k) => k.x)),
    minY = Math.min(...visibleKeys.map((k) => k.y));
  const width = Math.max(...visibleKeys.map((k) => k.x + k.width)) - minX;
  const height = Math.max(...visibleKeys.map((k) => k.y + k.height)) - minY;
  return `<div class="keyboard physical-keyboard ${HARDWARE[profile.id] ? 'hardware-block' : ''}" style="aspect-ratio:${width}/${height}">${visibleKeys.map((k) => `<div class="physical-position" style="left:${((k.x - minX) / width) * 100}%;top:${((k.y - minY) / height) * 100}%;width:${(k.width / width) * 100}%;height:${(k.height / height) * 100}%">${key(k)}</div>`).join('')}</div>`;
}
const modeControl = $<HTMLSelectElement>('#fingering-mode');
modeControl.value = fingeringMode;
modeControl.onchange = () => {
  if (!isFingeringMode(modeControl.value)) return;
  void sample?.stop('fingering-mode-changed');
  fingeringMode = modeControl.value;
  saved.fingeringMode = fingeringMode;
  selectCourse();
  progress.abandon();
  exercise.changeMode(fingeringMode);
  diagnosticsId--;
  boundaryKeys = 0;
  message =
    phase === 'results'
      ? `${MODES[fingeringMode]} selected for your next practice.`
      : phase === 'practice' || resuming
        ? `${MODES[fingeringMode]} selected. Fresh attempt at this word; completed work is kept.`
        : `${MODES[fingeringMode]} fingering selected.`;
  $('#policy-status').textContent =
    phase === 'results'
      ? 'Applies to your next practice.'
      : phase === 'practice' || resuming
        ? 'Fresh attempt; completed work kept.'
        : 'Fingering updated.';
  $('#finger-map').innerHTML = keyboard();
  store();
  render();
  modeControl.focus({ preventScroll: true });
};
function setPhase(next: typeof phase) {
  phase = next;
  render();
}
function render() {
  const focused = document.activeElement as HTMLElement | null;
  const ownedTypingFocus =
    !settings.open && (!focused || focused === document.body || focused.id === 'typing');
  const focusedControl =
    content.contains(focused) && focused?.id !== 'typing' ? focused?.id : undefined;
  const previousInput = document.querySelector<HTMLInputElement>('#typing');
  updateSampleControls();
  canvas.classList.toggle('calibrating', settings.open && phase === 'calibrate');
  $<HTMLSelectElement>('#device').disabled = phase === 'practice';
  $<HTMLButtonElement>('#start-camera').disabled =
    phase === 'practice' || camera.status === 'loading';
  renderSetup();
  const practicing = phase === 'practice';
  const complete = phase === 'results';
  const retry = practicing && exercise.state === 'retry';
  const checking = practicing && exercise.state === 'checking';
  const stats = exercise.stats(performance.now());
  const last = saved.results.at(-1);
  const action = practicing
    ? '<button class="text-button" id="pause">Pause</button>'
    : complete
      ? '<button class="primary" id="restart">Next round</button>'
      : `<button class="primary" id="practice" ${ready() ? '' : 'disabled'}>${resuming ? 'Resume practice' : 'Start practice'}</button>`;
  const feedbackText = complete
    ? `Round complete · ${stats.wpm.toFixed(1)} WPM · ${stats.retries} retries. All words accepted. Camera detection can be wrong.`
    : retry
      ? feedback(exercise.lastVerdict!, exercise.words[exercise.index]!, exercise.attempt.mode)
      : checking
        ? 'Checking fingers. Wait for the next word.'
        : practicing
          ? message || 'Type the whole word, then Space.'
          : flowMessage();
  content.innerHTML = `<section class="practice${complete ? ' results' : ''}">
    <div class="practice-top"><span class="practice-metrics">Practice · <span>${exercise.index} / ${exercise.words.length} words</span><span>${stats.retries} retries</span></span>${action}</div>
    <p id="round-focus" class="recent">${escapeHtml(`${complete ? 'Next round' : `Round ${round.sequence}`} · Focus: ${keyName((complete ? progress.cohort.course.round! : round).focus)} · ${progress.cohort.course.included} keys. ${(complete ? progress.cohort.course.round! : round).introduced ? `New key: ${keyName((complete ? progress.cohort.course.round! : round).introduced!)}. Text and timing readiness earned.` : 'Build steady, accurate responses.'}`)}</p>
    ${passageMarkup()}
    <div class="entry-heading"><label for="typing">${complete ? 'Completed' : retry ? 'Try again' : 'Your word'}</label><span id="word-hint">Space finishes each word.</span></div>
    <div class="word-entry ${retry ? 'needs-retry' : ''}"><input id="typing" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Type the current word" aria-describedby="word-hint${complete ? '' : ' current-target'}" placeholder="${complete ? 'Passage complete' : practicing ? 'type here' : resuming ? 'Paused' : 'Ready when you are'}" /></div>
    <div id="feedback" class="feedback ${retry ? 'mistake' : ''}"><span id="ready-message" role="status">${escapeHtml(feedbackText)}</span>${retry ? '<button class="primary" id="retry">Retry word <span>Space</span></button>' : !practicing && !complete && !ready() && camera.status !== 'loading' ? `<button class="text-button" id="setup-next">${camera.status === 'ready' ? 'Map keys' : 'Camera settings'}</button>` : ''}</div>
    <p id="input-message" class="input-message" role="status"></p>
    ${retry ? `<details id="attempt-evidence"><summary>Attempt details</summary>${attemptDetails()}</details>` : ''}
    ${last && !practicing ? `<p class="recent">Last practice: ${policyLabel(last.fingeringModes ?? ['standard'])} · ${last.wpm.toFixed(1)} WPM · ${last.retries} retries${last.gradingPolicy !== 'wrong-finger-veto' ? ' · Earlier rule: unknown presses required retries' : ''}</p>` : ''}
  </section>`;
  const placeholder = $<HTMLInputElement>('#typing');
  const input = previousInput ?? placeholder;
  if (previousInput) {
    previousInput.placeholder = placeholder.placeholder;
    previousInput.setAttribute(
      'aria-describedby',
      complete ? 'word-hint' : 'word-hint current-target',
    );
    placeholder.replaceWith(previousInput);
  }
  input.disabled = !practicing;
  input.readOnly = retry || checking;
  input.value = complete ? '' : exercise.attempt.text;
  input.onkeydown = typing;
  input.onblur = () => progress.breakTiming();
  input.onkeyup = (event) => recordKey(event, 'keyup');
  input.onbeforeinput = (event) => event.preventDefault();
  if (!previousInput)
    input.addEventListener('compositionstart', () => {
      $('#input-message').textContent =
        'Composition cannot be graded. Use a direct input source or edit your keyboard profile.';
    });
  input.onpaste = (event) => {
    event.preventDefault();
    $('#input-message').textContent =
      'Type each character so its finger can be observed. Pasting is not graded.';
  };
  input.ondrop = (event) => event.preventDefault();
  if (practicing) {
    $('#pause').onclick = () => pause();
    if (retry) $('#retry').onclick = retryWord;
    updateTyped();
    if (ownedTypingFocus) input.focus({ preventScroll: true });
  } else if (complete) {
    $('#restart').onclick = () => {
      void sample?.stop('passage-restarted');
      disableAutoStart();
      resuming = false;
      exercise = new Exercise(
        roundWords((round = currentRound(progress.cohort, profile))),
        fingeringMode,
      );
      message = '';
      if (ready()) startPractice();
      else setPhase(camera.status === 'ready' ? 'verify' : 'setup');
    };
  } else $('#practice').onclick = startPractice;
  const next = document.querySelector<HTMLButtonElement>('#setup-next');
  if (next) next.onclick = editSetup;
  const passage = $('.passage'),
    activeWord = document.querySelector<HTMLElement>('.passage .active');
  if (activeWord) passage.scrollTop = Math.max(0, activeWord.offsetTop - passage.clientHeight / 2);
  $('#keyboard-caption').textContent = `${profile.name} · ${MODES[fingeringMode]} fingering`;
  $('#settings-state').textContent = complete
    ? 'Practice complete. Review results in Practice & history.'
    : resuming
      ? 'Practice paused. Completed words are kept.'
      : 'Setup and preferences stay in this browser.';
  $<HTMLButtonElement>('#settings-resume').disabled = !ready();
  $('#settings-resume').textContent = complete
    ? 'Close & practise again'
    : resuming
      ? 'Close & resume'
      : 'Close & start practice';
  $('#data-notice').textContent =
    storageWarning ||
    progressStore.notice ||
    saved.migrationNotice ||
    'Reset clears calibration, preferences, custom profiles, adaptive progress and result history on this device.';
  renderHistory();
  if (!practicing)
    document
      .querySelectorAll<HTMLElement>('[data-key]')
      .forEach((el) => el.classList.remove('next-key'));
  if (camera.latest) drawOverlay(camera.latest);
  if (!settings.open && focusedControl)
    document.getElementById(focusedControl)?.focus({ preventScroll: true });
  else if (complete && ownedTypingFocus) $('#restart').focus({ preventScroll: true });
}
function renderHistory() {
  const opened = [...$('#history-list').querySelectorAll('details')].map((el) => el.open);
  $('#history-list').innerHTML = saved.results.length
    ? [...saved.results]
        .reverse()
        .map(
          (result) =>
            `<details><summary>${escapeHtml(result.date.slice(0, 10))} · ${result.wpm.toFixed(1)} WPM · ${result.retries} retries</summary><p class="result-note">${policyLabel(result.fingeringModes ?? ['standard'])} · ${result.attempts} submitted attempts · ${formatTime(result.elapsedMs)} elapsed${result.gradingPolicy !== 'wrong-finger-veto' ? ' · Earlier rule: unknown presses required retries' : ''}</p><p class="result-grid">${result.wrongFingers} wrong-finger presses · ${result.textMistakes} text-mismatch attempts · ${result.uncertainPresses} unverified presses</p></details>`,
        )
        .join('')
    : '<p>No completed practice yet.</p>';
  $('#history-list').insertAdjacentHTML(
    'beforeend',
    '<details><summary>How results are counted</summary><p>WPM = accepted characters (including spaces) ÷ 5 ÷ elapsed minutes. Time includes retries, feedback and pauses, from the first character to the final space. Wrong-finger and unverified counts include erased keys and spaces in all submitted attempts. Text mistakes count attempts with mismatched text. An attempt can include both mistakes and unknown observations. Unverified presses remain unknown and do not cause retries. Camera detection can be wrong.</p></details>',
  );
  $('#history-list')
    .querySelectorAll('details')
    .forEach((el, i) => {
      el.open = opened[i] ?? false;
    });
}
function formatTime(ms: number) {
  return `${Math.floor(ms / 60000)}m ${Math.floor(ms / 1000) % 60}s`;
}
function sameCamera(c: Calibration) {
  const s = camera.settings();
  return (
    !!c.profile &&
    calibrationGeometrySignature(c.profile) === calibrationGeometrySignature(profile) &&
    s?.deviceId === c.deviceId &&
    video.videoWidth === c.width &&
    video.videoHeight === c.height
  );
}
function makeCalibration(): Calibration {
  return {
    version: 1,
    profile: structuredClone(profile),
    points: structuredClone(points),
    deviceId: camera.settings()?.deviceId ?? '',
    width: video.videoWidth,
    height: video.videoHeight,
    swapHands,
    savedAt: Date.now(),
  };
}
function draftValid() {
  return validCalibration(makeCalibration());
}
function startCalibration() {
  disableAutoStart();
  setupOpen = true;
  void sample?.stop('calibration-changed');
  points = {};
  calibration = undefined;
  selectedKey = 0;
  message = '';
  setPhase('calibrate');
}
function ready() {
  return (
    camera.status === 'ready' &&
    missingOutputs(progress.cohort, profile).length === 0 &&
    draftValid()
  );
}
function passageMarkup() {
  return `<div class="passage" aria-label="Practice passage">${exercise.words.map((w, i) => `<span class="${i < exercise.index ? 'passed' : i === exercise.index ? 'active' : ''}" ${i === exercise.index ? 'id="current-target" aria-current="step"' : ''}>${w}</span>`).join(' ')}</div>`;
}
function flowMessage() {
  if (camera.status === 'loading') return 'Starting camera…';
  if (camera.status !== 'ready')
    return camera.status === 'error' ? camera.error : 'Connect the camera to practise.';
  if (missingOutputs(progress.cohort, profile).length)
    return `Missing practice characters: ${missingOutputs(progress.cohort, profile).join(' ')}. Adjust your keyboard profile; saved progress is preserved.`;
  if (!draftValid())
    return Object.keys(points).length === CALIBRATION_KEYS.length
      ? 'Adjust overlapping dots or flat rows in the camera image.'
      : `Mark the key centres in the camera image (${Object.keys(points).length} / ${CALIBRATION_KEYS.length}).`;
  return resuming
    ? 'Paused. Resume starts this word afresh; completed words are kept.'
    : 'Key positions ready. Start when you’re ready to type.';
}
function editSetup() {
  openSettings('camera-group');
  void sample?.stop('edit-setup');
  disableAutoStart();
  if (phase === 'practice') {
    progress.abandon();
    exercise.pause();
    resuming = true;
  } else if (phase === 'results') {
    exercise = new Exercise(
      roundWords((round = currentRound(progress.cohort, profile))),
      fingeringMode,
    );
    resuming = false;
  }
  setupOpen = true;
  diagnosticsId--;
  message = '';
  setPhase(camera.status === 'ready' ? (draftValid() ? 'verify' : 'calibrate') : 'setup');
  const target = camera.status === 'ready' ? canvas : $('#start-camera');
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'center' });
}
function renderSetup() {
  diagnosticsId--; // Discard optional checks when setup changes.
  const editing = phase === 'calibrate';
  const count = Object.keys(points).length;
  const complete = ready();
  const locked = phase === 'practice' || phase === 'results';
  const showMapping = !locked && (setupOpen || !complete);
  $('#setup-panel').innerHTML = `
    <p id="setup-message" role="status">${escapeHtml(locked ? 'Keep the camera and keyboard still.' : message)}</p>
    <button id="edit-map" ${showMapping ? 'hidden' : ''} ${!complete ? 'disabled' : ''}>Edit key positions</button>
    <div id="mapping-editor" ${showMapping ? '' : 'hidden'}>
    <div class="mapping-heading"><strong id="requested-key">${editing ? `Mark ${escapeHtml(physicalLabel(CALIBRATION_KEYS[selectedKey]!))} in the image` : 'Key positions'}</strong><span>${count} / ${CALIBRATION_KEYS.length}</span></div>
    <div class="cal-keys" aria-label="Choose a key to edit">${CALIBRATION_KEYS.map((k, i) => `<button class="cal-key ${points[k] ? 'mapped' : ''} ${editing && i === selectedKey ? 'selected' : ''}" data-cal="${i}" aria-label="Map ${escapeHtml(physicalLabel(k))}" aria-pressed="${editing && i === selectedKey}" ${camera.status !== 'ready' || locked ? 'disabled' : ''}>${k.startsWith('space') ? (k.endsWith('left') ? 'space ◂' : 'space ▸') : escapeHtml(physicalLabel(k))}<span aria-hidden="true" style="visibility:${points[k] ? 'visible' : 'hidden'}"> ✓</span></button>`).join('')}</div>
    <p id="cal-message">Click key centres and both ends of space. Select a key to adjust it. Arrows nudge; Enter selects the next.</p>
    <button id="remap" ${camera.status !== 'ready' || locked ? 'disabled' : ''}>Remap key positions</button>
    </div>
    <label for="diagnostic">Check an observed finger</label><input id="diagnostic" placeholder="Focus here and press a key" autocomplete="off" readonly ${!complete || locked ? 'disabled' : ''} /><p>Optional check; not required to begin practice.</p><p id="diagnostic-result" role="status"></p>`;
  $('#diagnostic').onkeydown = diagnostic;
  $('#edit-map').onclick = editSetup;
  $('#setup-panel')
    .querySelectorAll<HTMLButtonElement>('[data-cal]')
    .forEach((el) => {
      el.onclick = () => {
        void sample?.stop('calibration-changed');
        selectedKey = Number(el.dataset.cal);
        phase = 'calibrate';
        render();
        canvas.focus({ preventScroll: true });
      };
    });
  $('#remap').onclick = () => {
    startCalibration();
    canvas.focus({ preventScroll: true });
  };
  $<HTMLButtonElement>('#swap').disabled = !complete || locked;
  $('#swap').setAttribute('aria-pressed', String(swapHands));
  $('#swap').textContent = `${swapHands ? 'Restore' : 'Swap'} left/right hand labels`;
  $('#swap').onclick = () => {
    void sample?.stop('hand-labels-changed');
    swapHands = !swapHands;
    calibration = makeCalibration();
    camera.evidence.reset();
    renderSetup();
  };
}
function startPractice() {
  if (!ready()) return;
  if (settings.open) {
    closeSettings(true);
    return;
  }
  for (const key of heldActivations) blockedActivations.add(key);
  setupOpen = false;
  calibration = makeCalibration();
  saved.calibration = calibration;
  saved.calibrations = { ...saved.calibrations, [profile.id]: calibration };
  saved.practiceEnabled = true;
  autoStartPending = false;
  store();
  progress.abandon();
  camera.evidence.reset();
  message = '';
  boundaryKeys = 0;
  if (resuming && exercise.state !== 'complete') exercise.retry();
  else
    exercise = new Exercise(
      roundWords((round = currentRound(progress.cohort, profile))),
      fingeringMode,
    );
  resuming = false;
  setPhase('practice');
  $('#typing').focus({ preventScroll: true });
  $('#typing').scrollIntoView({ block: 'nearest' });
}
function disableAutoStart() {
  autoStartPending = false;
  saved.practiceEnabled = false;
  store();
}
function updateCameraChoices() {
  const select = $<HTMLSelectElement>('#device');
  // Keep recovery available even if the remembered camera is disconnected.
  select.innerHTML = `<option value="">Default camera</option>${selectedCamera ? `<option value="${escapeHtml(selectedCamera)}">Saved camera</option>` : ''}`;
  select.value = selectedCamera;
  navigator.mediaDevices
    ?.enumerateDevices()
    .then((devices) => {
      const cameras = devices.filter((d) => d.kind === 'videoinput' && d.deviceId);
      select.innerHTML =
        `<option value="">Default camera</option>` +
        cameras
          .map(
            (d) =>
              `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || 'Camera')}</option>`,
          )
          .join('') +
        (selectedCamera && !cameras.some((d) => d.deviceId === selectedCamera)
          ? `<option value="${escapeHtml(selectedCamera)}">Saved camera (unavailable)</option>`
          : '');
      select.value = selectedCamera;
    })
    .catch(() => {});
}
function cameraChanged() {
  $('#disconnect-camera').hidden = !['loading', 'ready'].includes(camera.status);
  $('#camera-empty strong').textContent = saved.cameraDisconnected
    ? 'Camera disconnected'
    : 'Allow camera access';
  if (camera.status !== 'ready') {
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    $('#camera-badge').classList.remove('good');
  }
  if (camera.status !== 'ready') void sample?.stop('camera-stopped');
  $('#camera-empty').hidden = camera.status === 'ready';
  if (camera.status !== 'ready')
    $('#tracking-readout').textContent = 'Camera frames stay in this browser.';
  $('#camera-badge').textContent =
    camera.status === 'loading'
      ? 'Loading local model…'
      : camera.status === 'ready'
        ? 'Camera live'
        : camera.status === 'error'
          ? 'Camera needs attention'
          : saved.cameraDisconnected
            ? 'Camera disconnected'
            : 'Camera off';
  $<HTMLButtonElement>('#start-camera').disabled = camera.status === 'loading';
  $('#start-camera').textContent =
    camera.status === 'loading'
      ? 'Starting…'
      : camera.status === 'ready'
        ? 'Restart camera'
        : saved.cameraDisconnected
          ? 'Reconnect camera'
          : 'Enable camera';
  if (camera.status === 'error') {
    message = camera.error;
    if (!cameraErrorHandled && ['practice', 'verify', 'calibrate'].includes(phase)) {
      cameraErrorHandled = true;
      if (phase === 'practice') {
        progress.abandon();
        exercise.pause();
        resuming = true;
      }
      phase = 'setup';
    }
  }
  if (camera.status === 'ready') {
    cameraErrorHandled = false;
    selectedCamera = camera.settings()?.deviceId ?? selectedCamera;
    saved.cameraDeviceId = selectedCamera;
    store();
    message = 'Mark the key centres in the camera image. Keep the camera still.';
    const previous = disconnectedDraft ?? saved.calibration ?? saved.calibrations?.[profile.id];
    disconnectedDraft = undefined;
    if (previous && sameCamera(previous)) {
      calibration = { ...structuredClone(previous), profile: structuredClone(profile) };
      points = calibration.points;
      swapHands = calibration.swapHands;
      phase = validCalibration(calibration) ? 'verify' : 'calibrate';
      setupOpen = phase === 'calibrate';
      message = 'Saved positions loaded. Adjust the dots if the camera or keyboard moved.';
    } else {
      setupOpen = true;
      points = {};
      calibration = undefined;
      selectedKey = 0;
      phase = 'calibrate';
    }
    if (autoStartPending && !settings.open) {
      autoStartPending = false;
      if (calibration && ready()) startPractice();
      else disableAutoStart();
    }
  }
  if (camera.status === 'ready' || camera.status === 'error') updateCameraChoices();
  if (phase !== 'practice' && phase !== 'results') render();
}
function drawFrame(frame: Frame) {
  $('#camera-badge').textContent =
    frame.clock === 'unavailable'
      ? 'Capture timing unavailable'
      : `${frame.hands.length} hands detected`;
  $('#camera-badge').classList.toggle('good', frame.clock === 'capture');
  $('#tracking-readout').textContent =
    frame.clock === 'capture'
      ? `Capture → result ${Math.max(0, Math.round(frame.receivedAt - frame.at))} ms · ${frame.hands.length} hands`
      : 'Capture timing unavailable. Finger observations stay unknown.';
  drawOverlay(frame);
}
function drawOverlay(frame: Frame) {
  if (!video.videoWidth) return;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const pxy = (p: Point): [number, number] => [p.x * canvas.width, p.y * canvas.height];
  ctx.font = `${Math.max(12, canvas.width / 64)}px ui-monospace, monospace`;
  const uprightLabel = (x: number, y: number, paint: () => void) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((-cameraRotation * Math.PI) / 180);
    paint();
    ctx.restore();
  };
  for (const [key, point] of Object.entries(points)) {
    const [x, y] = pxy(point);
    const selected = phase === 'calibrate' && key === CALIBRATION_KEYS[selectedKey];
    drawCalibrationDot(
      ctx,
      x,
      y,
      profileFingers(profile, key.startsWith('space-') ? 'Space' : key, fingeringMode),
      fingerPalette,
      selected,
      cameraRotation,
    );
    uprightLabel(x, y, () => {
      ctx.fillStyle = '#0e251d';
      ctx.fillRect(-9, -25, key.startsWith('space') ? 28 : 19, 17);
      ctx.fillStyle = '#fff';
      ctx.fillText(
        key.startsWith('space') ? (key.endsWith('left') ? 'S◂' : 'S▸') : physicalLabel(key),
        -5,
        -12,
      );
    });
  }
  const connections = [
    [0, 1, 2, 3, 4],
    [0, 5, 6, 7, 8],
    [5, 9, 10, 11, 12],
    [9, 13, 14, 15, 16],
    [13, 17, 18, 19, 20],
    [0, 17],
  ];
  for (const hand of frame.hands) {
    const side = swapHands ? (hand.side === 'left' ? 'right' : 'left') : hand.side;
    ctx.strokeStyle = side === 'left' ? '#9fceff' : '#ffdc9f';
    ctx.lineWidth = 2;
    for (const chain of connections) {
      ctx.beginPath();
      chain.forEach((i, n) => {
        const p = hand.points[i];
        if (p) {
          const [x, y] = pxy(p);
          if (n === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }
    LANDMARK_TIPS.forEach((i, digit) => {
      const p = hand.points[i];
      if (!p) return;
      const [x, y] = pxy(p);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      if (phase !== 'practice') {
        uprightLabel(x, y, () => {
          ctx.fillStyle = '#fff';
          ctx.fillText(DIGITS[digit]!, 6, -5);
        });
      }
    });
    const wrist = hand.points[0];
    if (wrist) {
      const [x, y] = pxy(wrist);
      uprightLabel(x, y, () => {
        ctx.fillStyle = '#152d26';
        ctx.fillRect(-5, 5, 125, 23);
        ctx.fillStyle = '#fff';
        ctx.fillText(`${side} hand`, 0, 21);
      });
    }
  }
}
canvas.onclick = (event) => {
  if (!settings.open || phase !== 'calibrate') return;
  const box = canvas.getBoundingClientRect();
  points[CALIBRATION_KEYS[selectedKey]!] = unrotatePoint(
    {
      x: (event.clientX - box.left) / box.width,
      y: (event.clientY - box.top) / box.height,
    },
    cameraRotation,
  );
  selectedKey = Math.min(CALIBRATION_KEYS.length - 1, selectedKey + 1);
  const finished = draftValid();
  if (finished) {
    phase = 'verify';
    setupOpen = false;
  }
  message = '';
  render();
  if (finished) {
    $(settings.open ? '#settings-resume' : '#practice').focus({ preventScroll: true });
  }
};
canvas.onkeydown = (event) => {
  if (!settings.open || phase !== 'calibrate') return;
  if (event.key === 'Enter') {
    event.preventDefault();
    if (event.repeat) return;
    if (draftValid()) {
      setupOpen = false;
      setPhase('verify');
      $(settings.open ? '#settings-resume' : '#practice').focus({ preventScroll: true });
      return;
    }
    selectedKey = Math.min(CALIBRATION_KEYS.length - 1, selectedKey + 1);
    render();
    canvas.focus();
    return;
  }
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const key = CALIBRATION_KEYS[selectedKey]!;
  const p = points[key] ?? { x: 0.5, y: 0.5 };
  const step = event.shiftKey ? 0.001 : 0.005;
  const delta = unrotatePoint(
    {
      x: 0.5 + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
      y: 0.5 + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
    },
    cameraRotation,
  );
  points[key] = {
    x: Math.max(0, Math.min(1, p.x + delta.x - 0.5)),
    y: Math.max(0, Math.min(1, p.y + delta.y - 0.5)),
  };
  render();
  canvas.focus();
};
function disconnectCamera() {
  void sample?.stop('camera-disconnected');
  if (camera.status === 'ready') disconnectedDraft = makeCalibration();
  // Invalidate practice before stop resolves pending evidence promises.
  if (phase === 'practice') pause();
  if (phase !== 'results') phase = 'setup';
  diagnosticsId--;
  boundaryKeys = 0;
  saved.cameraDisconnected = true;
  disableAutoStart();
  message = 'Camera disconnected. Select Reconnect camera to resume.';
  camera.stop();
}
$('#disconnect-camera').onclick = disconnectCamera;
function restartCamera() {
  message = 'Starting camera…';
  saved.cameraDisconnected = false;
  store();
  void sample?.stop('camera-restarted');
  calibration = undefined;
  points = {};
  phase = 'setup';
  void camera.start(selectedCamera);
}
$('#start-camera').onclick = restartCamera;
$('#device').onchange = () => {
  selectedCamera = $<HTMLSelectElement>('#device').value;
  saved.cameraDeviceId = selectedCamera;
  disableAutoStart();
  if (!saved.cameraDisconnected) restartCamera();
};
$('#reset').onclick = () => {
  if (!resetArmed) {
    resetArmed = true;
    $('#reset').textContent = 'Confirm reset (calibration + history)';
    window.setTimeout(() => {
      resetArmed = false;
      $('#reset').textContent = 'Reset local data';
    }, 7000);
    return;
  }
  void sample?.stop('local-data-reset');
  camera.stop();
  progress.abandon();
  const progressReset = progressStore.reset();
  profile = PRESETS[0]!;
  CALIBRATION_KEYS = calibrationCodes(profile);
  saved.profileId = profile.id;
  profilesUI.reset();
  fingeringMode = 'standard';
  modeControl.value = fingeringMode;
  progress = new Progress(
    getCohort(progressStore.data, signature(profile, fingeringMode), progressSeed()),
    () => progressStore.schedule(),
  );
  round = currentRound(progress.cohort, profile);
  $('#policy-status').textContent = '';
  $('#finger-map').innerHTML = keyboard();
  exercise = new Exercise(
    roundWords((round = currentRound(progress.cohort, profile))),
    fingeringMode,
  );
  saved = { results: [] };
  disconnectedDraft = undefined;
  autoStartPending = false;
  selectedCamera = '';
  updateCameraChoices();
  cameraRotation = 0;
  rotationControl.value = '0';
  layoutCameraView();
  calibration = undefined;
  points = {};
  resuming = false;
  if (!reset() || !progressReset)
    storageWarning = 'Browser storage could not be cleared. Clear site data in Chrome settings.';
  showStorageWarning();
  resetArmed = false;
  $('#reset').textContent = 'Reset local data';
  setPhase('setup');
};
function typing(event: KeyboardEvent) {
  if (
    settings.open ||
    blockedActivations.has(event.key) ||
    phase !== 'practice' ||
    event.currentTarget !== document.activeElement ||
    !ready()
  )
    return;
  if (
    event.key === 'Tab' ||
    event.metaKey ||
    ((event.ctrlKey || event.altKey) && !event.getModifierState('AltGraph'))
  )
    return;
  recordKey(event, 'keydown');
  event.preventDefault();
  if (event.isComposing || event.key === 'Dead' || event.key === 'Process') {
    $('#input-message').textContent =
      'Composition/dead keys cannot be graded. Use a direct input source or edit your keyboard profile.';
    return;
  }
  if (event.key === 'Escape') {
    pause();
    return;
  }
  if (exercise.state === 'retry') {
    if (event.key === ' ' && !event.repeat) retryWord();
    return;
  }
  if (exercise.state === 'checking') {
    if (/^[a-z,. ]$/.test(event.key)) {
      boundaryKeys++;
      $('#input-message').textContent =
        `${boundaryKeys} ${boundaryKeys === 1 ? 'key was' : 'keys were'} not entered while checking. Wait for the next word.`;
    }
    return;
  }
  if (event.repeat) {
    $('#input-message').textContent =
      'Release the key between presses. Held-key repeats are ignored.';
    return;
  }
  if (event.key === 'Backspace') {
    progress.correction();
    exercise.backspace();
    updateTyped();
    return;
  }
  if (!/^[a-z,. ]$/.test(event.key)) {
    $('#input-message').textContent =
      'Use lowercase letters, comma, full stop and space. Turn Caps Lock off if needed.';
    return;
  }
  if (exercise.attempt.presses.length >= 160 && event.key !== ' ') {
    $('#input-message').textContent =
      'This attempt is getting long. Press space for feedback, or Escape to pause.';
    return;
  }
  const resolved = resolveEvent(profile, event);
  if ('error' in resolved) {
    $('#input-message').textContent = resolved.error;
    return;
  }
  const word = exercise.words[exercise.index]!;
  const buffer = exercise.attempt.text;
  const expectedCharacter =
    buffer.length < word.length
      ? word[buffer.length]
      : buffer.length === word.length
        ? ' '
        : undefined;
  const expectedCode =
    expectedCharacter === undefined ? undefined : characterKey(profile, expectedCharacter)?.code;
  const correct = event.key === expectedCharacter;
  const correctPrefix = correct && word.startsWith(buffer);
  const press = exercise.press(
    event.key,
    keyTime(event, performance.now(), performance.timeOrigin),
  );
  if (!press) return;
  press.code = resolved.code;
  press.allowedFingers = profileFingers(profile, resolved.code, fingeringMode);
  const progressOwner = progress;
  const progressPress = progressOwner.accept({
    code: resolved.code,
    expected:
      expectedCharacter !== undefined && expectedCode
        ? { character: expectedCharacter, code: expectedCode }
        : undefined,
    correct,
    correctPrefix,
    allowed: press.allowedFingers,
    word: round.slots[exercise.index]!.word,
    round: round.sequence,
    at: press.at,
  });
  if (event.key === ' ') progressOwner.breakTiming();
  if (event.key === ' ') render();
  else updateTyped();
  const owner = exercise;
  void camera.evidence.request(press, calibration!).then((observation) => {
    progressOwner.observe(progressPress, observation);
    if (owner !== exercise) return;
    const accepted = exercise.observe(press.id, press.attemptId, observation);
    sample?.event({
      type: 'observation',
      pressId: press.id,
      attemptId: press.attemptId,
      observation,
      accepted,
    });
    if (!accepted) return;
    const verdict = exercise.settle();
    if (!verdict) return;
    if (sample?.state === 'recording') {
      const attempt = structuredClone(exercise.history.at(-1)!.attempt);
      for (const p of attempt.presses) p.at -= sample.origin;
      if (attempt.submittedAt !== undefined) attempt.submittedAt -= sample.origin;
      const replayVerdict = {
        ...verdict,
        wrong: attempt.presses.filter((p) => verdict.wrong.some((w) => w.id === p.id)),
        uncertain: attempt.presses.filter((p) => verdict.uncertain.some((u) => u.id === p.id)),
      };
      sample.event({
        type: 'verdict',
        attempt,
        word: exercise.words[attempt.wordIndex]!,
        verdict: replayVerdict,
      });
    }
    if (exercise.state === 'complete') {
      completeRound(progress.cohort, profile);
      progressStore.flush();
      saved.results.push({
        ...exercise.stats(performance.now()),
        date: new Date().toISOString(),
        gradingPolicy: 'wrong-finger-veto',
        fingeringModes: exercise.policies(),
      });
      store();
      setPhase('results');
    } else {
      message = verdict.pass
        ? `${feedback(verdict, owner.words[owner.index - 1]!)} ${
            boundaryKeys
              ? `${boundaryKeys} keys were not entered during checking; start this word from the beginning.`
              : ''
          }`
        : '';
      boundaryKeys = 0;
      render();
    }
  });
}
function updateTyped() {
  const input = $<HTMLInputElement>('#typing');
  input.value = exercise.attempt.text;
  const next = exercise.words[exercise.index]?.[exercise.attempt.text.length] ?? ' ';
  const nextOutput = characterKey(profile, next)?.outputs.find((o) => o.text === next);
  const modifiers = [nextOutput?.shift ? 'Shift' : '', nextOutput?.altGr ? 'AltGr' : '']
    .filter(Boolean)
    .join('+');
  $('#word-hint').textContent =
    `Next: ${keyName(next)}${modifiers ? ` (${modifiers})` : ''} · ${hintForText(next)}`;
  document
    .querySelectorAll<HTMLElement>('[data-key]')
    .forEach((el) =>
      el.classList.toggle('next-key', el.dataset.key === characterKey(profile, next)?.code),
    );
}
function retryWord() {
  progress.abandon();
  sample?.event({ type: 'lifecycle', name: 'retry' });
  exercise.retry();
  message = 'Type the whole word, then space.';
  render();
  $('#typing').focus({ preventScroll: true });
}
function pause(remember = true) {
  void sample?.stop('practice-paused');
  if (remember) disableAutoStart();
  progress.abandon();
  exercise.pause();
  resuming = true;
  setupOpen = false;
  message = '';
  setPhase('verify');
  if (remember && !settings.open) $('#practice').focus({ preventScroll: true });
}
function attemptDetails() {
  const a = exercise.attempt;
  return `<div class="attempt-details">${a.presses
    .map((p) => {
      const o = p.observation;
      const cls =
        !o || o.kind === 'uncertain'
          ? 'unseen'
          : o?.kind === 'finger' &&
              (p.allowedFingers ?? allowedFingers(p.key, a.mode)).includes(o.finger)
            ? 'ok'
            : 'wrong';
      return `<span class="press-result ${cls}" title="${escapeHtml(o?.kind === 'finger' ? `Saw ${fingerName(o.finger)}; use ${p.allowedFingers?.map(fingerName).join(' or ') ?? intended(p.key, a.mode)}` : (o?.reason ?? 'No evidence'))}">${p.key === ' ' ? 'space' : p.key} <small>${cls === 'ok' ? '✓' : cls === 'wrong' ? '×' : '?'}</small></span>`;
    })
    .join('')}</div>`;
}
function diagnostic(event: KeyboardEvent) {
  if (
    phase === 'practice' ||
    phase === 'results' ||
    !ready() ||
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.metaKey ||
    ((event.ctrlKey || event.altKey) && !event.getModifierState('AltGraph')) ||
    !/^[a-z,. ]$/.test(event.key)
  )
    return;
  if (
    !settings.open ||
    event.currentTarget !== document.activeElement ||
    (event.currentTarget as HTMLElement).id !== 'diagnostic'
  )
    return;
  event.preventDefault();
  if (event.isComposing || ['Dead', 'Process'].includes(event.key)) {
    $('#diagnostic-result').textContent =
      'Composition/dead keys cannot be observed. Use a direct input source or edit your profile.';
    return;
  }
  if (!/^[a-z,. ]$/.test(event.key) || event.repeat || !ready()) return;
  const resolved = resolveEvent(profile, event);
  if ('error' in resolved) {
    $('#diagnostic-result').textContent = resolved.error;
    return;
  }
  const checkCalibration = makeCalibration();
  const press: Press = {
    id: diagnosticsId--,
    attemptId: -1,
    key: event.key,
    code: resolved.code,
    allowedFingers: profileFingers(profile, resolved.code, fingeringMode),
    at: keyTime(event, performance.now(), performance.timeOrigin),
  };
  const id = press.id;
  $('#diagnostic-result').textContent = `Checking ${keyName(event.key)}…`;
  camera.evidence.request(press, checkCalibration).then((o) => {
    if (phase === 'practice' || phase === 'results' || id !== diagnosticsId + 1) return;
    $('#diagnostic-result').textContent =
      o.kind === 'finger'
        ? `${keyName(press.key)}: saw ${fingerName(o.finger)}. Intended: ${press.allowedFingers!.map(fingerName).join(' or ')}.`
        : `${keyName(press.key)}: unknown. ${o.reason}`;
  });
}
$('#profile-settings').addEventListener(
  'click',
  (event) => {
    if ((event.target as HTMLElement).closest('#custom-layout'))
      void sample?.stop('keyboard-profile-edit');
  },
  true,
);
const profilesUI = profileControls(
  $('#profile-settings'),
  profile,
  saved.customProfiles ?? [],
  (next, customs) => {
    void sample?.stop('keyboard-profile-changed');
    disableAutoStart();
    progress.abandon();
    exercise.pause();
    resuming = phase === 'practice' || resuming;
    diagnosticsId--;
    boundaryKeys = 0;
    camera.evidence.reset();
    if (calibration && validCalibration(calibration))
      saved.calibrations = { ...saved.calibrations, [profile.id]: structuredClone(calibration) };
    const previous = makeCalibration();
    profile = next;
    selectCourse();
    CALIBRATION_KEYS = calibrationCodes(profile);
    selectedKey = 0;
    saved.profileId = profile.id;
    saved.customProfiles = customs;
    const own = saved.calibrations?.[profile.id];
    const candidate =
      own && sameCamera(own)
        ? own
        : validCalibration(previous) && sameCamera(previous)
          ? previous
          : undefined;
    calibration = candidate
      ? { ...structuredClone(candidate), profile: structuredClone(profile) }
      : undefined;
    points = calibration?.points ?? {};
    disconnectedDraft = undefined;
    saved.calibration = calibration;
    setupOpen = !calibration;
    message = calibration
      ? 'Compatible key positions kept. Start or resume when ready.'
      : 'This keyboard needs its own key positions. Previous calibration is retained locally; map the keys before starting.';
    $('#profile-status').textContent = message;
    phase = camera.status === 'ready' ? (calibration ? 'verify' : 'calibrate') : 'setup';
    if (!resuming)
      exercise = new Exercise(
        roundWords((round = currentRound(progress.cohort, profile))),
        fingeringMode,
      );
    $('#finger-map').innerHTML = keyboard();
    store();
    render();
  },
);
$('#profile-status').textContent = coverage(profile).length
  ? `Missing passage characters: ${coverage(profile).join(' ')}. Edit your profile before practice.`
  : (saved.migrationNotice ?? '');
document.addEventListener('visibilitychange', () => {
  if (document.hidden && phase === 'practice') pause(false);
});
window.addEventListener('blur', () => progress.breakTiming());
window.addEventListener('pagehide', () => {
  progress.abandon();
  progressStore.flush();
  sample?.discard();
  camera.stop();
});
window.addEventListener('beforeunload', (event) => {
  if (sample && !['discarded'].includes(sample.state)) {
    event.preventDefault();
    event.returnValue = '';
  }
});
function recordKey(event: KeyboardEvent, action: 'keydown' | 'keyup') {
  if (
    !sample ||
    sample.state !== 'recording' ||
    event.metaKey ||
    ((event.ctrlKey || event.altKey) && !event.getModifierState('AltGraph'))
  )
    return;
  // Only the practice input is recorded; never global keystrokes or setup fields.
  sample.event({
    type: 'key',
    action,
    key: event.key,
    code: event.code,
    repeat: event.repeat,
    shiftKey: event.shiftKey,
    altGraph: event.getModifierState('AltGraph'),
    eventAt: keyTime(event, performance.now(), performance.timeOrigin) - sample.origin,
    attemptId: exercise.attempt.id,
    state: exercise.state,
  });
}
function updateSampleControls() {
  if (!document.querySelector('#sample-start')) return;
  const active = sample && sample.state !== 'discarded';
  $('#sample-indicator').hidden = !active;
  $('#sample-indicator').textContent =
    sample?.state === 'recording'
      ? 'Recording sample'
      : sample?.state === 'stopping'
        ? 'Stopping sample'
        : 'Sample retained';
  $<HTMLButtonElement>('#sample-start').disabled = !!active || !ready();
  $<HTMLButtonElement>('#sample-stop').disabled = sample?.state !== 'recording';
  $<HTMLButtonElement>('#sample-download').disabled = sample?.state !== 'ready';
  $<HTMLButtonElement>('#sample-discard').disabled = !active || sample?.state === 'stopping';
  $('#sample-status').textContent =
    sample?.message ?? 'Map your keys, choose a fingering mode, then start a sample.';
  $('#sample-panel').classList.toggle('is-recording', sample?.state === 'recording');
  $('#debugging > summary').textContent =
    sample?.state === 'recording'
      ? 'Debugging · Recording sample'
      : active
        ? 'Debugging · Sample retained'
        : 'Debugging';
}
{
  $<HTMLDetailsElement>('#debugging').open = openDebugging;
  const panel = $('#sample-panel');
  panel.hidden = false;
  panel.innerHTML = `<h2>Record a debugging sample</h2>
    <p>Records camera video, key positions and practice keys locally. No audio or upload. Start begins a fresh passage. Stop and download before leaving.</p>
    <div class="sample-fields"><label>Anonymous person ID<input id="sample-person" value="p01" maxlength="40" /></label><label>Setup ID<input id="sample-setup" value="s01" maxlength="40" /></label><label>Setup / issue notes<input id="sample-notes" maxlength="500" placeholder="Keyboard, camera angle, lighting, issue" /></label></div>
    <div class="sample-actions"><button id="sample-start">Start sample (fresh passage)</button><button id="sample-stop" disabled>Stop sample</button><button id="sample-download" disabled>Download sample</button><button id="sample-discard" disabled>Discard sample</button></div>
    <p id="sample-status" role="status"></p><small>Stops at five minutes or 256 MiB, or when setup/fingering changes. Use a short pilot first.</small>`;
  $('#sample-start').onclick = () => {
    if (!ready() || (sample && sample.state !== 'discarded')) return;
    try {
      sample = new SampleRecorder(
        camera,
        {
          calibration: makeCalibration(),
          mode: fingeringMode,
          words: exercise.words,
          rotation: cameraRotation,
          participantId: $<HTMLInputElement>('#sample-person').value,
          setupId: $<HTMLInputElement>('#sample-setup').value,
          notes: $<HTMLInputElement>('#sample-notes').value,
        },
        updateSampleControls,
      );
      resuming = false;
      startPractice();
      sample.event({ type: 'lifecycle', name: 'fresh-passage' });
      updateSampleControls();
    } catch (error) {
      $('#sample-status').textContent = String(error);
    }
  };
  $('#sample-stop').onclick = () => void sample?.stop();
  $('#sample-download').onclick = () => sample?.download();
  $('#sample-discard').onclick = () => sample?.discard();
  for (const name of ['focus', 'blur'] as const)
    window.addEventListener(name, () => sample?.event({ type: 'lifecycle', name }));
}
$('#finger-map').innerHTML = keyboard();
render();
showStorageWarning();
updateCameraChoices();

if (saved.cameraDisconnected) cameraChanged();
else restartCamera();
moveCamera();
if (openDebugging) openSettings('debugging');
