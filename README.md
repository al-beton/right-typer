# Right Typer

Right Typer is a planned open-source typing tutor that uses a laptop camera to check whether each key was pressed with the intended finger.

This repository is intentionally at the specification stage. It contains a minimal React and TypeScript scaffold, but the product has not been implemented yet.

Read [SPEC.md](SPEC.md) for the agreed first prototype, technical approach, and acceptance criteria.

## Intended stack

- React, TypeScript, and Vite
- MediaPipe Hand Landmarker in the browser
- A Web Worker for hand-landmark inference
- Browser storage for calibration and preferences
- Static hosting, with no application backend

## Local setup

```sh
npm install
npm run dev
```

## Status

The project is specced and ready for implementation. The generated starter screen is not the Right Typer prototype.

## License

Apache License 2.0. See [LICENSE](LICENSE).
