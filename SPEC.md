# Right Typer: first prototype

Status: specification only. This replaces the first specification and is the starting point for a new implementation. The previous attempt is preserved on `codex/sol-work`; it is not an implementation dependency.

## The product

A free, open-source typing exercise that teaches the user to press keys with the correct fingers. Set up the camera and keyboard, type one playful passage, retry words with finger mistakes, then see typing speed and mistakes.

The entire application runs in the browser. No account or application backend. The first deliverable is one polished, usable exercise, not a course or a computer-vision dashboard.

## Requirements carried forward

- Chrome on a MacBook Air or MacBook Pro, with an Apple British ISO keyboard.
- Use the laptop camera and the physical arrangement the user has already tested successfully with TypingTA. The setup guide should demonstrate that arrangement.
- Manually calibrate the keyboard key by key initially. Faster calibration can come later.
- One passage of about 50 words covering all 26 letters. Lowercase, spaces, commas and full stops; no numbers or Shift required.
- Let the user finish a word before rejecting its finger use. Tune the brief boundary delay through actual typing tests.
- Keep the live camera view visible below the passage throughout the exercise.
- End with WPM and understandable mistake counts.
- Clean branding, taking cues from the directness of 10FastFingers and the restraint of Monkeytype.
- Store settings and calibration on the user's device. Easy local development and static deployment to GitHub Pages.
- Apache 2.0 project license; preserve the licenses and attribution for dependencies and model assets.

Desktop only. No phones, accounts, cloud sync, leaderboards, curriculum, or custom model training in this first version.

## What the tracking system must do

A browser keyboard event tells us which physical key was pressed. A hand-landmark model estimates the positions of the fingers. Calibration places the keyboard in the camera image. Our own classifier combines those observations to infer which finger pressed the known key.

MediaPipe Hand Landmarker is the proposed starting point, not evidence that finger grading will work automatically. It reports hands and landmarks, not key contacts. The difficult part is reliable attribution during real typing, particularly adjacent fingers, occlusion, and the interval between video frames.

TypingTA is the reference for camera framing and manual key registration. Its public help explicitly describes uncertain classifications and possible false accusations. Our word gate therefore needs an honest "could not tell" outcome and an easy route back to calibration.

## Camera and calibration

1. Explain the exercise and local processing, then request camera permission on user action. Handle permission refusal, missing camera, and an unavailable camera with useful instructions.
2. Show framing guidance and a live image. Both hands and the main typing block should be visible, including the number row and spacebar. Follow the tested TypingTA setup without inventing hardware requirements.
3. Show an Apple British ISO keyboard diagram. Prompt the user to click the centre of each key in the camera image, one at a time, with undo and correction.
4. Calibrate the full main typing block, including keys the first passage does not exercise. This means the number row, letter and punctuation rows, ISO Enter, modifiers around those rows, and spacebar. The function row, Touch ID, trackpad, and navigation cluster are not needed. Keep the exact layout in data.
5. Show all calibrated centres over the image and require a visual confirmation. Do not silently infer unregistered centres or substitute a US ANSI layout.
6. Run a short check with representative keys on both hands before the lesson. This validates framing and attribution; it is not a mandatory training sample for every key.
7. Save the map locally and offer reuse next visit, subject to a framing check.

Keep inference coordinates independent of the mirrored preview. Store points normalized to the source frame, plus schema/layout version, camera choice, dimensions, and orientation. Changing the camera or incompatible geometry requires recalibration. Moving the screen can invalidate a map even on the same device: show the overlay on reuse and make recalibration readily available.

The Apple British ISO layout is the constraint. Do not arbitrarily exclude an external Apple keyboard if it is the user's tested arrangement; other layouts and general camera setups are outside scope.

## Finger map

This is the mapping carried forward from the earlier discussion:

| Finger | Keys |
| --- | --- |
| Left little | q a z |
| Left ring | w s x |
| Left middle | e d c |
| Left index | r f v t g b |
| Right index | y h n u j m |
| Right middle | i k comma |
| Right ring | o l full stop |
| Right little | p semicolon slash |
| Either thumb | space |

Only letters, comma, full stop, and space are graded in this lesson. Registering other keys does not add them to the exercise or require inventing their finger rules.

## Lesson and word gate

The passage is the main element. Clearly distinguish accepted words, the active word, and the current character. Literal text errors appear immediately. Finger results appear at the word boundary.

Default behaviour for the first implementation:

