# Right Typer: first prototype specification

## Objective

Prove that a browser can combine keyboard events with laptop-camera hand tracking closely enough to teach conventional touch-typing finger placement.

The first prototype should let someone calibrate their keyboard, type one short lesson, retry any word typed with the wrong finger, and receive words-per-minute and mistake totals at the end. It must run entirely client-side.

## Supported setup

- Chrome on a MacBook Air or MacBook Pro
- Built-in laptop camera
- Apple British ISO keyboard
- Laptop screen angled so the camera can see both hands and the keyboard
- Desktop only

Other browsers, external keyboards, keyboard layouts, and phones are not part of the first prototype.

## User journey

The product is a single-page state machine:

1. **Introduction:** Explain the exercise, local processing, and required camera angle.
2. **Camera setup:** Ask for permission and show a live preview. The user adjusts the screen until both hands and the supported keys are visible.
3. **Calibration:** Prompt every supported key once. The user presses each highlighted key with its expected finger. Invalid or low-confidence samples must be repeated.
4. **Lesson:** Show the text prominently, with the current word and character clear. Keep the camera preview visible beneath the typing area throughout.
5. **Word result:** Let the user finish the current word. Grade it when they press space, or when they complete the final word.
6. **Completion:** Show words per minute and mistakes, with a restart action.

Calibration may be saved on the device and reused. A later version can add a faster calibration path.

## First lesson

Use this 50-word lesson. It contains every letter of the alphabet and uses only lowercase letters, spaces, commas, and full stops:

> quick foxes jump over lazy dogs, while bright wizards pack five quirky boxes. calm typists breathe, place each finger gently, and watch small mistakes become smooth rhythm. every careful word builds speed without rushing, until the keyboard feels familiar and your hands know exactly where to go next with confidence.

## Finger mapping

| Finger | Keys |
| --- | --- |
| Left little | `q a z` |
| Left ring | `w s x` |
| Left middle | `e d c` |
| Left index | `r f v t g b` |
| Right index | `y h n u j m` |
| Right middle | `i k ,` |
| Right ring | `o l .` |
| Right little | `p ; /` |
| Either thumb | `space` |

The first lesson grades only the letters, comma, full stop, and space. Semicolon and slash are calibrated to preserve the agreed mapping, but are not used in the lesson. Numbers, uppercase letters, and other punctuation are out of scope.

## Grading rules

For each physical keydown, record the expected character, actual character, expected finger, observed finger, confidence, and timestamps.

- Typing continues until the end of the current word, even if an earlier key was wrong.
- A word passes only when its text is correct and every graded character was pressed with the expected finger.
- A failed word does not advance the lesson. Show character-level feedback, clear the attempt, and let the user type the same word again.
- A confident wrong-finger result counts as one mistake for that attempt.
- Incorrect text counts as one mistake for that attempt.
- Tracking uncertainty or a temporarily hidden hand triggers a free retry and does not count as a mistake.
- Backspace may repair text within an attempt, but it does not erase an already observed wrong-finger press. The word will still fail at its boundary.
- Space accepts either thumb and completes the word. It is tracked, but either thumb is correct.
- Words per minute is calculated from accepted characters divided by five and divided by elapsed minutes, starting with the first lesson keypress and ending when the final word passes.

If text and tracking failures occur in the same attempt, they still count as one failed attempt in the headline mistake total. Detailed diagnostics may retain both reasons.

## Tracking approach

Use MediaPipe Hand Landmarker as the first landmark model. It returns handedness plus 21 landmarks for each detected hand. It does not know which keyboard key was pressed, so Right Typer must add calibration and temporal classification.

Proposed pipeline:

1. Capture camera video with `getUserMedia`.
2. Run two-hand landmark inference in `VIDEO` mode inside a Web Worker.
3. Keep a short timestamped ring buffer of fingertip landmarks and confidence values.
4. During calibration, associate each browser key event with the corresponding fingertip position and motion around that timestamp.
5. During the lesson, use the keydown timestamp plus the calibrated signatures to classify the finger that moved into the pressed key.
6. Return `correct`, `wrong finger`, or `uncertain`. Never guess when confidence is below the calibrated threshold.

The first classifier should compare fingertip proximity and downward motion in a small window around keydown. The implementation should keep this logic behind a narrow interface so it can be replaced by a learned classifier later without changing the lesson or grading code.

MediaPipe's web inference calls are synchronous, so they must not run on the UI thread. Camera frames should not be copied into React state.

