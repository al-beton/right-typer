const $ = (id) => document.getElementById(id);
let cases = [],
  saved = {},
  verification = false,
  index = 0,
  busy = true,
  epoch = 0;
const images = new Map();
const names = [
  'little',
  'ring',
  'middle',
  'index',
  'thumb',
  'thumb',
  'index',
  'middle',
  'ring',
  'little',
];
const values = names.map((name, i) => (i < 5 ? 'left-' : 'right-') + name);
for (let i = 0; i < 10; i++) {
  const button = document.createElement('button');
  button.dataset.finger = values[i];
  button.innerHTML = names[i] + '<small>' + ((i + 1) % 10) + '</small>';
  button.setAttribute('aria-label', values[i].replace('-', ' '));
  button.onclick = () => answer(values[i]);
  $(i < 5 ? 'left' : 'right').append(button);
}
function controls(disabled) {
  document
    .querySelectorAll('[data-finger],#unclear,#back,#replay,#reviewAgain')
    .forEach((button) => {
      button.disabled = disabled;
    });
  $('back').disabled = disabled || index === 0;
}
async function api(path, body) {
  const response = await fetch(
    path,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {},
  );
  if (!response.ok) throw Error('Could not save (' + response.status + ')');
  return response.json();
}
function preload(frame) {
  if (!images.has(frame.url)) {
    const image = new Image();
    const promise = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
    image.src = frame.url;
    images.set(frame.url, { image, promise });
  }
  return images.get(frame.url).promise;
}
function done() {
  epoch++;
  busy = false;
  $('review').hidden = true;
  $('done').hidden = false;
  $('progress').textContent = 'Finished ' + cases.length + ' clips';
  controls(false);
}
async function show() {
  if (!cases.length) return done();
  const token = ++epoch,
    current = cases[index];
  busy = true;
  controls(true);
  $('done').hidden = true;
  $('review').hidden = false;
  $('progress').textContent =
    (verification ? 'Verify ' : 'Clip ') + (index + 1) + ' / ' + cases.length;
  $('question').textContent =
    'Which finger pressed ' + (current.key === ' ' ? 'Space' : current.key.toUpperCase()) + '?';
  $('pulse').textContent = current.key === ' ' ? 'Space' : current.key.toUpperCase();
  $('pulse').classList.remove('on');
  $('keyMarker').classList.remove('on');
  const camera = current.camera;
  const rotation = current.reviewRotation ?? camera.rotation;
  const quarterTurn = Math.abs(rotation % 180) === 90;
  const stage = document.querySelector('.stage');
  stage.style.aspectRatio = quarterTurn
    ? camera.height + '/' + camera.width
    : camera.width + '/' + camera.height;
  stage.style.setProperty(
    '--content-width',
    (quarterTurn ? (100 * camera.width) / camera.height : 100) + '%',
  );
  stage.style.setProperty(
    '--content-height',
    (quarterTurn ? (100 * camera.height) / camera.width : 100) + '%',
  );
  document.querySelector('.stage').style.setProperty('--rotation', rotation + 'deg');
  $('keyMarker').setAttribute('viewBox', '0 0 ' + camera.width + ' ' + camera.height);
  $('keyCircle').setAttribute('cx', (current.keyPoint?.x ?? 0) * camera.width);
  $('keyCircle').setAttribute('cy', (current.keyPoint?.y ?? 0) * camera.height);
  $('status').textContent = saved[current.id]
    ? 'Saved: ' +
      (saved[current.id].finger || "can't tell") +
      '. Choose again to confirm or change.'
    : 'Click a finger or use 1–0. Saves and advances automatically.';
  $('status').title = current.id + ' at ' + (current.atMs / 1000).toFixed(3) + 's';
  // Keep references to at most this clip and the next, even for thousands of presses.
  const keep = new Set(
    [...current.frames, ...(cases[index + 1]?.frames || [])].map((frame) => frame.url),
  );
  for (const url of images.keys()) if (!keep.has(url)) images.delete(url);
  if (!current.frames.length) {
    $('clip').removeAttribute('src');
    $('status').textContent = "No aligned frames for this press. Mark can't tell.";
    busy = false;
    controls(false);
    document.querySelectorAll('[data-finger]').forEach((button) => {
      button.disabled = true;
    });
    return;
  }
  $('clip').src = current.frames[0].url;
  try {
    await Promise.all(current.frames.map(preload));
    if (token !== epoch) return;
    busy = false;
    controls(false);
    const start = performance.now(),
      first = current.frames[0].at;
    const end = Math.max(current.frames.at(-1).at + 150, current.atMs + 500);
    const animate = () => {
      if (token !== epoch) return;
      const time = first + (((performance.now() - start) * 0.5) % (end - first));
      let frame = current.frames[0];
      for (const candidate of current.frames) {
        if (candidate.at <= time) frame = candidate;
        else break;
      }
      const wanted = new URL(frame.url, location.href).href;
      if ($('clip').src !== wanted) $('clip').src = frame.url;
      const pressed = time >= current.atMs && time < current.atMs + 130;
      $('pulse').classList.toggle('on', pressed);
      $('keyMarker').classList.toggle('on', pressed && !!current.keyPoint);
      requestAnimationFrame(animate);
    };
    animate();
    for (const frame of cases[index + 1]?.frames || [])
      preload(frame).catch(() => {
        images.delete(frame.url);
      });
  } catch {
    if (token !== epoch) return;
    images.clear();
    $('status').textContent = 'Could not load clip. Click Replay to retry.';
    $('replay').disabled = false;
  }
}
async function answer(finger) {
  if (busy) return;
  const current = cases[index];
  if (finger && !current.frames.length) return;
  busy = true;
  controls(true);
  try {
    saved[current.id] = await api('/api/review', { id: current.id, finger });
    if (++index < cases.length) await show();
    else {
      index = cases.length - 1;
      done();
    }
  } catch (error) {
    $('status').textContent = error.message + '. Your choice has not been saved; try again.';
    busy = false;
    controls(false);
  }
}
$('back').onclick = () => {
  if (!busy && index > 0) {
    index--;
    show();
  }
};
$('replay').onclick = show;
$('reviewAgain').onclick = () => {
  index = 0;
  show();
};
$('unclear').onclick = () => answer(null);
document.addEventListener('keydown', (event) => {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || $('review').hidden) return;
  const number = '1234567890'.indexOf(event.key);
  if (number >= 0) {
    event.preventDefault();
    answer(values[number]);
  } else if (event.code === 'Space') {
    event.preventDefault();
    answer(null);
  }
});
try {
  const response = await api('/api/cases');
  ({ cases, saved, verification } = response);
  index = verification ? 0 : cases.findIndex((item) => !saved[item.id]);
  if (index < 0) {
    index = Math.max(0, cases.length - 1);
    done();
  } else await show();
} catch {
  $('status').textContent = 'Could not connect to the label store. Reload to retry.';
}
