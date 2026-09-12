# Right Typer

**One word. Well typed.** A browser-local camera-guided typing exercise with US, British (including Apple), German and French keyboard presets and editable custom profiles. On a MacBook, tilt the built-in webcam toward the keys and use an external display for the app.

The complete first version is implemented. **Real-camera acceptance is still pending**: automated tests cannot establish whether deliberate correct typing avoids false rejections on your hardware. Requirements and milestone evidence live in [Linear ALO-180](https://linear.app/advantagegroup/issue/ALO-180), with the always-answer finger attribution rule in [ALO-185](https://linear.app/advantagegroup/issue/ALO-185).

## Run locally

Install Node.js 24 and pnpm 11.19.0 (`npm install -g pnpm@11.19.0`), then:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Both dev and production prebuild the classic tracking worker. If you edit `src/tracking/worker.ts` while the dev server is running, rerun `pnpm worker` and reload.

Open the printed localhost URL in current Chrome on your external display. The page requests camera access immediately; allow it in Chrome. The camera button remains available to retry or restart. **Disconnect camera** stops video and hand tracking, including during startup or practice. Practice pauses with completed words kept; reconnect and select Resume practice to start the current word afresh. Explicit disconnect survives refresh until you reconnect. Saved calibration, camera selection and rotation are kept. Tilt the lid until both hands and the letter area/spacebar fit, and map the key centers. The compact word entry, finger map and camera share a center line, with camera setup below the preview. Rotate the camera view by 0°, 90°, 180° or 270° to match your setup. Video and key dots rotate together; labels remain upright. The angle is saved locally and changing it does not require remapping. Start practice sits beside the word entry and unlocks once all required positions for the selected profile are valid. Completing the map focuses it without starting practice. Before starting, press a practice key while focus is outside settings controls to see its observed finger near the camera. Unknown evidence stays unknown and never gates practice. Rotation and left/right label correction share one control row. No hand-visibility or confirmation checkbox gate is required.

Choose **Keyboard** in the green settings. New users default to US ANSI; existing British calibration migrates explicitly. Detection is optional. Custom supports press-key editing and local JSON import/export. See [keyboard profiles](docs/keyboard-profiles.md).

Choose **Standard**, **Alternate diagonal**, or **Either** below the keyboard. Standard keeps the original assignments; Alternate follows the explicit [ALO-228 map](https://linear.app/advantagegroup/issue/ALO-228), and Either accepts both, showing split colours and both finger names. These are fingering policies; key positions and OS input stay the same. The mode is saved locally and reset restores Standard. Changing it restarts the current incomplete word attempt, including pending checks, while keeping submitted work. Completed results list the policies used in submitted attempts and say “Mixed” when needed; earlier results are Standard. Discarded incomplete attempts do not contribute mistake counts, but their time remains in elapsed practice time.

Type the active word, including its punctuation, and **press space to submit**. Space is also checked; use either thumb, including after the last word. Every press is attributed to the fingertip nearest the key in the camera frame nearest the press. Matching text advances unless a wrong finger was observed. A press is unverified when no usable capture-timed hand evidence is available around it; unverified presses do not cause retries. A wrong finger or text mismatch stays on that word. Press Space again or click the retry button for a fresh attempt. Backspace edits the text but does not erase observed finger mistakes. Wait through the brief boundary check; keys pressed during it are explicitly reported as not entered. Escape pauses. Recheck setup whenever the lid moves.

Calibration, camera selection, rotation, whether you started practice, and the last ten completed results are saved in this browser’s local storage. Refresh reopens the selected camera and starts a fresh passage automatically after starting, provided its saved positions match the camera and image dimensions. Pause offers Resume practice at the word entry and keeps mapping closed; Edit setup opens key adjustments and focuses the camera. Both keep practice paused across refreshes. Resume keeps completed words and starts the current word afresh. Practise again starts a new passage directly when setup is valid. Inspect the overlaid dots and adjust them if the camera moved; a different camera requires remapping. An interrupted passage stays only in memory. **Reset local data** clears this app’s calibration, preferences and history after a second confirming click.

## Verify and build

```sh
pnpm format:check                  # Prettier formatting
pnpm lint                          # ESLint recommended JS/TypeScript rules
pnpm check                         # TypeScript + deterministic rules/timing tests
pnpm exec playwright install chromium
pnpm test:e2e                      # builds and tests the production app
pnpm build
pnpm preview                      # production build on localhost
```

Linux CI installs the browser with `pnpm exec playwright install --with-deps chromium`. See [verification results and hardware protocol](docs/verification.md). Synthetic tests use a test-only worker replacement; the shipped app has no bypass or simulated-practice mode. The separate real-model smoke test uses Chrome’s fake camera and verifies local model execution and network requests.

## Development flow

Contributions are welcome through public GitHub issues and pull requests; Linear membership is not required. See [CONTRIBUTING.md](CONTRIBUTING.md) for agreeing scope, supplying verification and working through review. It also explains the project's current assisted delivery workflow; contributors do not need to run agents.

## Required merge checks

The single required GitHub status is `blocking-checks`, defined in
[the orchestrator](.github/workflows/blocking-checks.yml). It requires verification
(types, unit/infrastructure tests, production build and browser tests), formatting,
ESLint, actionlint workflow validation, and Gitleaks secret scanning. Failed,
cancelled, or skipped prerequisites block merging. To add a check, wire its reusable
workflow into the orchestrator and include its job in the final gate's `needs` list.

Gitleaks scans all committed history reachable from the checked-out PR merge commit,
including credentials added and later removed within the branch. Findings are
redacted. Gitleaks and actionlint use pinned versions and verified download hashes.
Run `actionlint` (1.7.12) and `gitleaks git --redact --no-banner --log-opts="HEAD" .`
(8.30.1) locally to reproduce these checks.

[CODEOWNERS](.github/CODEOWNERS) assigns `@al-beton` ownership of GitHub configuration
and the package, lint, formatting and secret-scanning configuration. Branch protection
requires code-owner review, dismisses stale approvals after changes, and applies to
admins. Unowned application files do not require an approval. GitHub identifies actors
by account: an agent using Al's credentials is also `al-beton`, not an independent
reviewer. Use a separate author identity when a distinct approval from Al is required.
Repository administrators can still edit the protection settings themselves.

## Deploy to GitHub Pages

The output is entirely static. `pnpm build` puts HTML, scripts, styles, model, WASM and notices in `dist/`. Paths are relative, so the app supports the repository subdirectory `/right-typer/`. The model is checked into this repository and verified by SHA-256; WASM is copied from the pinned package during build. Builds do not download model assets.

Every push to `main` runs **Deploy static app to Pages**, which checks, builds and publishes `dist/` to `https://al-beton.github.io/right-typer/`. Pages is configured with GitHub Actions as its source. The workflow can also be run manually from the Actions tab for a redeploy without a new commit. Pull requests run Blocking Checks and the separate preview workflows; they never deploy to production.

Any static HTTPS host can serve the same folder. Do not use `file://`: camera access needs HTTPS or localhost. Serve `.wasm` as `application/wasm`. No API server, environment secrets, account or database is needed.

## Privacy and limitations

- Inference runs in a worker on this device. No analytics, CDN, font service, upload, audio access or cloud inference. Runtime requests are same-origin; a content security policy restricts connections. The host still receives ordinary requests for static files.
- During normal practice, camera frames are transient and closed after inference. Explicitly starting a debugging sample records video and tracking inputs in memory for local download. Only calibration, camera preferences, the Go preference and small aggregate results are saved locally.
- Recognition takes the capture-timestamped frame nearest each keypress (within ±500 ms) and names the fingertip nearest the calibrated key on any visible hand. There are no proximity, separation, confidence or frame-agreement gates: a press always gets the best available answer. Occlusion, depth/perspective error, crossed hands or slow frames can therefore produce a wrong finger rather than an unknown. It cannot prove physical key contact from 2D landmarks.
- Missing capture timestamps or no hands around a press leave its finger unknown; these do not block matching text. Setup repair remains available. Attribution accuracy on real hardware is unmeasured; the rule is chosen for simplicity and coverage, not proven precision.
- Correct-finger usability and deliberate wrong-finger detection need Al’s complete-passage hardware check. Faster learning is also a hypothesis, not an established result.

Architecture and metric definitions: [docs/architecture.md](docs/architecture.md). Passage data: [src/passage.ts](src/passage.ts). Licensed under [Apache 2.0](LICENSE); [third-party notices](public/THIRD_PARTY_NOTICES.txt) are included in the static distribution.

## Debugging samples

Open **Debugging** below the camera for opt-in camera/keymap/keypress sample export.
The section is collapsed by default, and recording starts only when you click
**Start sample (fresh passage)**. The `?record=1` shortcut opens the same section. See
[the recording and replay guide](docs/samples.md) before collecting a pilot.

For reusable human labelling and versioned private reference sets, see the
[dataset library guide](docs/dataset-library.md). The local review tool keeps raw
recordings, label history and frozen test sets separate from application code.

The [recorded-camera benchmark](docs/camera-benchmark.md) runs in GitHub Actions and
reports accuracy from camera pixels through MediaPipe and the production mapping
rules. The approved four-recording dataset is published as versioned release assets.
[Fast numeric reference tests](tests/fixtures/recorded/README.md) also exercise all 77
human-labelled presses in the normal test suite without rerunning the vision model.
