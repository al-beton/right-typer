# Working on Right Typer

Read [SPEC.md](SPEC.md) first. The repository is at the specification stage; implement only when the user asks.

- Follow the supported hardware, privacy requirements, and first-exercise scope in the spec.
- Treat explicitly labelled defaults and proposed technical choices as hypotheses to test. Do not silently promote them to user requirements.
- The prior attempt on `codex/sol-work` is preserved for reference. Start fresh; do not merge or copy its implementation unless the user asks.
- Keep camera processing local, inference off the UI thread, and grading independently testable.
- Preserve uncertain tracking as a real outcome. Never infer finger use from the expected typing map.
- Validate actual camera behaviour with the user on the intended hardware. Synthetic tests cannot prove tracking accuracy.
- Keep changes focused and use `codex/` branches and pull requests. Keep SPEC.md current when a product decision changes.
