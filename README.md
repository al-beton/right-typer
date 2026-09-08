# Right Typer

**One word. Well typed.** A camera-guided typing exercise for a MacBook with an Apple British ISO keyboard, using the built-in webcam with the lid tilted toward the keys and an external display for the app.

The complete first version is implemented. **Real-camera acceptance is still pending**: automated tests cannot establish whether deliberate correct typing avoids false rejections on your hardware. Requirements and milestone evidence live in [Linear ALO-180](https://linear.app/advantagegroup/issue/ALO-180), with the always-answer finger attribution rule in [ALO-185](https://linear.app/advantagegroup/issue/ALO-185).

## Run locally

Install Node.js 24 and pnpm 11.19.0 (`npm install -g pnpm@11.19.0`), then:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Both dev and production prebuild the classic tracking worker. If you edit `src/tracking/worker.ts` while the dev server is running, rerun `pnpm worker` and reload.

Open the printed localhost URL in current Chrome on your external display. The page requests camera access immediately; allow it in Chrome. The camera button remains available to retry or restart. Tilt the lid until both hands and the letter area/spacebar fit, and map the key centers. The compact word entry, finger map and camera share a center line, with camera setup below the preview. Rotate the camera view by 0°, 90°, 180° or 270° to match your setup. Video and key dots rotate together; labels remain upright. The angle is saved locally and changing it does not require remapping. Go unlocks once all 30 required positions are valid. The optional test field shows observed fingers; swap left/right labels if needed. No hand-visibility or confirmation checkbox gate is required.

Type the active word, including its punctuation, and **press space to submit**. Space is also checked; use either thumb, including after the last word. Every press is attributed to the fingertip nearest the key in the camera frame nearest the press. Matching text advances unless a wrong finger was observed. A press is unverified when no usable capture-timed hand evidence is available around it; unverified presses do not cause retries. A wrong finger or text mismatch stays on that word. Press Space again or click the retry button for a fresh attempt. Backspace edits the text but does not erase observed finger mistakes. Wait through the brief boundary check; keys pressed during it are explicitly reported as not entered. Escape pauses. Recheck setup whenever the lid moves.

Calibration and the last ten completed results are saved in this browser’s local storage. Saved positions load automatically for the same camera and image dimensions. Inspect the overlaid dots and adjust them if the camera moved; a different camera requires remapping. An interrupted passage stays only in memory. **Reset local data** clears this app’s calibration/history after a second confirming click.

## Verify and build

```sh
pnpm check                         # TypeScript + deterministic rules/timing tests
pnpm exec playwright install chromium
pnpm test:e2e                      # builds and tests the production app
pnpm build
pnpm preview                      # production build on localhost
```

Linux CI installs the browser with `pnpm exec playwright install --with-deps chromium`. See [verification results and hardware protocol](docs/verification.md). Synthetic tests use a test-only worker replacement; the shipped app has no bypass or simulated-practice mode. The separate real-model smoke test uses Chrome’s fake camera and verifies local model execution and network requests.

## Deploy to GitHub Pages

The output is entirely static. `pnpm build` puts HTML, scripts, styles, model, WASM and notices in `dist/`. Paths are relative, so the app supports the repository subdirectory `/right-typer/`. The model is checked into this repository and verified by SHA-256; WASM is copied from the pinned package during build. Builds do not download model assets.

Every push to `main` runs **Deploy static app to Pages**, which checks, builds and publishes `dist/` to `https://al-beton.github.io/right-typer/`. Pages is configured with GitHub Actions as its source. The workflow can also be run manually from the Actions tab for a redeploy without a new commit. Pull requests run the Verify workflow only and never deploy.

Any static HTTPS host can serve the same folder. Do not use `file://`: camera access needs HTTPS or localhost. Serve `.wasm` as `application/wasm`. No API server, environment secrets, account or database is needed.

## Privacy and limitations

- Inference runs in a worker on this device. No analytics, CDN, font service, upload, audio access or cloud inference. Runtime requests are same-origin; a content security policy restricts connections. The host still receives ordinary requests for static files.
- Camera frames are transient, closed after inference and never recorded or persisted. Only calibration, camera ID and small aggregate results are saved locally.
- Recognition takes the capture-timestamped frame nearest each keypress (within ±500 ms) and names the fingertip nearest the calibrated key on any visible hand. There are no proximity, separation, confidence or frame-agreement gates: a press always gets the best available answer. Occlusion, depth/perspective error, crossed hands or slow frames can therefore produce a wrong finger rather than an unknown. It cannot prove physical key contact from 2D landmarks.
- Missing capture timestamps or no hands around a press leave its finger unknown; these do not block matching text. Setup repair remains available. Attribution accuracy on real hardware is unmeasured; the rule is chosen for simplicity and coverage, not proven precision.
- Correct-finger usability and deliberate wrong-finger detection need Al’s complete-passage hardware check. Faster learning is also a hypothesis, not an established result.

Architecture and metric definitions: [docs/architecture.md](docs/architecture.md). Passage data: [src/passage.ts](src/passage.ts). Licensed under [Apache 2.0](LICENSE); [third-party notices](public/THIRD_PARTY_NOTICES.txt) are included in the static distribution.
