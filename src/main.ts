import './style.css';
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
let phase: 'intro' | 'setup' | 'calibrate' | 'verify' | 'practice' | 'results' = 'intro';
let calibration: Calibration | undefined;
let points: Record<string, Point> = {};
let selectedKey = 0;
let swapHands = saved.calibration?.swapHands ?? false;
let alignmentChecked = false;
let identityChecked = false;
let exercise = new Exercise(WORDS);
let resuming = false;
let message = '';
let storageWarning = '';
let boundaryKeys = 0;
let diagnosticsId = -1;
let cameraErrorHandled = false;
let resetArmed = false;

$('#app').innerHTML = `
  <header class="topbar"><a class="brand" href="./" aria-label="Right Typer home"><span class="brand-mark">r<span>t</span></span>right typer<span class="beta">first edition</span></a><div class="top-actions"><span class="privacy"><i></i> on your device</span><button class="text-button" id="reset">Reset local data</button></div></header>
  <main><div id="storage-warning" class="storage-alert" role="status" hidden></div><div id="content"></div>
    <section class="camera-section" id="camera-section" aria-label="Live camera and finger tracking" hidden>
      <div class="camera-heading"><div><span class="eyebrow">YOUR VIEW</span><h2>Keep your hands in the picture.</h2></div><span id="camera-badge" class="status-pill">Camera off</span></div>
      <div class="camera-layout"><div class="view-wrap" id="view-wrap"><video id="camera" autoplay playsinline muted aria-label="Live view of your keyboard"></video><canvas id="overlay" aria-label="Keyboard calibration. Click the center of the requested key, or use arrow keys and Enter." tabindex="0"></canvas><div class="camera-empty" id="camera-empty"><div class="camera-glyph">⌁</div><strong>Your keyboard goes here</strong><span>Tilt your MacBook screen toward the keys.<br/>Use your external display for this page.</span></div></div>
      <aside class="camera-guide"><span class="eyebrow" id="guide-label">A GOOD ANGLE</span><h3 id="guide-title">A little tilt. A clearer view.</h3><p id="guide-text">Use your MacBook webcam. Tilt the lid down until the letter keys, spacebar and both hands fit in the image. Keep this page on your external display.</p><div class="tracking-readout" id="tracking-readout">Camera frames stay in this browser.</div><div id="camera-finger-map"></div><div id="camera-controls"><label class="field-label" for="device">Camera</label><select id="device"><option value="">MacBook / default camera</option></select><button class="secondary" id="start-camera">Enable camera</button></div><button class="text-button" id="fix-setup" hidden>Fix camera setup ↗</button></aside></div>
      <p class="camera-footnote">Live, local, temporary. No recordings, uploads or analytics.</p>
    </section>
  </main><footer><span>Small movements. Better habits.</span><span>Apple British ISO · Chrome on MacBook <span class="footer-dot">•</span> <a href="https://github.com/al-beton/right-typer" target="_blank" rel="noreferrer">Open source ↗</a></span></footer>`;
const video = $<HTMLVideoElement>('#camera');
const canvas = $<HTMLCanvasElement>('#overlay');
const camera = new Camera(video, cameraChanged, drawFrame);
const content = $('#content');

