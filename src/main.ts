import './style.css';
import { unrotatePoint, isCameraRotation } from './view/rotation';
import { Camera } from './tracking/camera';
import { keyTime } from './tracking/timing';
import {
  CALIBRATION_KEYS,
  DIGITS,
  EXPECTED,
  LANDMARK_TIPS,
  ROWS,
  fingerName,
  intended,
  keyName,
} from './core/keyboard';
import { validCalibration } from './core/calibration';
import { Exercise, feedback } from './core/exercise';
import { load, reset, save } from './core/storage';
import type { Calibration, Frame, Point, Press } from './core/types';
import { WORDS } from './passage';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
let saved = load();
let cameraRotation = saved.cameraRotation ?? 0;
let autoStartPending = saved.practiceEnabled ?? !!saved.calibration;
let selectedCamera = saved.cameraDeviceId ?? saved.calibration?.deviceId ?? '';
let phase: 'setup' | 'calibrate' | 'verify' | 'practice' | 'results' = 'setup';
let calibration: Calibration | undefined;
let disconnectedDraft: Calibration | undefined;
let points: Record<string, Point> = {};
let selectedKey = 0;
let swapHands = saved.calibration?.swapHands ?? false;
let exercise = new Exercise(WORDS);
let resuming = false;
let message = '';
let storageWarning = '';
let boundaryKeys = 0;
let diagnosticsId = -1;
let cameraErrorHandled = false;
let resetArmed = false;

$('#app').innerHTML = `
  <header class="topbar"><h1>Right Typer</h1><a href="https://github.com/al-beton/right-typer" target="_blank" rel="noreferrer">Source on GitHub</a></header>
  <main>
    <div id="content" aria-label="Typing practice"></div>
    <section id="finger-map" aria-label="Intended finger map"></section>
    <section id="camera-section" aria-label="Live camera and finger tracking">
      <div class="camera-heading"><h2>Camera & key positions</h2><span id="camera-badge" role="status">Camera off</span></div>
      <div class="camera-layout">
        <div class="view-wrap" id="view-wrap"><div id="camera-image"><video id="camera" autoplay playsinline muted aria-label="Live view of your keyboard"></video><canvas id="overlay" aria-label="Keyboard calibration. Click the center of the requested key, or use arrow keys and Enter." tabindex="0"></canvas></div><div class="camera-empty" id="camera-empty"><strong>Allow camera access to get set up</strong><span>Tilt your MacBook screen toward the keyboard.<br/>Use your external display for this page.</span></div></div>
        <aside>
          <div class="camera-options"><label for="camera-rotation">Rotate camera view</label><select id="camera-rotation"><option value="0">0°</option><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">270° clockwise</option></select></div>
          <div id="camera-controls"><label for="device">Camera</label><select id="device"><option value="">MacBook / default camera</option></select><button id="start-camera">Enable camera</button><button id="disconnect-camera" hidden>Disconnect camera</button></div>
          <div id="setup-panel"></div>
          <p id="tracking-readout">Camera frames stay in this browser.</p>
        </aside>
      </div>
    </section>
    <div id="storage-warning" class="storage-alert" role="status" hidden></div>
    <footer><span>Local processing · Apple British ISO · Chrome on MacBook</span><button class="text-button" id="reset">Reset local data</button></footer>
  </main>`;
const video = $<HTMLVideoElement>('#camera');
const canvas = $<HTMLCanvasElement>('#overlay');
const camera = new Camera(video, cameraChanged, drawFrame);
const content = $('#content');
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
  cameraRotation = angle;
  saved.cameraRotation = angle;
  store();
  layoutCameraView();
  if (camera.latest) drawOverlay(camera.latest);
};

