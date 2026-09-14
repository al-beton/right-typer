import type { Camera } from '../tracking/camera';
import { frameTime } from '../tracking/timing';
import { timingTrial, type TrialContext } from './timing-trial';

// Explicit experiment only: no capture at page load and no pixel recording.
// Optional staged-key trials retain their declared test results in memory only.
export function safariDeskView(
  camera: Camera,
  start: (deviceId: string, width: number) => void,
  stop: () => void,
  trialContext: (event: KeyboardEvent) => TrialContext | undefined,
) {
  // WebKit's AVFoundation callback assigns MonotonicTime::now() to captureTime.
  // Until sensor exposure provenance is established, this source stays unknown.
  camera.captureClockTrusted = false;
  const panel = document.createElement('aside');
  panel.id = 'safari-experiment';
  panel.style.cssText =
    'margin:16px auto;padding:18px;max-width:1000px;border:1px solid #9a8771;border-radius:12px';
  panel.innerHTML = `
    <h2>Safari Desk View experiment</h2>
    <p>Direct browser camera capture. Nothing starts until you choose a capture button. No camera recording or upload.</p>
    <p>Refresh first. If names are hidden, briefly allow the default camera, then select the exact Studio Display Desk View device. Starting a camera also starts the bundled hand model.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <button id="desk-refresh">Refresh devices</button>
      <button id="desk-permission">Allow camera briefly</button>
      <label>Experiment camera <select id="desk-device"><option value="">No named device yet</option></select></label>
      <label>Requested size <select id="desk-size"><option value="960">960 × 720</option><option value="1920">1920 × 1440</option></select></label>
      <button id="desk-start" disabled>Start selected camera</button>
      <button id="desk-stop">Stop camera</button>
    </div>
    <p id="desk-message" role="status">Camera has not been requested. Refresh devices to inspect Safari's current list.</p>
    <details><summary>Local diagnostics (metadata only)</summary><pre id="desk-report" style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-height:320px;overflow:auto"></pre></details>
    <p>Use keyboard mapping and Go below. Ordinary practice keeps finger evidence unknown: Safari's captureTime has not been established as sensor exposure time. The optional staged trial below estimates finger identity separately, with explicit timing assumptions. No automatic Desk View setup is invoked.</p>`;
  document.body.prepend(panel);
  timingTrial(panel, camera, trialContext);
  const get = <T extends HTMLElement>(id: string) => panel.querySelector<T>(`#${id}`)!;
  const select = get<HTMLSelectElement>('desk-device');
  const startButton = get<HTMLButtonElement>('desk-start');
  const permissionButton = get<HTMLButtonElement>('desk-permission');
  const message = get('desk-message');
  const events: string[] = [];
  let devices: { label: string; selectable: boolean }[] = [];
  let callbacks = 0;
  let timed = 0;
  let firstAt = 0;
  let lastAt = 0;
  let metadata: Record<string, unknown> = {};
  let permissionPending = false;
  let permissionGeneration = 0;
  let selectedLabel = '';
  let enumeration = 0;
  const note = (text: string) => {
    message.textContent = text;
    events.push(text);
    if (events.length > 15) events.shift();
    render();
  };
  function render() {
    const track = camera.stream?.getVideoTracks()[0];
    const settings = track?.getSettings();
    const capabilities = track?.getCapabilities?.();
    get('desk-report').textContent = JSON.stringify(
      {
        browser: navigator.userAgent,
        build: import.meta.env.VITE_BUILD_SHA,
        dirtyBuild: __APP_DIRTY__,
        apis: {
          secureContext: isSecureContext,
          getUserMedia: !!navigator.mediaDevices?.getUserMedia,
          requestVideoFrameCallback: !!camera.video.requestVideoFrameCallback,
          VideoFrame: typeof VideoFrame !== 'undefined',
          createImageBitmap: typeof createImageBitmap !== 'undefined',
          OffscreenCanvas: typeof OffscreenCanvas !== 'undefined',
          WebAssembly: typeof WebAssembly !== 'undefined',
          Worker: typeof Worker !== 'undefined',
        },
        devices,
        deviceEvents: events,
        requestedLabel: selectedLabel,
        camera: {
          status: camera.status,
          error: camera.error,
          label: track?.label,
          muted: track?.muted,
          readyState: track?.readyState,
        },
        settings: settings && {
          width: settings.width,
          height: settings.height,
          frameRate: settings.frameRate,
          aspectRatio: settings.aspectRatio,
        },
        capabilities: capabilities && {
          width: capabilities.width,
          height: capabilities.height,
          frameRate: capabilities.frameRate,
        },
        frames: {
          callbacks,
          plausibleBrowserCaptureTimes: timed,
          callbackRate: lastAt > firstAt ? ((callbacks - 1) * 1000) / (lastAt - firstAt) : null,
          latest: metadata,
        },
        inference: camera.latest && {
          id: camera.latest.id,
          clock: camera.latest.clock,
          hands: camera.latest.hands.length,
          arrivalMinusFrameMs: (camera.latest.receivedAt ?? 0) - camera.latest.at,
        },
        timing:
          'Exposure timing is unverified: ordinary practice keeps experimental frames unavailable for finger grading, including when Safari supplies captureTime; the staged trial reports separate estimates. Raw browser timestamps below are diagnostic only.',
      },
      null,
      2,
    );
    startButton.disabled = permissionPending || !select.value || camera.status === 'loading';
    permissionButton.disabled =
      permissionPending || camera.status === 'loading' || camera.status === 'ready';
  }
  async function refresh() {
    const request = ++enumeration;
    try {
      const list = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === 'videoinput',
      );
      if (request !== enumeration) return;
      const previous = select.value;
      select.replaceChildren(new Option('Choose an exact camera', ''));
      devices = list.map((d, i) => ({
        label: d.label || `Unnamed camera ${i + 1}`,
        selectable: !!d.deviceId,
      }));
      list.forEach((d, i) => {
        if (d.deviceId) select.add(new Option(devices[i]!.label, d.deviceId));
      });
      select.value = list.some((d) => d.deviceId === previous) ? previous : '';
      note(
        `Enumerated ${list.length} video inputs; ${list.filter((d) => /desk.?view/i.test(d.label)).length} named Desk View devices. Enumeration is not capture proof.`,
      );
    } catch (error) {
      note(`Device enumeration failed: ${String(error)}`);
    }
  }
  get('desk-refresh').onclick = () => void refresh();
  select.onchange = render;
  permissionButton.onclick = async () => {
    if (permissionPending) return;
    const generation = ++permissionGeneration;
    permissionPending = true;
    render();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      // This is only a permission probe. Release every track, including after Stop.
      stream.getTracks().forEach((track) => track.stop());
      if (generation !== permissionGeneration) return;
      note('Camera permission granted; permission-probe tracks stopped. Refreshing device names.');
      await refresh();
    } catch (error) {
      if (generation === permissionGeneration)
        note(
          `Permission probe failed: ${String(error)}. Allow Camera for this localhost site in Safari's website settings, then retry once.`,
        );
    } finally {
      permissionPending = false;
      render();
    }
  };
  startButton.onclick = () => {
    if (!select.value || permissionPending) return;
    callbacks = timed = firstAt = lastAt = 0;
    metadata = {};
    selectedLabel = select.selectedOptions[0]?.textContent ?? '';
    note(`Requesting exact device: ${selectedLabel}`);
    start(select.value, Number(get<HTMLSelectElement>('desk-size').value));
  };
  get('desk-stop').onclick = () => {
    permissionGeneration++;
    stop();
    note('Camera stopped. A still-open browser permission prompt must be dismissed by the user.');
  };
  camera.inspectFrame = (m, at) => {
    callbacks++;
    firstAt ||= at;
    lastAt = at;
    if (frameTime(m, at) !== null) timed++;
    metadata = {
      captureTime: m.captureTime ?? null,
      presentationTime: m.presentationTime,
      expectedDisplayTime: m.expectedDisplayTime,
      mediaTime: m.mediaTime,
      presentedFrames: m.presentedFrames,
      callbackTime: at,
    };
  };
  const deviceChanged = () => {
    note('devicechange event received');
    void refresh();
  };
  navigator.mediaDevices?.addEventListener('devicechange', deviceChanged);
  const timer = window.setInterval(render, 500);
  window.addEventListener(
    'pagehide',
    () => {
      permissionGeneration++;
      clearInterval(timer);
      navigator.mediaDevices?.removeEventListener('devicechange', deviceChanged);
    },
    { once: true },
  );
  render();
}
