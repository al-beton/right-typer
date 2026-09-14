# ALO-288 input candidate

This is a shipping successor to research PRs #49/#50, based on main `8b7f601`. Both routes use ordinary camera settings and the same practice pipeline. Research tasks remain archived.

- Safari: allow Camera, then select **Studio Display Desk View Camera**. Map the keys, check alignment, and resume practice. No query parameter or staged trial is required.
- Window sharing: open Desk View, choose **Share window (Desk View)**, select its window, and map the keys. Audio is disabled. Every share gets a new map; window maps do not overwrite saved camera maps. Stop/reconnect requires another explicit picker selection.
- Direct-camera maps are retained per camera and keyboard profile. Video dimension changes pause practice and invalidate mapping. Use **Remap key positions** after a same-size crop, zoom, camera, or keyboard movement.

## Timing and open acceptance

Ordinary webcam timestamp behavior is unchanged. Desk View and shared windows use an **explicit estimated source timestamp**: valid browser `captureTime` if present, otherwise the rVFC callback clock. The baseline subtracts **zero assumed upstream delay**. Raw native timestamp, callback clock, source, media time and frame identity are retained. Candidate selection, watermark and in-flight settlement use the same timestamp. Expected finger does not select the observed finger; the existing nearest-frame/nearest-tip rule, wrong-finger veto and no-hands unknowns apply.

**This baseline has no measured exposure-error bound.** `uncertaintyMs: null` expresses that limitation. A callback/browser timestamp is not optical exposure; model turnaround and the ±500 ms search window do not establish an exposure bound. Al subsequently accepted the combined Safari crop candidate `cd1b1e4` and authorized delivery under ALO-288/289. That acceptance supersedes the initial candidate hold; it does not supply a calibrated exposure bound or general accuracy result. Finish current review/checks and verified deployment of the accepted Safari increment. Chrome/window hardware acceptance remains open separately; do not mark it passed from Safari feedback. Native Apple slider API support is separately deferred and is not required for the accepted crop. Synthetic checks alone do not complete ALO-288.

Sources: [rVFC timing semantics](https://wicg.github.io/video-rvfc/), [screen capture specification](https://w3c.github.io/mediacapture-screen-share/), and the preserved [ALO-287 research handoff](https://linear.app/advantagegroup/issue/ALO-287).

## Independent checks

Unit coverage verifies source provenance, estimated-frame attribution, in-flight settlement, and storage round trips. Browser fixtures verify permission-dependent Desk View discovery, separate maps, reload, observed wrong fingers, window correct/wrong/unknown practice, video-only capture, cancellation/stop/re-share, changed dimensions, and ordinary webcam reconnect. A separate browser case runs the real bundled hand model on synthetic video and audits local-only requests. None is installed-Safari or physical-finger evidence.
