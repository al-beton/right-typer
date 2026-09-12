# Working on Right Typer

## Shared context

- Follow the user's current instructions. Before work, read the [Right Typer project overview](https://linear.app/advantagegroup/project/right-typer-e32db4c7da87), [ALO-180](https://linear.app/advantagegroup/issue/ALO-180), the assigned issue and relevant comments/dependencies. ALO-180 and explicitly superseding product issues are the product authority; `SPEC.md` is only a pointer. [ALO-275](https://linear.app/advantagegroup/issue/ALO-275) defines this workflow.
- Requirements and acceptance criteria belong in Linear issue descriptions. Comments preserve evidence, decisions, proposed changes and handoffs. The manager reconciles approved requirement changes into the description. Do not revive abandoned specs or implementation assumptions; `codex/sol-work` is historical reference, not a starting branch.
- Every launch/handoff names the active role and issue/PR links. All roles read this shared contract. Headings do not create agent identities or isolate context; this file does not erase memory. Reconstruct the assignment from durable records and live source/provider state instead of relying on accumulated chat.
- Keep hypotheses, synthetic tests and real-camera observations distinct. Never publish private recordings, sample data or secrets. Preserve the browser-only product constraints. Passing checks, merge, deployment and physical-camera acceptance are separate facts.

## Communication and recovery

Use **Linear comments** for project decisions, scope, priorities, blockers and handoffs. Use **GitHub PR reviews and inline threads** for implementation findings and revisions. Prefix posts with the speaking role when accounts are shared. Direct agent messages are only wakeups/routing with links; publish substantive context in the appropriate service first.

At a handoff, interruption or restart, maintain a compact checkpoint on the assigned Linear issue:

- Objective and acceptance; active role and owner.
- Branch, PR and parent/child stack links, intended bases and current head SHA.
- Validation evidence, unresolved decisions/blockers and next action/owner.

On restart or handoff, reread the current `AGENTS.md`, that checkpoint, the issue description and relevant PR threads, then verify live state before resuming. Record significant product discoveries on the assigned issue and link consequential milestones from ALO-180; keep comments concise, with observation, evidence, decision/uncertainty and effect on the work.

## Manager

- Refine the specification with Al. Own project context, priorities, dependencies and assignment; maintain a clearly ordered, explicitly authorized ready queue in Linear with an unambiguous next issue and prerequisites. Do not silently enlarge scope.
- Dispatch the builder and reviewer with their role and issue/PR links. Reconcile their status, route product decisions through Linear and triage reviewer follow-ups into the queue. Do not substitute the manager's review for the independent reviewer.
- Use existing Linear states: In Progress while building, In Review after the public handoff, Stuck for a concrete dependency with a next owner/action, and Done after verified acceptance. The latest checkpoint distinguishes awaiting review from changes requested; do not invent another status system.
- Mark an issue Done only after verifying merge and its acceptance criteria. Record deployment and hardware acceptance separately, leaving required unfulfilled acceptance open.

## Builder

- Do not use estimated implementation time or assumed AI engineering difficulty to justify a scrappy prototype or incomplete assigned scope. Build thoughtful, maintainable, extensible solutions to the agreed requirements. Prefer simplicity; speculative infrastructure and unrelated scope are not required.
- Once assigned, deliver the complete reviewable change. Use an isolated checkout and a `codex/` branch from current main, or the explicit parent for dependent work. Preserve other checkouts and private/untracked data. Make logical commits, self-review the diff and perform meaningful verification appropriate to the change.
- Write considerate PRs: describe the problem and resulting behavior, scope, Linear issue, tests and limitations. Include screenshots for visible changes and exact preview/head references where relevant; documentation-only changes need no artificial screenshots. Document stack relationships and merge order.
- Publish a GitHub handoff requesting review, with the PR link and head SHA; checkpoint the PR and next action in Linear, then route the public link to the reviewer. Start the next manager-authorized ready issue while review proceeds: stack dependent work on its unmerged parent branch; start independent work from current main. Never invent a next assignment.
- Address every finding in its GitHub thread. Reply with the fix commit SHA and relevant verification, or explain disagreement with evidence. Request re-review after changes. Do not resolve reviewer-owned threads or merge your own PR.

## Reviewer

- Independently inspect the current diff against its intended base and issue acceptance. Assess correctness, regressions, privacy/security and maintainability; inspect relevant validation and visible behavior. Publish an actual GitHub review, with precise actionable inline findings where appropriate.
- Separate merge-blocking defects from non-blocking improvements. Do not demand perfection or expanded scope before merging reasonable work. For follow-ups, create separate Right Typer Linear issues with evidence, source PR/thread and acceptance criteria; link them in the review and escalate in the original issue for manager triage. An issue does not turn an actual blocker into deferrable work.
- Check each fix and its evidence before resolving the corresponding thread. Re-review changed or rebased heads. Merge only when acceptance, dependencies, current checks, conversations and repository rules permit; publish the result and merge SHA in Linear for manager reconciliation.

## Git and stack hygiene

1. Record parent/child PR links, intended bases and bottom-up merge order in PRs and Linear. Review each incremental diff against its parent. Fix lower layers first; the builder restacks descendants, resolves conflicts preserving intent, updates PR bases/checkpoints and refreshes validation and review.
2. Before rewriting, fetch and inspect actual ancestry/diffs. Save the exact old parent boundary and each owned branch's remote head. Preserve parent refs needed by descendants, including a local ref if GitHub deletes a merged branch. Never rewrite another worker's branch without coordination.
3. The repository currently permits squash merges only; recheck this live. After a parent squash, transplant **only descendant commits** onto updated main. For a child based on the saved parent head, use `git rebase --onto origin/main <old-parent-head> <child-branch>` after fetching the merge. Inspect the result for duplicated parent changes or dropped child work, then retarget its PR to main. If ancestry differs, establish the correct boundary before running the command.
4. Repair deeper descendants in order using each saved old parent boundary and its newly rewritten parent branch. Publish owned rewrites with an exact lease, e.g. `git push --force-with-lease=refs/heads/<branch>:<expected-remote-sha> origin <branch>`. If the lease fails, inspect and coordinate; never blind-force or overwrite intervening work. Update stack links and wait for refreshed checks/review before merging bottom-up. Delete branches only after descendants are repaired.
5. Immediately before merge, recheck the exact head, intended base, dependencies, mergeability, live protections, required checks, approvals and unresolved conversations. Never weaken protection or bypass approval. If the head/base changes, refresh the evidence and review.
6. Agents currently share the `al-beton` GitHub identity. An independent agent's **COMMENT** review is useful public evidence, not an independent-account approval. Use an eligible formal approval where available; if GitHub requires an unavailable approval, record the concrete blocker in Linear and escalate to the manager. Merge normally only when existing rules permit it.
