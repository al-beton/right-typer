# Working on Right Typer

## Read before starting

[Linear issue ALO-180](https://linear.app/advantagegroup/issue/ALO-180) is the authoritative product specification. Read its current description and comments before implementation. SPEC.md is only a pointer to that issue.

Follow the user's current instructions. Start implementation only when asked. Once assigned the build, deliver the complete first version in a reviewable PR; the earlier planning status is not a reason to stop.

## Work and learning

- Start fresh from the current specification branch, or main once its PR is merged. The unfinished `codex/sol-work` branch and historical specs are reference material, not additional requirements.
- Choose implementation details within the Linear requirements. Do not revive abandoned calibration, grading, model, or stack assumptions merely because they exist in history.
- Record significant discoveries and decisions as comments on ALO-180: what was observed, supporting evidence, the decision or remaining uncertainty, and its effect on the build. Use concise milestone comments rather than a running activity log.
- Keep hypotheses, synthetic test results, and real-camera observations distinguishable. Do not put raw camera footage or secrets in comments.
- Keep the issue description authoritative for product requirements. Comments preserve evidence and rationale; explicitly identify any proposed requirement change.
- Use `codex/` branches and focused pull requests. Report what works, what was tested, and any remaining hardware validation accurately.