function store() {
  if (!save(saved))
    storageWarning =
      'Local storage is unavailable. This session still works; calibration will not survive a reload.';
  $('#storage-warning').textContent = storageWarning;
  $('#storage-warning').hidden = !storageWarning;
}
function keyboard() {
  return `<h2>Which finger?</h2><div class="keyboard">${ROWS.map((row, i) => `<div class="key-row row-${i}">${[...row].map((k) => `<span class="key finger-${EXPECTED[k]}" title="${intended(k)}" data-key="${k}"><b>${k}</b><small>${intended(k)}</small></span>`).join('')}</div>`).join('')}<div class="key-row"><span class="key space-key" data-key=" "><b>space</b><small>either thumb</small></span></div></div>`;
}
function setPhase(next: typeof phase) {
  phase = next;
  render();
}
function render() {
  canvas.classList.toggle('calibrating', phase === 'calibrate');
  $<HTMLSelectElement>('#device').disabled = phase === 'practice';
  $<HTMLButtonElement>('#start-camera').disabled =
    phase === 'practice' || camera.status === 'loading';
  renderSetup();
  if (phase !== 'practice' && phase !== 'results') {
    const last = saved.results.at(-1);
    content.innerHTML = `<section class="practice"><div class="practice-top"><h2>Practice</h2><span>${WORDS.length} words</span></div><div class="progress-track"></div>${passageMarkup()}<div class="entry-heading"><label for="typing">Your word</label><span>Space finishes each word.</span></div><div class="word-entry"><div class="target-word">${WORDS[exercise.index]}</div><input id="typing" aria-label="Type the current word" placeholder="Set up, then Go" disabled /></div><div class="feedback">${resuming ? 'Paused. Go resumes this word with a fresh attempt.' : 'Allow camera access, mark the key positions, then click Go.'}</div>${last ? `<p class="recent">Last practice: ${last.wpm.toFixed(1)} WPM · ${last.retries} retries${last.gradingPolicy !== 'wrong-finger-veto' ? ' · Earlier rule: unknown presses required retries' : ''}</p>` : ''}</section>`;
  } else if (phase === 'practice') {
    const retry = exercise.state === 'retry',
      checking = exercise.state === 'checking';
    const stats = exercise.stats(performance.now());
    const word = WORDS[exercise.index]!;
    content.innerHTML = `<section class="practice"><div class="practice-top"><span class="eyebrow">Practice</span><div class="practice-metrics"><span><b>${exercise.index}</b> / ${WORDS.length} words</span><span><b>${stats.retries}</b> retries</span><button class="text-button" id="pause">Pause</button></div></div><div class="progress-track"><div style="width:${(exercise.index / WORDS.length) * 100}%"></div></div><div class="passage" aria-label="Practice passage">${WORDS.map((w, i) => `<span class="${i < exercise.index ? 'passed' : i === exercise.index ? 'active' : ''}" ${i === exercise.index ? 'aria-current="step"' : ''}>${w}</span>`).join(' ')}</div><div class="entry-heading"><label class="eyebrow" for="typing">${retry ? 'SAME WORD. FRESH START.' : checking ? 'CHECKING THIS WORD' : 'YOUR WORD'}</label><span id="word-hint">${exercise.index === 0 ? 'Include punctuation. Space finishes the word.' : 'Finish the word, then press space.'}</span></div><div class="word-entry ${retry ? 'needs-retry' : ''}"><div class="target-word" aria-label="Current word">${word}</div><input id="typing" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Type the current word" placeholder="type here" ${retry || checking ? 'readonly' : ''}/><span class="entry-indicator">${checking ? '<span class="spinner"></span>' : retry ? '↺' : '↵'}</span></div><div id="feedback" class="feedback ${retry ? 'mistake' : ''}" role="status">${retry ? `<div><strong>Let’s give that word another go.</strong><p>${escapeHtml(feedback(exercise.lastVerdict!, word))}</p></div><button class="primary" id="retry">Try this word again <span>Space</span></button>` : checking ? '<span class="spinner"></span> Matching camera evidence to your presses. Wait for the next word before typing.' : escapeHtml(message || 'Take your time. I’ll check your fingers when the word is finished.')}</div><p id="input-message" class="input-message" role="status"></p></section>`;
    const input = $<HTMLInputElement>('#typing');
    input.value = exercise.attempt.text;
    input.onkeydown = typing;
    input.onbeforeinput = (e) => e.preventDefault();
    input.onpaste = (e) => {
      e.preventDefault();
      $('#input-message').textContent =
        'Type each character so its finger can be observed. Pasting is not graded.';
    };
    input.ondrop = (e) => e.preventDefault();
    input.focus({ preventScroll: true });
    const passage = $('.passage'),
      activeWord = $('.passage .active');
    passage.scrollTop = Math.max(0, activeWord.offsetTop - 40);
    $('#pause').onclick = () => pause();
    if (retry) $('#retry').onclick = retryWord;
  } else {
    const stats = exercise.stats(performance.now());
    content.innerHTML = `<section class="results"><h2>PASSAGE COMPLETE</h2><p class="lede">Every word’s text matched with no wrong finger detected in its accepted attempt.</p><div class="result-grid"><div class="primary-stat"><strong>${stats.wpm.toFixed(1)}</strong><span>effective WPM</span></div><div><strong>${stats.wrongFingers}</strong><span>wrong-finger presses</span></div><div><strong>${stats.textMistakes}</strong><span>text-mismatch attempts</span></div><div><strong>${stats.uncertainPresses}</strong><span>unverified presses</span></div></div><p class="result-note">${WORDS.length} words · ${stats.attempts} submitted attempts · ${stats.retries} retries · ${formatTime(stats.elapsedMs)} elapsed<br/>Unverified presses remain unknown, including in accepted words. They do not cause retries.</p><details><summary>How these numbers work</summary><p>Effective WPM is the accepted passage characters, including one submitting space per word, divided by five and by elapsed minutes. Timing runs from your first character to the final submitting space and includes retries, reading feedback and pauses. Wrong-finger presses include erased characters. A text mistake is one submitted attempt with mismatched text. Unverified presses count all unknown observations in submitted attempts, including submitting spaces, erased characters and failed attempts. They are not verified correct fingers. An attempt can contain both mistakes and uncertainty.</p></details><div class="result-actions"><button class="primary" id="restart">Practise again <span>↻</span></button></div><p class="result-limit">Camera judgements can be wrong. Clear feedback is useful; it is not ground truth.</p></section>`;
    $('#restart').onclick = () => {
      disableAutoStart();
      resuming = false;
      exercise = new Exercise(WORDS);
      message = '';
      setPhase(camera.status === 'ready' ? 'verify' : 'setup');
    };
  }
  if (phase === 'practice' && exercise.state === 'retry') {
    $('#feedback').insertAdjacentHTML('beforeend', attemptDetails());
  }

  document
    .querySelectorAll<HTMLElement>('[data-key]')
    .forEach((el) => el.classList.remove('next-key'));
  if (phase === 'practice') updateTyped();
  if (camera.latest) drawOverlay(camera.latest);
}
function formatTime(ms: number) {
  return `${Math.floor(ms / 60000)}m ${Math.floor(ms / 1000) % 60}s`;
}
function sameCamera(c: Calibration) {
  const s = camera.settings();
  return (
    s?.deviceId === c.deviceId && video.videoWidth === c.width && video.videoHeight === c.height
  );
}
function makeCalibration(): Calibration {
  return {
    version: 1,
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
  points = {};
  calibration = undefined;
  selectedKey = 0;
  message = '';
  setPhase('calibrate');
}
function ready() {
  return camera.status === 'ready' && draftValid();
}
function passageMarkup() {
  return `<div class="passage" aria-label="Practice passage">${WORDS.map((w, i) => `<span class="${i < exercise.index ? 'passed' : i === exercise.index ? 'active' : ''}">${w}</span>`).join(' ')}</div>`;
}
function renderSetup() {
  diagnosticsId--; // Discard optional checks when setup changes.
  const editing = phase === 'calibrate';
  const count = Object.keys(points).length;
  const complete = ready();
  const locked = phase === 'practice' || phase === 'results';
  $('#setup-panel').innerHTML = `
    <p id="setup-message" role="status">${escapeHtml(message || 'Keep the camera and keyboard still after mapping.')}</p>
    <div class="mapping-heading"><strong id="requested-key">${editing ? `Mark ${CALIBRATION_KEYS[selectedKey]!.replace('-', ' ')} in the image` : complete ? 'Key positions configured' : 'Configure the key positions'}</strong><span>${count} / ${CALIBRATION_KEYS.length}</span></div>
    <div class="cal-keys" aria-label="Choose a key to edit">${CALIBRATION_KEYS.map((k, i) => `<button class="cal-key ${points[k] ? 'mapped' : ''} ${editing && i === selectedKey ? 'selected' : ''}" data-cal="${i}" aria-label="Map ${k}" aria-pressed="${editing && i === selectedKey}" ${camera.status !== 'ready' || locked ? 'disabled' : ''}>${k.startsWith('space') ? (k.endsWith('left') ? 'space ◂' : 'space ▸') : k}<span aria-hidden="true" style="visibility:${points[k] ? 'visible' : 'hidden'}"> ✓</span></button>`).join('')}</div>
    <p id="cal-message">${editing ? 'Click each key centre. Mark both ends of space. Select any key above to adjust it; arrow keys nudge, Enter selects the next.' : 'Dots show the saved positions. If the camera moved, select a key to adjust it or remap below.'}</p>
    <button id="remap" ${camera.status !== 'ready' || locked ? 'disabled' : ''}>Remap key positions</button>
    <div class="diagnostic"><label for="diagnostic-input">Test finger detection (optional)</label><input id="diagnostic-input" autocomplete="off" placeholder="Try f, j and space" aria-label="Check observed fingers" ${!complete || locked ? 'disabled' : ''}/><p id="diagnostic-result" role="status">Try correct and different fingers. Check whether the observed labels match.</p><button id="swap" aria-pressed="${swapHands}" ${!complete || locked ? 'disabled' : ''}>${swapHands ? 'Restore' : 'Swap'} left/right hand labels</button></div>
    <div class="setup-actions"><button class="primary" id="practice" ${!complete || locked ? 'disabled' : ''}>Go</button><button id="fix-setup" ${!locked ? 'disabled' : ''}>Edit setup</button></div>
    <p id="ready-message" role="status">${complete ? 'Ready. If the camera moved, adjust the dots before Go.' : count === CALIBRATION_KEYS.length && camera.status === 'ready' ? 'Some dots overlap or rows are too flat. Adjust those positions.' : 'Go unlocks when all key positions are configured.'}</p>`;
  $('#setup-panel')
    .querySelectorAll<HTMLButtonElement>('[data-cal]')
    .forEach((el) => {
      el.onclick = () => {
        selectedKey = Number(el.dataset.cal);
        phase = 'calibrate';
        render();
      };
    });
  $('#remap').onclick = startCalibration;
  $('#swap').onclick = () => {
    swapHands = !swapHands;
    calibration = makeCalibration();
    camera.evidence.reset();
    renderSetup();
  };
  $('#diagnostic-input').onkeydown = (event) => diagnostic(event as KeyboardEvent);
  $('#practice').onclick = startPractice;
  $('#fix-setup').onclick = () => {
    disableAutoStart();
    if (phase === 'practice') {
      exercise.pause();
      resuming = true;
    } else {
      exercise = new Exercise(WORDS);
      resuming = false;
    }
    message = 'Adjust any dot in the camera image, or remap if the camera moved.';
    setPhase('verify');
  };
}
function startPractice() {
  if (!ready()) return;
  calibration = makeCalibration();
  saved.calibration = calibration;
  saved.practiceEnabled = true;
  autoStartPending = false;
  store();
  camera.evidence.reset();
  message = '';
  boundaryKeys = 0;
  if (resuming) exercise.retry();
  else exercise = new Exercise(WORDS);
  setPhase('practice');
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
    : 'Allow camera access to get set up';
  if (camera.status !== 'ready') {
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    $('#camera-badge').classList.remove('good');
  }
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
    const previous = disconnectedDraft ?? saved.calibration;
    disconnectedDraft = undefined;
    if (previous && sameCamera(previous)) {
      calibration = structuredClone(previous);
      points = calibration.points;
      swapHands = calibration.swapHands;
      phase = validCalibration(calibration) ? 'verify' : 'calibrate';
      message = 'Saved positions loaded. Adjust the dots if the camera or keyboard moved.';
    } else {
      points = {};
      calibration = undefined;
      selectedKey = 0;
      phase = 'calibrate';
    }
    if (autoStartPending) {
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
    ctx.beginPath();
    ctx.arc(x, y, selected ? 9 : 5, 0, Math.PI * 2);
    ctx.fillStyle = selected ? '#f6d68b' : '#e7efb9';
    ctx.fill();
    ctx.strokeStyle = '#183a30';
    ctx.lineWidth = 2;
    ctx.stroke();
    uprightLabel(x, y, () => {
      ctx.fillStyle = '#0e251d';
      ctx.fillRect(-9, -25, key.startsWith('space') ? 28 : 19, 17);
      ctx.fillStyle = '#fff';
      ctx.fillText(key.startsWith('space') ? (key.endsWith('left') ? 'S◂' : 'S▸') : key, -5, -12);
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
  if (phase !== 'calibrate') return;
  const box = canvas.getBoundingClientRect();
  points[CALIBRATION_KEYS[selectedKey]!] = unrotatePoint(
    {
      x: (event.clientX - box.left) / box.width,
      y: (event.clientY - box.top) / box.height,
    },
    cameraRotation,
  );
  selectedKey = Math.min(CALIBRATION_KEYS.length - 1, selectedKey + 1);
  if (draftValid()) phase = 'verify';
  message = '';
  render();
};
canvas.onkeydown = (event) => {
  if (phase !== 'calibrate') return;
  if (event.key === 'Enter') {
    event.preventDefault();
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
  if (camera.status === 'ready') disconnectedDraft = makeCalibration();
  // Invalidate practice before stop resolves pending evidence promises.
  if (phase === 'practice') pause();
  if (phase !== 'results') phase = 'setup';
  diagnosticsId--;
  boundaryKeys = 0;
  saved.cameraDisconnected = true;
  disableAutoStart();
  message = 'Camera disconnected. Reconnect when you are ready.';
  camera.stop();
}
$('#disconnect-camera').onclick = disconnectCamera;
function restartCamera() {
  message = 'Starting camera…';
  saved.cameraDisconnected = false;
  store();
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
  camera.stop();
  exercise = new Exercise(WORDS);
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
  if (!reset())
    storageWarning = 'Browser storage could not be cleared. Clear site data in Chrome settings.';
  $('#storage-warning').textContent = storageWarning;
  $('#storage-warning').hidden = !storageWarning;
  resetArmed = false;
  $('#reset').textContent = 'Reset local data';
  setPhase('setup');
};
function typing(event: KeyboardEvent) {
  if (event.key === 'Tab' || event.metaKey || event.ctrlKey || event.altKey) return;
  event.preventDefault();
  if (event.isComposing) {
    $('#input-message').textContent = 'Switch to the English keyboard input source to practise.';
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
  const press = exercise.press(
    event.key,
    keyTime(event, performance.now(), performance.timeOrigin),
  );
  if (!press) return;
  if (event.key === ' ') render();
  else updateTyped();
  const owner = exercise;
  void camera.evidence.request(press, calibration!).then((observation) => {
    if (owner !== exercise) return;
    if (!exercise.observe(press.id, press.attemptId, observation)) return;
    const verdict = exercise.settle();
    if (!verdict) return;
    if (exercise.state === 'complete') {
      saved.results.push({
        ...exercise.stats(performance.now()),
        date: new Date().toISOString(),
        gradingPolicy: 'wrong-finger-veto',
      });
      store();
      setPhase('results');
    } else {
      message = verdict.pass
        ? `${feedback(verdict, owner.words[owner.index - 1]!)} ${
            boundaryKeys
              ? `${boundaryKeys} keys were not entered during checking; start this word from the beginning.`
              : 'On to the next.'
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
  const next = WORDS[exercise.index]?.[exercise.attempt.text.length] ?? ' ';
  $('#word-hint').textContent = `Next: ${keyName(next)} · ${intended(next)}`;
  document
    .querySelectorAll<HTMLElement>('[data-key]')
    .forEach((el) => el.classList.toggle('next-key', el.dataset.key === next));
}
function retryWord() {
  exercise.retry();
  message = 'Fresh attempt. Type the whole word, then space.';
  render();
}
function pause(remember = true) {
  if (remember) disableAutoStart();
  exercise.pause();
  resuming = true;
  message = 'Paused. Your completed words are kept. Click Go to restart the current word.';
  setPhase('verify');
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
              (p.key === ' ' ? o.finger.endsWith('-thumb') : EXPECTED[p.key] === o.finger)
            ? 'ok'
            : 'wrong';
      return `<span class="press-result ${cls}" title="${escapeHtml(o?.kind === 'finger' ? `Saw ${fingerName(o.finger)}; use ${intended(p.key)}` : (o?.reason ?? 'No evidence'))}">${p.key === ' ' ? 'space' : p.key} <small>${cls === 'ok' ? '✓' : cls === 'wrong' ? '×' : '?'}</small></span>`;
    })
    .join('')}</div>`;
}
function diagnostic(event: KeyboardEvent) {
  if (event.key === 'Tab') return;
  event.preventDefault();
  if (!/^[a-z,. ]$/.test(event.key) || event.repeat || !ready()) return;
  calibration = makeCalibration();
  const press: Press = {
    id: diagnosticsId--,
    attemptId: -1,
    key: event.key,
    at: keyTime(event, performance.now(), performance.timeOrigin),
  };
  const id = press.id;
  $('#diagnostic-result').textContent = `Checking ${keyName(event.key)}…`;
  camera.evidence.request(press, structuredClone(calibration)).then((o) => {
    if (phase === 'practice' || phase === 'results' || id !== diagnosticsId + 1) return;
    $('#diagnostic-result').textContent =
      o.kind === 'finger'
        ? `${keyName(press.key)}: saw ${fingerName(o.finger)}. Intended: ${intended(press.key)}. Does that match what you did?`
        : `Could not verify ${keyName(press.key)}. ${o.reason}`;
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && phase === 'practice') pause(false);
});
window.addEventListener('pagehide', () => camera.stop());
$('#finger-map').innerHTML = keyboard();
render();
updateCameraChoices();

if (saved.cameraDisconnected) cameraChanged();
else restartCamera();