## Technical shape

- **UI:** React and TypeScript
- **Build:** Vite, producing static files
- **Tracking:** `@mediapipe/tasks-vision`, with model and WebAssembly assets served from the same site
- **Concurrency:** Web Worker for video inference
- **Persistence:** browser storage for calibration, camera preference, and settings
- **Testing:** unit tests for mapping, grading, calibration transforms, and statistics; manual camera validation on both target MacBook types
- **Hosting:** GitHub Pages or another static host

Suggested module boundaries:

- `tracking`: camera access, MediaPipe adapter, worker, landmark ring buffer
- `calibration`: key samples, quality checks, transform and invalidation
- `typing`: lesson state, finger map, word grading, statistics
- `storage`: versioned device-local settings
- `ui`: setup, calibration, lesson, feedback, and results screens

No application server, database, account, cloud sync, analytics, or remote inference is required.

## Local data and privacy

- Camera frames must never be uploaded or persisted.
- Derived landmarks should remain in memory and be discarded after their short classification window.
- Calibration and settings may be persisted locally using a versioned schema.
- Typed lesson content and results remain on the device.
- Runtime code, model files, and WebAssembly should be same-origin assets. The app should not depend on a third-party CDN after deployment.
- Before release, verify browser network traffic and document any telemetry from dependencies. Local inference is not by itself proof of zero outbound requests.

The static host will receive normal requests for the app's files. That does not constitute an application backend.

## Calibration requirements

- Cover all 31 mapped inputs: 26 letters, comma, full stop, semicolon, slash, and space.
- Record the camera device, video dimensions, calibration version, and sample quality.
- Require both hands to be visible before starting.
- Reject a sample when the expected hand is missing, handedness is ambiguous, landmarks are stale, or motion confidence is too low.
- Offer a complete recalibration from the lesson screen.
- Invalidate saved calibration when its schema changes or the selected camera changes.

## Interface direction

- Clean, quiet typing surface influenced by Monkeytype and the clarity of 10FastFingers, without copying either product.
- The text to type is the main visual element.
- Current word and current character are unmistakable.
- Wrong text and wrong-finger feedback are visually distinct.
- The live camera preview is always visible below the typing element during calibration and the lesson.
- The preview may overlay landmarks and the currently inferred fingertip, but should not become the main interface.
- The experience must fit comfortably in a MacBook browser viewport without scrolling during the lesson.

## Prototype acceptance criteria

- A first-time user can grant camera permission, position the laptop, calibrate all supported keys, and begin the lesson without developer help.
- Refreshing the page can reuse a valid calibration stored on that device.
- The lesson never advances past a failed word.
- The lesson advances after a word whose text and finger use are correct.
- Tracking uncertainty produces a free retry rather than a false pass or counted mistake.
- On representative deliberate wrong-finger presses for `a`, `f`, `j`, `p`, `c`, and `m`, at least 8 of 10 trials are rejected on each target MacBook.
- At least 9 of 10 correctly typed representative words are accepted on each target MacBook.
- Word-boundary feedback appears within 150 ms at the 95th percentile on each target MacBook.
- The camera preview remains responsive while typing.
- Completion shows words per minute and failed-attempt count.
- A production build is static and deployable to GitHub Pages.
- A network audit finds no camera, landmark, calibration, or typed-content uploads.

## Explicit non-goals

- Mobile or tablet support
- Safari or Firefox support
- Windows or non-Apple keyboards
- External keyboard calibration
- Accounts, leaderboards, cloud history, or multiplayer
- Multiple lessons, adaptive curricula, or typing courses
- Numbers, uppercase letters, symbols beyond comma and full stop
- A custom hand-landmark model
- Production-grade accuracy across arbitrary lighting and camera positions

## Decisions left to the prototype

These are implementation experiments, not blockers to starting:

- The exact temporal window and confidence thresholds for classifying a press
- Whether proximity alone is sufficient or finger-velocity features are required
- How much landmark overlay is useful during typing
- The best visual treatment and duration for failed-word feedback

## Definition of done for the first implementation issue

The prototype is done only when the complete journey works from a fresh Chrome profile on a supported MacBook, the manual accuracy and latency checks above are recorded, the static build is deployed, and the README accurately describes the tested limitations.

## Primary references

- [MediaPipe Hand Landmarker for Web](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
- [MediaPipe source and license](https://github.com/google-ai-edge/mediapipe)
