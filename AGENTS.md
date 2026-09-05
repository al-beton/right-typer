# AGENTS.md

Right Typer is currently specced, not implemented.

Read [SPEC.md](SPEC.md) before planning or writing product code. Treat it as the source of truth for the first prototype. If implementation exposes a genuine conflict, update the spec explicitly rather than silently changing the product behavior.

## Boundaries

- Keep the product browser-only. Do not introduce an application backend, accounts, analytics, uploads, or remote inference.
- Camera frames, landmarks, calibration data, and typed content stay on the device.
- The first supported environment is Chrome on a MacBook Air or MacBook Pro with an Apple British ISO keyboard.
- Keep MediaPipe behind an adapter so the tracking model can be replaced.
- Run inference outside the UI thread and keep frame-rate data outside React state.
- Prefer small pure TypeScript modules for finger mapping, calibration, grading, and statistics.
- Do not claim camera accuracy without running the manual acceptance checks in the spec on the target hardware.

Use `codex/` branches for agent-created implementation work. Keep changes focused and reviewable.