function store() {
  if (!save(saved))
    storageWarning =
      'Local storage is unavailable. This session still works; calibration will not survive a reload.';
  $('#storage-warning').textContent = storageWarning;
  $('#storage-warning').hidden = !storageWarning;
}
function steps(active: number) {
  return `<div class="steps" aria-label="Setup progress">${['Camera', 'Key positions', 'Check & practise'].map((label, i) => `<span class="${i === active ? 'current' : i < active ? 'done' : ''}"><b>${i < active ? '✓' : `0${i + 1}`}</b>${label}</span>`).join('<i></i>')}</div>`;
}
function keyboard() {
  return `<div class="keyboard" aria-label="Intended finger map">${ROWS.map((row, i) => `<div class="key-row row-${i}">${[...row].map((k) => `<span class="key finger-${EXPECTED[k]?.split('-')[1]}" title="${intended(k)}" data-key="${k}">${k}</span>`).join('')}</div>`).join('')}<div class="key-row"><span class="key space-key" data-key=" ">either thumb</span></div></div>`;
}
function setPhase(next: typeof phase) {
  phase = next;
  render();
}
function render() {
  $('#camera-section').hidden = phase === 'intro' || phase === 'results';
  $('#fix-setup').hidden = !['practice', 'verify'].includes(phase);
  $('#camera-controls').hidden = !['setup'].includes(phase);
  $('#camera-section').classList.toggle('practice-view', phase === 'practice');
  canvas.classList.toggle('calibrating', phase === 'calibrate');
  if (phase === 'intro') {
    content.innerHTML = `<section class="intro"><div class="intro-copy"><span class="eyebrow">MAKE THE RIGHT MOVES</span><h1>One word.<br/><em>Well typed.</em></h1><p class="lede">Your fingers have habits.<br/>Give them a little guidance.</p><p class="intro-detail">Right Typer watches your fingers as you type. Finish a word, get useful feedback, and try again until the right movements stick.</p><button class="primary" id="begin">Set up your camera <span>↗</span></button><div class="intro-meta">About 5 minutes to set up <span>·</span> Everything stays here</div></div><div class="intro-art" aria-label="Illustration of word practice"><div class="art-top"><span class="tiny-dot"></span> A LITTLE MORE INTENTION</div><div class="sample-word">q<span>u</span>iet<span class="sample-caret"></span></div><div class="sample-note"><span>↳</span> right index, a little closer.</div>${keyboard()}<div class="art-bottom"><span>01 / ${WORDS.length} words</span><span>take your time ↵</span></div></div></section><section class="principles"><div><span>01</span><h3>See your fingers</h3><p>Tilt your MacBook screen toward the keys. Keep this page on your external display.</p></div><div><span>02</span><h3>Go word by word</h3><p>Finish each word, then press space. The next word waits for correct fingers.</p></div><div><span>03</span><h3>Build the habit</h3><p>Start slowly. Clear movements matter more than a high score.</p></div></section>${saved.results.length ? `<section class="recent"><span class="eyebrow">LAST PRACTICE</span><p>${new Date(saved.results.at(-1)!.date).toLocaleDateString()} <b>${saved.results.at(-1)!.wpm.toFixed(1)} WPM</b> · ${saved.results.at(-1)!.retries} retries</p></section>` : ''}`;
    $('#begin').onclick = () => {
      resuming = false;
      setPhase('setup');
    };
  } else if (phase === 'setup') {
    content.innerHTML = `${steps(0)}<section class="setup-title"><span class="eyebrow">01 / FIND YOUR ANGLE</span><h1>Your keyboard.<br/><em>From a new perspective.</em></h1><p>Open this page on your external display, then tilt the MacBook lid toward the keyboard. Both hands and the spacebar should stay visible while typing.</p></section><div class="notice" id="setup-message" role="status">${escapeHtml(message || 'Enable the camera below. Nothing is recorded or sent anywhere.')}</div><div class="setup-actions"><button class="primary" id="calibrate" ${camera.status !== 'ready' ? 'disabled' : ''}>${saved.calibration && sameCamera(saved.calibration) ? 'Check saved key positions' : 'Map the key positions'} <span>→</span></button><span>Keep the lid and keyboard still after calibration.</span></div>`;
    $('#calibrate').onclick = () => {
      if (saved.calibration && sameCamera(saved.calibration)) {
        calibration = structuredClone(saved.calibration);
        points = calibration.points;
        swapHands = calibration.swapHands;
        alignmentChecked = false;
        identityChecked = false;
        message = '';
        setPhase('verify');
      } else startCalibration();
    };
  } else if (phase === 'calibrate') {
    const key = CALIBRATION_KEYS[selectedKey]!;
    content.innerHTML = `${steps(1)}<section class="calibration-title"><div><span class="eyebrow">02 / CONNECT THE DOTS</span><h1>Show me <em id="requested-key">${key.startsWith('space') ? (key.endsWith('left') ? 'spacebar’s left end.' : 'spacebar’s right end.') : `the ${keyName(key)} key.`}</em></h1><p>Move your hands aside. Click the center of the highlighted key in the live image below. For space, mark each end along its middle. No training keystrokes needed.</p></div><div class="cal-count"><strong>${Object.keys(points).length}</strong> / ${CALIBRATION_KEYS.length}<span>positions mapped</span></div></section><div class="cal-keys" aria-label="Choose a key to edit">${CALIBRATION_KEYS.map((k, i) => `<button class="cal-key ${points[k] ? 'mapped' : ''} ${i === selectedKey ? 'selected' : ''}" data-cal="${i}" aria-label="Map ${k}">${k.startsWith('space') ? (k.endsWith('left') ? 'space ◂' : 'space ▸') : k}</button>`).join('')}</div><div class="setup-actions"><button class="secondary" id="undo">← Previous key</button><button class="primary" id="save-calibration" ${draftValid() ? '' : 'disabled'}>Check alignment <span>→</span></button><span id="cal-message" role="status">${escapeHtml(message || (Object.keys(points).length === CALIBRATION_KEYS.length && !draftValid() ? 'Some dots overlap or rows are too flat to distinguish. Revisit those keys before continuing.' : 'Click a mapped key above to adjust it. Arrow keys nudge a dot; Enter moves to the next key.'))}</span></div>`;
    content.querySelectorAll<HTMLButtonElement>('[data-cal]').forEach((el) => {
      el.onclick = () => {
        selectedKey = Number(el.dataset.cal);
        render();
      };
    });
    $('#undo').onclick = () => {
      selectedKey = Math.max(0, selectedKey - 1);
      render();
    };
    $('#save-calibration').onclick = () => {
      const draft = makeCalibration();
      if (!validCalibration(draft)) return;
      calibration = draft;
      alignmentChecked = false;
      identityChecked = false;
      message = '';
      setPhase('verify');
    };
  } else if (phase === 'verify') {
    content.innerHTML = `${steps(2)}<section class="setup-title compact"><span class="eyebrow">03 / A QUICK REALITY CHECK</span><h1>All dots <em>in place?</em></h1><p>Check the dots against your keyboard, especially q, p, z, full stop and both ends of space. Saved positions need this check every time the camera starts.</p></section><div class="verify-grid"><div class="check-list"><label><input type="checkbox" id="alignment" ${alignmentChecked ? 'checked' : ''}/> Every dot is on its key. The camera and keyboard are fixed.</label><label><input type="checkbox" id="identity" ${identityChecked ? 'checked' : ''}/> I lifted each hand in turn. The live left/right labels match my actual hands.</label><label class="swap"><input type="checkbox" id="swap" ${swapHands ? 'checked' : ''}/> Swap the model’s left/right labels</label></div><div class="diagnostic"><label for="diagnostic-input" class="eyebrow">TRY A FEW KEYS</label><input id="diagnostic-input" autocomplete="off" placeholder="Click here, then try f, j and space" aria-label="Check observed fingers"/><p id="diagnostic-result" role="status">Optional check: try correct and deliberately different fingers. The labels should follow the finger you actually use.</p></div></div><div class="setup-actions"><button class="primary" id="practice" disabled>${resuming ? 'Return to this word' : 'Start practising'} <span>→</span></button><button class="text-button" id="remap">Remap key positions</button><span id="ready-message" role="status">${escapeHtml(message || 'Confirm alignment and hand labels. Both hands must be visible with camera capture timing available.')}</span></div>`;
    $<HTMLInputElement>('#alignment').onchange = (e) => {
      alignmentChecked = (e.target as HTMLInputElement).checked;
      updateReadiness();
    };
    $<HTMLInputElement>('#identity').onchange = (e) => {
      identityChecked = (e.target as HTMLInputElement).checked;
      updateReadiness();
    };
    $<HTMLInputElement>('#swap').onchange = (e) => {
      swapHands = (e.target as HTMLInputElement).checked;
      calibration!.swapHands = swapHands;
      identityChecked = false;
      $<HTMLInputElement>('#identity').checked = false;
      updateReadiness();
    };
    $('#remap').onclick = startCalibration;
    $('#practice').onclick = () => {
      if (!ready()) return;
      saved.calibration = calibration;
      store();
      camera.evidence.reset();
      message = '';
      boundaryKeys = 0;
      if (resuming) exercise.retry();
      else exercise = new Exercise(WORDS);
      setPhase('practice');
    };
    $('#diagnostic-input').onkeydown = (event) => diagnostic(event as KeyboardEvent);
    updateReadiness();
  } else if (phase === 'practice') {
    const retry = exercise.state === 'retry',
      checking = exercise.state === 'checking';
    const stats = exercise.stats(performance.now());
    const word = WORDS[exercise.index]!;
    content.innerHTML = `<section class="practice"><div class="practice-top"><span class="eyebrow">THE PICNIC / A LITTLE ADVENTURE</span><div class="practice-metrics"><span><b>${exercise.index}</b> / ${WORDS.length} words</span><span><b>${stats.retries}</b> retries</span><button class="text-button" id="pause">Pause</button></div></div><div class="progress-track"><div style="width:${(exercise.index / WORDS.length) * 100}%"></div></div><div class="passage" aria-label="Practice passage">${WORDS.map((w, i) => `<span class="${i < exercise.index ? 'passed' : i === exercise.index ? 'active' : ''}" ${i === exercise.index ? 'aria-current="step"' : ''}>${w}</span>`).join(' ')}</div><div class="entry-heading"><label class="eyebrow" for="typing">${retry ? 'SAME WORD. FRESH START.' : checking ? 'CHECKING THIS WORD' : 'YOUR WORD'}</label><span id="word-hint">${exercise.index === 0 ? 'Include punctuation. Space finishes the word.' : 'Finish the word, then press space.'}</span></div><div class="word-entry ${retry ? 'needs-retry' : ''}"><div class="target-word" aria-label="Current word">${word}</div><input id="typing" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Type the current word" placeholder="type here" ${retry || checking ? 'readonly' : ''}/><span class="entry-indicator">${checking ? '<span class="spinner"></span>' : retry ? '↺' : '↵'}</span></div><div id="feedback" class="feedback ${retry ? (exercise.lastVerdict?.wrong.length || exercise.lastVerdict?.textWrong ? 'mistake' : 'uncertain') : ''}" role="status">${retry ? `<div><strong>${exercise.lastVerdict?.wrong.length || exercise.lastVerdict?.textWrong ? 'Let’s give that word another go.' : 'I need a clearer look.'}</strong><p>${escapeHtml(feedback(exercise.lastVerdict!, word))}</p></div><button class="primary" id="retry">Try this word again <span>↵</span></button>` : checking ? '<span class="spinner"></span> Matching camera evidence to your presses. Wait for the next word before typing.' : escapeHtml(message || 'Take your time. I’ll check your fingers when the word is finished.')}</div>${retry ? attemptDetails() : ''}<p id="input-message" class="input-message" role="status"></p></section>`;
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
    $('#pause').onclick = pause;
    if (retry) $('#retry').onclick = retryWord;
  } else {
    const stats = exercise.stats(performance.now());
    content.innerHTML = `<section class="results"><div class="finish-seal">✓</div><span class="eyebrow">PASSAGE COMPLETE</span><h1>Good words.<br/><em>Better movements.</em></h1><p class="lede">Every word made it through a checked attempt.</p><div class="result-grid"><div class="primary-stat"><strong>${stats.wpm.toFixed(1)}</strong><span>effective WPM</span></div><div><strong>${stats.wrongFingers}</strong><span>wrong-finger presses</span></div><div><strong>${stats.textMistakes}</strong><span>text-mismatch attempts</span></div><div><strong>${stats.uncertaintyRetries}</strong><span>uncertainty retries</span></div></div><p class="result-note">${WORDS.length} words · ${stats.attempts} submitted attempts · ${stats.retries} retries · ${formatTime(stats.elapsedMs)} elapsed<br/>Uncertainty is counted separately from learner mistakes.</p><details><summary>How these numbers work</summary><p>Effective WPM is the accepted passage characters, including one submitting space per word, divided by five and by elapsed minutes. Timing runs from your first character to the final submitting space and includes retries, reading feedback and pauses. Wrong-finger presses include erased characters. A text mistake is one submitted attempt with mismatched text. An attempt can contain both mistakes and uncertainty.</p></details><div class="result-actions"><button class="primary" id="restart">Practise again <span>↻</span></button><button class="text-button" id="home">Back to the beginning</button></div><p class="result-limit">Camera judgements can be wrong. Clear feedback is useful; it is not ground truth.</p></section>`;
    $('#restart').onclick = () => {
      resuming = false;
      message = 'Start the camera again, then confirm that the saved dots still align.';
      setPhase('setup');
    };
    $('#home').onclick = () => setPhase('intro');
  }
  updateGuide();
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
  return (
    alignmentChecked &&
    identityChecked &&
    calibration &&
    sameCamera(calibration) &&
    camera.fresh() &&
    camera.latest?.clock === 'capture' &&
    camera.latest.hands.length === 2 &&
    new Set(camera.latest.hands.map((h) => h.side)).size === 2 &&
    camera.latest.hands.every((h) => h.score >= 0.8)
  );
}
function updateReadiness() {
  if (phase !== 'verify') return;
  $<HTMLButtonElement>('#practice').disabled = !ready();
  if (camera.latest?.clock === 'unavailable')
    $('#ready-message').textContent =
      'Chrome is not exposing camera capture timestamps for this stream. Update Chrome and restart the camera. Practice stays blocked because presentation time cannot verify a press.';
  else if (alignmentChecked && identityChecked)
    $('#ready-message').textContent = ready()
      ? 'Ready. Begin at a comfortable, deliberate pace.'
      : 'Place both hands in view and wait for a fresh, confident frame.';
  else $('#ready-message').textContent = 'Confirm alignment and hand labels before practising.';
}
function updateGuide() {
  $('#camera-finger-map').innerHTML =
    phase === 'practice'
      ? keyboard() +
        '<p class="map-caption">The highlighted key shows the next intended movement.</p>'
      : '';
  const key = CALIBRATION_KEYS[selectedKey]!;
  $('#guide-label').textContent =
    phase === 'calibrate'
      ? 'CLICK IN THE IMAGE'
      : phase === 'practice'
        ? 'A LIVE SECOND LOOK'
        : 'A GOOD ANGLE';
  $('#guide-title').textContent =
    phase === 'calibrate'
      ? `Mark ${key.replace('-', ' ')}.`
      : phase === 'practice'
        ? 'Clear view. Steady hands.'
        : 'A little tilt. A clearer view.';
  $('#guide-text').textContent =
    phase === 'calibrate'
      ? 'Move your hands away. Click the key center, not a fingertip. Keep the lid still. You can revisit any dot before continuing.'
      : phase === 'practice'
        ? 'Keep both hands and the key dots visible. If the lid or keyboard moves, fix the setup before continuing.'
        : 'Use your MacBook webcam. Tilt the lid down until the letter keys, spacebar and both hands fit in the image. Keep this page on your external display.';
}
function cameraChanged() {
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
          : 'Camera off';
  $<HTMLButtonElement>('#start-camera').disabled = camera.status === 'loading';
  $('#start-camera').textContent =
    camera.status === 'loading'
      ? 'Starting…'
      : camera.status === 'ready'
        ? 'Restart camera'
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
    message =
      'Check the framing below. Keep the full letter area, spacebar and both hands in view.';
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        const select = $<HTMLSelectElement>('#device');
        const id = camera.settings()?.deviceId;
        select.innerHTML = devices
          .filter((d) => d.kind === 'videoinput')
          .map(
            (d) =>
              `<option value="${escapeHtml(d.deviceId)}" ${d.deviceId === id ? 'selected' : ''}>${escapeHtml(d.label || 'Camera')}</option>`,
          )
          .join('');
      })
      .catch(() => {});
  }
  if (phase === 'setup') render();
}
function drawFrame(frame: Frame) {
  $('#camera-badge').textContent =
    frame.clock === 'unavailable'
      ? 'Capture timing unavailable'
      : frame.hands.length === 2
        ? 'Both hands in view'
        : `${frame.hands.length} / 2 hands in view`;
  $('#camera-badge').classList.toggle(
    'good',
    frame.hands.length === 2 && frame.clock === 'capture',
  );
  $('#tracking-readout').textContent =
    frame.clock === 'capture'
      ? `Capture → result ${Math.max(0, Math.round(frame.receivedAt - frame.at))} ms · ${frame.hands.length} hands`
      : 'Frame capture time unavailable. Finger grading is blocked.';
  drawOverlay(frame);
  updateReadiness();
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
    ctx.fillStyle = '#0e251d';
    ctx.fillRect(x - 9, y - 25, key.startsWith('space') ? 28 : 19, 17);
    ctx.fillStyle = '#fff';
    ctx.fillText(
      key.startsWith('space') ? (key.endsWith('left') ? 'S◂' : 'S▸') : key,
      x - 5,
      y - 12,
    );
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
      if (phase === 'verify') {
        ctx.fillStyle = '#fff';
        ctx.fillText(DIGITS[digit]!, x + 6, y - 5);
      }
    });
    const wrist = hand.points[0];
    if (wrist) {
      const [x, y] = pxy(wrist);
      ctx.fillStyle = '#152d26';
      ctx.fillRect(x - 5, y + 5, 125, 23);
      ctx.fillStyle = '#fff';
      ctx.fillText(`${side} hand`, x, y + 21);
    }
  }
}
canvas.onclick = (event) => {
  if (phase !== 'calibrate') return;
  const box = canvas.getBoundingClientRect();
  points[CALIBRATION_KEYS[selectedKey]!] = {
    x: (event.clientX - box.left) / box.width,
    y: (event.clientY - box.top) / box.height,
  };
  selectedKey = Math.min(CALIBRATION_KEYS.length - 1, selectedKey + 1);
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
  points[key] = {
    x: Math.max(
      0,
      Math.min(
        1,
        p.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
      ),
    ),
    y: Math.max(
      0,
      Math.min(1, p.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0)),
    ),
  };
  render();
  canvas.focus();
};
$('#start-camera').onclick = () => {
  alignmentChecked = false;
  identityChecked = false;
  void camera.start($<HTMLSelectElement>('#device').value);
};
$('#device').onchange = () => {
  alignmentChecked = false;
  identityChecked = false;
  void camera.start($<HTMLSelectElement>('#device').value);
};
$('#fix-setup').onclick = () => {
  if (phase === 'practice') {
    exercise.pause();
    resuming = true;
  }
  message = 'Recheck the camera angle. If the lid moved, remap the key positions.';
  setPhase('setup');
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
  calibration = undefined;
  points = {};
  resuming = false;
  if (!reset())
    storageWarning = 'Browser storage could not be cleared. Clear site data in Chrome settings.';
  $('#storage-warning').textContent = storageWarning;
  $('#storage-warning').hidden = !storageWarning;
  resetArmed = false;
  $('#reset').textContent = 'Reset local data';
  setPhase('intro');
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
    if (event.key === 'Enter') retryWord();
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
      saved.results.push({ ...exercise.stats(performance.now()), date: new Date().toISOString() });
      store();
      camera.stop();
      setPhase('results');
    } else {
      message = verdict.pass
        ? boundaryKeys
          ? `Word checked. ${boundaryKeys} keys were not entered during checking; start this word from the beginning.`
          : 'That word is checked. On to the next.'
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
function pause() {
  exercise.pause();
  resuming = true;
  message =
    'Practice paused. Your completed words are kept for this session. Recheck alignment to restart the current word.';
  alignmentChecked = false;
  identityChecked = false;
  setPhase('verify');
}
function attemptDetails() {
  const a = exercise.attempt;
  const uncertainStreak = exercise.history
    .slice(-2)
    .filter((h) => h.verdict.uncertain.length).length;
  return `<div class="attempt-details">${a.presses
    .map((p) => {
      const o = p.observation;
      const cls =
        o?.kind === 'uncertain'
          ? 'unseen'
          : o?.kind === 'finger' &&
              (p.key === ' ' ? o.finger.endsWith('-thumb') : EXPECTED[p.key] === o.finger)
            ? 'ok'
            : 'wrong';
      return `<span class="press-result ${cls}" title="${escapeHtml(o?.kind === 'finger' ? `Saw ${fingerName(o.finger)}; use ${intended(p.key)}` : (o?.reason ?? 'No evidence'))}">${p.key === ' ' ? 'space' : p.key} <small>${cls === 'ok' ? '✓' : cls === 'wrong' ? '×' : '?'}</small></span>`;
    })
    .join(
      '',
    )}</div>${exercise.lastVerdict?.uncertain.length ? `<p class="recovery">${escapeHtml(exercise.lastVerdict.uncertain[0]?.observation?.kind === 'uncertain' ? exercise.lastVerdict.uncertain[0].observation.reason : '')} ${uncertainStreak >= 2 ? '<strong>Uncertainty is repeating. Use “Fix camera setup” below to check the dots, lighting and hand labels before another attempt.</strong>' : ''}</p>` : ''}`;
}
function diagnostic(event: KeyboardEvent) {
  if (event.key === 'Tab') return;
  event.preventDefault();
  if (!/^[a-z,. ]$/.test(event.key) || event.repeat || !calibration) return;
  const press: Press = {
    id: diagnosticsId--,
    attemptId: -1,
    key: event.key,
    at: keyTime(event, performance.now(), performance.timeOrigin),
  };
  const id = press.id;
  $('#diagnostic-result').textContent = `Checking ${keyName(event.key)}…`;
  camera.evidence.request(press, structuredClone(calibration)).then((o) => {
    if (phase !== 'verify' || id !== diagnosticsId + 1) return;
    $('#diagnostic-result').textContent =
      o.kind === 'finger'
        ? `${keyName(press.key)}: saw ${fingerName(o.finger)}. Intended: ${intended(press.key)}. Does that match what you did?`
        : `Could not verify ${keyName(press.key)}. ${o.reason}`;
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && phase === 'practice') pause();
});
window.addEventListener('pagehide', () => camera.stop());
render();
