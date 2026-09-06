# Right Typer

**One word. Well typed.** A camera-guided typing exercise for a MacBook with an Apple British ISO keyboard, using the built-in webcam with the lid tilted toward the keys and an external display for the app.

The complete first version is implemented. **Real-camera acceptance is still pending**: automated tests cannot establish whether deliberate correct typing avoids false rejections on your hardware. Requirements and milestone evidence live in [Linear ALO-180](https://linear.app/advantagegroup/issue/ALO-180), with the approved uncertainty policy refinement in [ALO-181](https://linear.app/advantagegroup/issue/ALO-181).

## Run locally

Install Node.js 24 and pnpm 11.19.0 (`npm install -g pnpm@11.19.0`), then:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Both dev and production prebuild the classic tracking worker. If you edit `src/tracking/worker.ts` while the dev server is running, rerun `pnpm worker` and reload.

Open the printed localhost URL in current Chrome on your external display. Enable the MacBook camera, tilt the lid until both hands and the letter area/spacebar fit, and map the key centers. Lift each hand to check the left/right labels. There is a switch if the model labels are reversed.

Type the active word, including its punctuation, and **press space to submit**. Space is also checked; use either thumb, including after the last word. Matching text advances unless a confidently wrong finger was observed. Unknown presses, including space, stay unverified and do not cause retries. A wrong finger or text mismatch stays on that word. Press Enter or click the retry button for a fresh attempt. Backspace edits the text but does not erase observed finger mistakes. Wait through the brief boundary check; keys pressed during it are explicitly reported as not entered. Escape pauses. Recheck setup whenever the lid moves.

Calibration and the last ten completed results are saved in this browser’s local storage. Every camera start requires alignment and hand-label confirmation. An interrupted passage stays only in memory. **Reset local data** clears this app’s calibration/history after a second confirming click.

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

After the implementation is reviewed and merged, choose **Settings → Pages → Source: GitHub Actions**, then run **Actions → Deploy static app to Pages → Run workflow** on `main`. The manual workflow builds and publishes `dist/`; it does not publish on a push or PR. The expected URL is `https://al-beton.github.io/right-typer/`. Confirm the successful deployment and open that URL before treating it as live. No deployment has been performed as part of this PR.

Any static HTTPS host can serve the same folder. Do not use `file://`: camera access needs HTTPS or localhost. Serve `.wasm` as `application/wasm`. No API server, environment secrets, account or database is needed.

## Privacy and limitations

- Inference runs in a worker on this device. No analytics, CDN, font service, upload, audio access or cloud inference. Runtime requests are same-origin; a content security policy restricts connections. The host still receives ordinary requests for static files.
- Camera frames are transient, closed after inference and never recorded or persisted. Only calibration, camera ID and small aggregate results are saved locally.
- Recognition currently uses fingertip proximity to manually calibrated keys in two capture-timestamped frames. Occlusion, depth/perspective error, crossed hands, ambiguous fingertips or slow frames can produce uncertainty or mistakes. It cannot prove physical key contact from 2D landmarks. The numeric hand label score is **handedness confidence**, not finger-attribution accuracy.
- Missing capture timestamps block practice. Once practice starts, missing/ambiguous finger evidence stays unknown but does not block matching text. Accepted words are not proof of verified finger use; missed wrong-finger detections are an accepted tradeoff. Setup repair remains available. The thresholds are initial hypotheses, not measured accuracy guarantees.
- Correct-finger usability and deliberate wrong-finger detection need Al’s complete-passage hardware check. Faster learning is also a hypothesis, not an established result.

Architecture and metric definitions: [docs/architecture.md](docs/architecture.md). Passage data: [src/passage.ts](src/passage.ts). Licensed under [Apache 2.0](LICENSE); [third-party notices](public/THIRD_PARTY_NOTICES.txt) are included in the static distribution.