- Collect each physical keydown with `KeyboardEvent.code`, resulting text with `key`, and a timestamp. Match it to a bounded buffer of timestamped hand observations, accounting for camera and inference delay.
- Space submits a non-final word; Enter submits the final word. Enter and Backspace are controls, not finger-graded lesson characters. The instruction for final submission must be visible.
- The word advances exactly once only after its final text is correct and all required finger observations pass.
- Backspace edits the current attempt. Erasing a character removes it from the candidate word, but does not erase its recorded mistakes or confidently wrong-finger press. A finger mistake requires a fresh word attempt.
- A rejected attempt shows which key and expected finger caused the problem, then lets the user retry that same word. A new attempt has fresh grading evidence.
- Ambiguous, missing, or stale observations yield "could not tell." They cannot pass a word or count as a finger mistake. If an attempt also contains a confirmed mistake, that mistake still counts; uncertainty must not hide it.
- While a boundary is being resolved, show a brief pending state and never attribute subsequent keys to the previous word. Start with a bounded pause; buffer subsequent typing only if testing demonstrates that this is necessary for a fluid experience.
- Repeated tracking failures lead to framing/calibration guidance. Do not create an endless unexplained retry loop.
- Holding a key, pasting, autofill, and composition must not bypass physical-key grading. Browser and system shortcuts should continue to work.

These details are first-pass defaults. Boundary delay, retry animation, and buffering are to be tuned with the user on the actual keyboard. Do not claim a fixed latency target was agreed.

## Results

Keep the first results screen simple:

- **WPM:** accepted passage characters, including punctuation and inter-word spaces, divided by five and elapsed minutes. Count each passage character once, regardless of retries.
- **Text mistakes:** incorrect character keydowns compared with the expected position when pressed.
- **Finger mistakes:** confidently incorrect finger events. An event may contribute to both text and finger totals; label them separately rather than adding them into a misleading accuracy percentage.
- **Word retries:** failed submissions, with tracking-only retries shown separately and excluded from the mistake total.

Start the timer on the first lesson character and stop when the final word passes. Include correction and retry time. If camera access is lost or the tab loses focus, pause the exercise explicitly and discard incomplete timing evidence before resuming with a fresh current-word attempt. Exclude only those explicit pause intervals.

A combined accuracy percentage is optional and should only be added with a documented denominator. WPM and mistakes are the required outcome.

## Proposed stack and local state

- React + TypeScript + Vite, producing ordinary static files.
- MediaPipe `@mediapipe/tasks-vision` and its compatible hand model, with exact versions selected and pinned during implementation.
- Run inference in a Web Worker. Keep video and frame-rate landmark updates outside React state; React manages the exercise and low-frequency feedback.
- Separate tracking, calibration, finger classification, word grading, statistics, and persistence. Grading and statistics should be plain testable TypeScript.
- Start with fingertip distance to the known key, handedness, and evidence across nearby frames. Keep the classifier replaceable. Add motion/depth heuristics only when measured examples justify them.
- Use versioned `localStorage` for the small calibration/settings document. Handle unavailable or cleared storage by offering calibration again; do not require persistence to use the app. IndexedDB is only needed if larger local datasets are later justified.
- No app backend, database service, auth, analytics, remote inference, or API keys. A static host serves the app and model files.
- Self-host JavaScript, WASM, models, and fonts. Audit the chosen MediaPipe distribution for metrics/network behaviour and verify actual requests before making privacy claims.
- Do not upload or persist video. Retain only the short in-memory landmark window necessary for grading; store calibration coordinates rather than raw video or motion history.
- Serve locally through localhost and remotely over HTTPS. Offline/PWA installation and cross-device sync are not first-version requirements.

## Build order and evidence

1. **Prove the core interaction:** camera, manual key centres, hand landmarks, and attribution of a real keypress. Check deliberate correct and wrong fingers on the supported MacBook. Establish a believable path to word gating before polishing the full interface.
2. **Complete one exercise:** onboarding, calibration reuse, passage, boundary grading, retries, and results.
3. **Finish and verify:** visual polish, unit tests, browser flow tests, privacy inspection, local instructions, and static build/deployment documentation.

Test pure grading with correct, wrong, mixed, uncertain, corrected, and repeated events. Test calibration coordinate transforms and invalidation. Browser tests may use synthetic observations to exercise flow, but cannot establish hand-tracking accuracy.

Record real-hardware observations for both hands and different rows: false acceptance, false rejection, uncertain results, and boundary delay. Do not invent universal accuracy or latency guarantees. The hands-on acceptance check is that normal correct typing can complete the passage, intentional wrong fingers are caught, and retries feel helpful rather than arbitrary.

A complete first prototype also needs:

- A fresh Chrome user can understand setup, register the keyboard, and complete the exercise.
- Reloading offers a valid saved map with a visual framing check; recalibration and local reset work.
- Incorrect or unknown finger events never silently advance a word.
- Camera loss, permission errors, focus changes, and a slow model produce recoverable states.
- The camera view stays below the passage and the exercise is usable at common MacBook viewport sizes.
- Statistics agree with recorded events, including retries and pauses.
- A fresh clone has documented install, run, test, build, and GitHub Pages deployment steps.
- Network inspection confirms no camera, typing, landmark, or calibration uploads and no analytics.
- The user completes the physical setup and typing test. Until then, report the result as an unvalidated prototype.

## References

- [TypingTA](https://typingta.com/): tested physical setup, framing and manual key registration.
- [MediaPipe Hand Landmarker for Web](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js): landmarks, video inference, and worker guidance.
- [MediaPipe repository](https://github.com/google-ai-edge/mediapipe): source license and privacy notice.
