# Right Typer

Right Typer is a browser-only typing coach that uses the built-in MacBook camera to check which finger pressed each key. The first prototype guides one device through camera setup, a 31-input keyboard calibration, one 50-word lesson, word retries, and local results.

## Supported setup

- Current desktop Google Chrome
- MacBook Air or MacBook Pro with its built-in camera
- Apple British ISO keyboard
- Screen angled so the camera sees both hands and the full letter area, including the space bar

Other browsers, computers, external keyboards, and keyboard layouts are not yet supported.

## How it works

1. Frame the keyboard using the TypingTA-inspired trapezoid guide.
2. For each supported input, click its centre in the mirrored preview and press it with the prompted finger.
3. Confirm the completed key overlay.
4. Type the passage. Space grades each non-final word; the final word grades on its last character.
5. Retry incorrect or wrong-finger words. Uncertain tracking retries are free.

Calibration is versioned and saved in `localStorage` for the same camera. Camera frames and the short landmark buffer stay in memory.

## Privacy

Right Typer has no backend, account, uploads, analytics, or remote inference. The MediaPipe JavaScript, WebAssembly, and Hand Landmarker model are served from the same static site. A page-level Content Security Policy blocks off-origin connections, images, scripts, workers, and media, and the inference worker rejects any non-same-origin `fetch` request.

The static host still receives ordinary requests for the application files. MediaPipe's package notice says its APIs may send performance and usage metrics; Right Typer's Content Security Policy blocks those off-origin requests. Verify the network panel as part of each release using the [manual acceptance checklist](docs/MANUAL_ACCEPTANCE.md).

## Local development

Node 24 is specified in `.nvmrc`.

```sh
npm ci
npm run dev
```

Then open the local URL in Chrome. Camera access requires `localhost` or HTTPS.

Useful checks:

```sh
npm run lint
npm test
npm run build
npm run coverage
```

## Static deployment

`npm run build` creates a backend-free `dist/` directory for any static host. To build for this repository's GitHub Pages path:

```sh
BASE_PATH=/right-typer/ npm run build
```

The included Pages workflow builds and deploys that path after a push to `main` once GitHub Pages is configured to use GitHub Actions.

## Current limitations

- Finger classification is a first-pass heuristic using calibrated fingertip proximity, vertical motion, handedness, and temporal consistency.
- Thresholds have unit coverage but still need tuning with real camera data on both target MacBook types.
- Hands must remain visible; low-confidence or ambiguous samples intentionally become free retries.
- A full calibration takes 31 deliberate click-and-press samples.
- No camera accuracy claim is made until the manual target-hardware acceptance trials are recorded.

See [SPEC.md](SPEC.md) for the product contract, [docs/MANUAL_ACCEPTANCE.md](docs/MANUAL_ACCEPTANCE.md) for hands-on verification, and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled dependency notices.

## License

Apache License 2.0. See [LICENSE](LICENSE).
