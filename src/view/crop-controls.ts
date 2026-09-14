import { boundCrop, cropPixels, fullCrop, hasCrop, type Crop } from './crop';

export function cropControls(
  host: HTMLElement,
  video: HTMLVideoElement,
  current: () => Crop,
  enabled: () => boolean,
  change: (crop: Crop) => void,
  done: () => void,
) {
  host.innerHTML = `<details id="camera-crop"><summary>Crop camera view</summary>
    <p>Drag around your keyboard and both hands. The cropped view is used for tracking and practice.</p>
    <div id="crop-original"><canvas id="crop-source" aria-label="Full camera view for selecting a crop"></canvas><div id="crop-selection"></div></div>
    <fieldset id="crop-fields"><legend>Crop area in the original camera view</legend>
      <label>Left<input id="crop-left" type="range" min="0" max="95" step="1" value="0"></label>
      <label>Top<input id="crop-top" type="range" min="0" max="95" step="1" value="0"></label>
      <label>Width<input id="crop-width" type="range" min="5" max="100" step="1" value="100"></label>
      <label>Height<input id="crop-height" type="range" min="5" max="100" step="1" value="100"></label>
      <button id="crop-reset" type="button">Use full frame</button><button id="crop-done" type="button">Done cropping</button>
    </fieldset><p id="crop-description" role="status"></p></details>`;
  const details = host.querySelector<HTMLDetailsElement>('details')!;
  const source = host.querySelector<HTMLCanvasElement>('canvas')!;
  const original = host.querySelector<HTMLElement>('#crop-original')!;
  const selection = host.querySelector<HTMLElement>('#crop-selection')!;
  const fields = host.querySelector<HTMLFieldSetElement>('fieldset')!;
  const inputs = [...host.querySelectorAll<HTMLInputElement>('input')];
  let drag: { x: number; y: number; pointerId: number } | undefined;
  function draw() {
    if (!details.open || !enabled() || video.readyState < 2) return;
    const width = 640;
    const height = Math.round((width * video.videoHeight) / video.videoWidth);
    if (source.width !== width || source.height !== height) {
      source.width = width;
      source.height = height;
    }
    original.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    source.getContext('2d')!.drawImage(video, 0, 0, width, height);
  }
  function refresh() {
    const crop = current();
    fields.disabled = !enabled();
    if (!enabled()) {
      drag = undefined;
      source.getContext('2d')!.clearRect(0, 0, source.width, source.height);
    }
    [crop.x, crop.y, crop.width, crop.height].forEach((v, i) => {
      inputs[i]!.value = String(Math.round(v * 100));
      inputs[i]!.setAttribute('aria-valuetext', `${Math.round(v * 100)} percent`);
    });
    Object.assign(selection.style, {
      left: `${crop.x * 100}%`,
      top: `${crop.y * 100}%`,
      width: `${crop.width * 100}%`,
      height: `${crop.height * 100}%`,
    });
    const rect = cropPixels(crop, video.videoWidth || 640, video.videoHeight || 480);
    host.querySelector('#crop-description')!.textContent = enabled()
      ? `${hasCrop(crop) ? 'Cropped' : 'Full frame'} · ${rect.width} × ${rect.height} source pixels. Key positions stay aligned. Camera crops are saved for this source and resolution.`
      : 'Connect a camera to adjust its crop.';
    draw();
  }
  function apply(crop: Crop) {
    change(boundCrop(crop));
    refresh();
  }
  inputs.forEach((input, i) =>
    input.addEventListener('input', () => {
      if (!enabled()) return;
      const key = (['x', 'y', 'width', 'height'] as const)[i]!;
      const crop = { ...current(), [key]: Number(input.value) / 100 };
      if (key === 'width') crop.width = Math.min(crop.width, 1 - crop.x);
      if (key === 'height') crop.height = Math.min(crop.height, 1 - crop.y);
      apply(crop);
    }),
  );
  host.querySelector('#crop-reset')!.addEventListener('click', () => {
    if (enabled()) apply(fullCrop());
  });
  const position = (event: PointerEvent) => {
    const box = original.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    };
  };
  original.addEventListener('pointerdown', (event) => {
    if (!enabled() || event.button !== 0) return;
    drag = { ...position(event), pointerId: event.pointerId };
    original.setPointerCapture(event.pointerId);
  });
  original.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const end = position(event);
    apply({
      x: Math.min(drag.x, end.x),
      y: Math.min(drag.y, end.y),
      width: Math.abs(end.x - drag.x),
      height: Math.abs(end.y - drag.y),
    });
  });
  original.addEventListener('pointerup', () => {
    drag = undefined;
  });
  original.addEventListener('pointercancel', () => {
    drag = undefined;
  });
  host.querySelector('#crop-done')!.addEventListener('click', () => {
    details.open = false;
    done();
  });
  details.addEventListener('toggle', refresh);
  return {
    refresh,
    draw,
    open() {
      details.open = true;
      refresh();
      details.scrollIntoView({ block: 'start' });
    },
  };
}
