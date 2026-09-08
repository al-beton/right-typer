# Implementation notes

[ALO-180](https://linear.app/advantagegroup/issue/ALO-180) remains the product specification, with the progression policy from [ALO-181](https://linear.app/advantagegroup/issue/ALO-181) and the always-answer attribution rule from [ALO-185](https://linear.app/advantagegroup/issue/ALO-185). This document explains the implementation rather than adding requirements.

## Boundaries

- `src/tracking/camera.ts`: camera lifecycle, synchronous frame snapshot, worker ownership and cleanup.
- `src/tracking/worker.ts`: pinned MediaPipe Hand Landmarker, CPU inference off the input thread.
- `src/core/observation.ts`: camera evidence buffer and actual-finger attribution. It does not import the intended finger map.
- `src/core/exercise.ts`: word/attempt state, expected-finger comparison and statistics. It has no camera dependency.
- `src/core/calibration.ts` and `storage.ts`: normalized key geometry, validation and versioned local state.
- `src/main.ts`: guided setup, live overlays, exercise UI and device-local results. No framework, backend or remote font dependency.

## One timeline, immutable ownership

The key event’s `timeStamp` and native rVFC `metadata.captureTime` are both compared on the Window performance timeline. Epoch-style keyboard timestamps are normalized against `performance.timeOrigin`. Camera capture time is preserved through the worker and output; inference completion time is only a latency diagnostic.

rVFC’s first `now` argument can be the **earlier render tick**. Observed Chromium fake-camera sample: `now=2437.8`, `captureTime=2444.2`, callback `performance.now()=2444.5` ms. Validate against the clock sampled inside the callback, otherwise legitimate frames can be discarded as “future” frames. There is no presentation-time fallback for grading. [Browser API reference](https://web.dev/articles/requestvideoframecallback-rvfc).

A `VideoFrame` is created synchronously inside the callback to freeze the pixels that go with the metadata, then converted to a transferable bitmap. At most one inference is in flight; other frames are dropped instead of accumulating a stale queue. Every bitmap and frame is closed. The worker receives an immutable frame ID and capture timestamp, and returns the same pair.

Each keypress has its own ID and attempt ID. Evidence settles continuously so long words do not depend on retaining their first video frames until the boundary. The buffer accepts out-of-order results, waits for known in-flight nearby frames, and never changes a settled observation. Camera generations, attempt IDs and exercise object identity prevent late work affecting a new stream, retry or restart.

Attribution searches ±500 ms around the press for the capture-timestamped frame nearest the press that shows at least one hand. Frames without hands are skipped; a frame on only one side of the press is fine. The buffer settles a press as soon as a frame after it has landed and no in-flight frame could be nearer than the best completed one, or at a 1000 ms deadline with whatever evidence exists. Only a press with no hands in any nearby frame is reported as unknown. These are tuning values, not acceptance targets.

## Geometry and confidence

Calibration records the 28 exercised character-key centers plus the left/right endpoints along the middle of space. It does not collect expected-finger training presses. Neighboring calibrated keys define local axes and key spacing; this accommodates image rotation and varying row spacing without requiring a perfect keyboard rectangle. Space is a segment scaled by nearby key spacing.

In the chosen frame every fingertip landmark on every visible hand competes by key-space distance to the pressed key, and the nearest one is the answer. There is no proximity threshold, separation margin, handedness-score gate, two-hands requirement or cross-frame agreement check: a keypress is certain, and the job is the best available estimate of the finger. Hand side comes from the model label with the user's swap applied; if both hands carry the same label they are told apart by position along the calibrated q→p axis. No intended finger enters this calculation; exercise grading compares the returned finger with the map afterwards. Each observation records the frame id, the distance and the frame-to-press time offset for later review of real-camera evidence.

This rule trades missed detections for coverage: a hovering or occluded finger can be named wrongly instead of producing an unknown. MediaPipe does not supply ground truth for occluded fingertips or physical contact, so real-camera tests must measure both false wrong-finger reports and missed deliberate errors. [MediaPipe task documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js).

Saved calibration is tied to camera ID and image dimensions. The single-page interface loads matching positions automatically, and Go requires a complete valid map and a running camera. It does not require hand visibility, capture timestamps or confirmation checkboxes. Changing devices requires remapping; hiding the tab pauses practice. The optional diagnostic shows observed fingers before Go. Lid motion during practice cannot be reliably auto-detected; the learner must pause and remap. This is an explicit limitation.

## Exercise semantics and statistics

Space submits, including after the final word, and is graded against either thumb. Input remains responsive within a word. During boundary analysis the entry is read-only; attempted boundary input is counted and explained, and never becomes input for another word. Retry requires Enter/button, so a pending key cannot accidentally start the next attempt.

Backspace edits visible text but preserves all observed character presses in the attempt. A confirmed wrong finger requires a fresh word attempt. Unsupported keys, held-key repeats, paste and IME input do not create graded characters. A submitted mismatch counts as one text mistake. At the word boundary, matching text advances if there are no wrong-finger observations, even when presses (including space) are unknown because no hands were in view. Pending evidence still receives the same bounded wait before becoming unknown; settled words are never regraded. A wrong finger vetoes the attempt even alongside unknown presses or after backspace. Unknowns never require a retry or setup repair. Unverified press counts include unknowns in all submitted attempts, including erased presses, spaces, accepted words and failed attempts; they are separate from learner mistakes. Unknowns are never assigned an intended finger.

Effective WPM = accepted passage characters (plus one space per accepted word) / 5 / elapsed minutes. Timing starts at the first character and ends at the final accepted submitting space. Retries, feedback-reading and pauses remain in elapsed time; processing after the final space does not. Wrong-finger count includes erased presses; retry count counts failed submitted attempts, not abandoned partial words. Completed results persist; live passages do not survive reloads. New results use `gradingPolicy: "wrong-finger-veto"` and `uncertainPresses`; the misleading `uncertaintyRetries` metric is no longer generated or displayed. Existing `right-typer.v1` results without a policy load as `verified-only`, retain their original counts and are labeled with the earlier rule in recent history. Their legacy retry counter is not converted to a press count. Calibration, ten-result history and reset remain compatible.

## Static assets and privacy

The pinned npm model runtime is prebuilt into a classic IIFE worker for both Vite dev and production (Vite’s native dev-worker path serves modules, which cannot call `importScripts`); Emscripten loads its local WASM loader using `importScripts`. The 7.5 MiB model is checked in, and build verifies its SHA-256 against `public/models/SHA256SUMS`. Both SIMD and non-SIMD WASM variants ship. There are no CDN URLs in runtime configuration. The HTML CSP allows same-origin scripts/connections and local WASM compilation. External repository links only navigate on user action.

Browser tests inspect real production requests through model startup, not merely a source-code search. Fake-camera fixtures contain no user images. Test traces/screenshots must stay synthetic; do not record or commit raw personal camera footage.
