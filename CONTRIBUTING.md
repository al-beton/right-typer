# Contributing to Right Typer

Human contributions are welcome. You do not need Linear membership or six agents to contribute.

## From proposal to merge

1. Open a [GitHub issue](https://github.com/al-beton/right-typer/issues) describing the problem, desired result and relevant evidence, or comment on an existing issue/PR. Link the Linear issue if one exists. Maintainers can mirror scope into Linear and provide the agreed acceptance criteria in the public GitHub conversation when you cannot access it.
2. Agree enough scope to build and review the change before implementation: expected behavior, acceptance, dependencies and exclusions. Requirements remain authoritative in Linear; repository guides explain the process rather than duplicate the product specification. Maintainers reconcile approved changes between Linear and the public discussion.
3. Work from current main on a focused branch, or an agreed parent branch for dependent work. Use logical commits and preserve unrelated work and private data. Follow the [local setup and verification commands](README.md#verify-and-build); run checks appropriate to the change.
4. Open a PR linking the issue and describing the problem, result, scope, tests and limitations. Include screenshots for visible changes and the exact preview/head tested; documentation changes need formatting and link checks, not artificial screenshots. Keep synthetic results distinct from real-camera evidence. Never publish private recordings or secrets.
5. Answer each review finding in its GitHub thread with the fix commit and verification, or explain disagreement with evidence. Request another review after changes; the reviewer verifies fixes and resolves threads. For an agreed non-blocking deferral, maintainers record a bidirectionally linked Linear issue with the observed problem/evidence, originating PR and exact thread, rationale, impact/workaround, concrete acceptance and next owner/priority or revisit trigger. The reviewer records the deferred disposition before resolving, without calling it fixed. Keep material limitations visible in PR and merge summaries. Current-scope correctness/acceptance, privacy, data loss, security and broken practice remain blockers; planning targets create no quality exception.
6. A reviewer or maintainer lands the change after final-head review, [required checks](README.md#required-merge-checks), resolved conversations and current repository protections permit it. Dependent PRs merge bottom-up, with descendants repaired after squash merges. Merge, deployment and hardware acceptance are reported separately.

## Current assisted delivery workflow

The product liaison turns discussion with Al into scoped work, uses researcher and product designer advice, and authorizes increments within the approved initiative. The delivery manager assigns ready work and supervises status, dependencies, CI and review. The builder implements; the independent reviewer checks the PR and handles merge. Research/design helpers advise unless separately assigned implementation.

Research/design issues finish when the liaison accepts the brief/artifacts and reconciles their decisions into product issues; they need no implementation PR. Code and documentation work require reviewer-owned merge and verified acceptance.

[AGENTS.md](AGENTS.md) holds the shared role, autonomy, escalation, recovery and Git rules. Current owners and the ready queue live in Linear. Project decisions and handoffs belong in Linear; implementation findings and revisions belong in public GitHub threads. Shared-account posts identify their role; an independent agent's COMMENT review is not an independent-account approval. Contributors can follow this same public review path without reproducing the agent setup.
