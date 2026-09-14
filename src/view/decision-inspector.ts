import type { AttributionDecision } from '../core/observation';
import type { Calibration, Press } from '../core/types';

// Explicitly armed, one decision only. No image, history, persistence or upload.
export function decisionInspector(host: HTMLElement) {
  host.innerHTML = `<details><summary>Inspect a finger decision</summary>
    <p>Capture the next press in practice or the finger check, then return here. Only decision metadata stays here until cleared or the camera setup changes. No footage is recorded. Distances use calibrated key units; points use full-source coordinates. The observation is an estimate, not a declaration of the finger you actually used.</p>
    <button type="button" data-arm>Inspect next press</button>
    <button type="button" data-clear>Clear decision</button>
    <pre style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:24rem;overflow:auto" data-decision>No decision captured.</pre>
  </details>`;
  const readout = host.querySelector<HTMLElement>('[data-decision]')!;
  let armed = false;
  const clear = () => {
    armed = false;
    readout.textContent = 'No decision captured.';
  };
  host.querySelector<HTMLButtonElement>('[data-arm]')!.onclick = () => {
    armed = true;
    readout.textContent = 'Waiting for the next practice or finger-check press…';
  };
  host.querySelector<HTMLButtonElement>('[data-clear]')!.onclick = clear;
  return {
    clear,
    capture(press: Press, calibration: Calibration, decision: AttributionDecision, source: object) {
      if (!armed) return;
      armed = false;
      const key = press.code ?? press.key;
      readout.textContent = JSON.stringify(
        {
          source,
          press: { key: press.key, code: press.code, at: press.at },
          calibration: {
            width: calibration.width,
            height: calibration.height,
            swapHands: calibration.swapHands,
            keyPoint: calibration.points[key],
            ...(key === ' ' || key === 'Space'
              ? {
                  spaceLeft: calibration.points['space-left'],
                  spaceRight: calibration.points['space-right'],
                }
              : {}),
          },
          selectedFrame: decision.frame,
          frameOffsetMs: decision.frame ? decision.frame.at - press.at : null,
          observation: decision.observation,
          candidates: decision.candidates,
        },
        null,
        2,
      );
    },
  };
}
