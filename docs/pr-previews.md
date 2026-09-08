# GitHub PR previews

ALO-245 owns the requirements. Production remains at
https://al-beton.github.io/right-typer/ with its existing Pages workflow.

## Operation

`Preview build` checks out the exact PR head with no persisted credentials. It
builds in a disposable GitHub-hosted job with read-only source access, no cache
shared with publishing and no secrets. Its immutable Actions artifact expires in
seven days. No feature merge is needed.

`Publish previews` runs only trusted main-branch code, on PR lifecycle events,
build completion, hourly recovery, or manual dispatch. It reconciles **all** open
PRs because GitHub concurrency can replace pending runs. A single concurrency
group serializes preview writes; non-force Git ref updates reject other writers.
The target contains `pr-N/` trees and generated files; replacing one subtree
preserves the others. Closed PRs and forks without current approval are retired.

The publisher checks workflow ID, source/head repository, PR number, successful
run, exact head SHA, artifact identity and size. ZIP entries are validated in
memory: no filesystem extraction, hidden paths, traversal, symlinks, duplicate
paths, special files or publishing configuration. Expanded files are limited to
100 MiB / 2,000 entries. Only static blob/tree APIs are used; no package install,
PR checkout, shell script, generated workflow or contributor code executes in
the privileged job. `.nojekyll` in the generated repository disables Jekyll.

A sticky bot comment says Ready only after public `preview.json` **and every
listed file's SHA-256** match the expected build. The publisher checks the live
PR state/head/approval before writing, while waiting and before Ready. A changed
head or closure during publication retires the obsolete tree. API/network
failures fail closed; rerun to reconcile. GitHub events and CDN propagation are
asynchronous: previously served bytes/cached tabs cannot be recalled immediately.

Outside forks need an **APPROVED GitHub review on the exact current head** from a
reviewer who currently has write/maintain/admin source permission. A new commit
invalidates that approval; a dismissed or superseded decisive review does not
count. GitHub's own approval to run fork Actions is a separate prerequisite.
After reviewing, manually run Publish previews or wait for hourly reconciliation.
Deployment approval does not mean merge approval.

## Initial setup (account owner)

1. Choose a separate HTTPS origin. `al-beton.github.io/another-repo` is the same
   origin as production and is rejected. An organization Pages hostname or an
   already-owned dedicated subdomain works. Do not reuse an origin holding
   sensitive applications. AdvantageLabs is accessible to this account, and is being provisioned by the separate setup task.
2. Create a **public** generated repository, e.g.
   `AdvantageLabs/right-typer-previews`, with a `gh-pages` branch containing only a
   short README and empty `.nojekyll`. Enable GitHub Pages from gh-pages, root.
   Branch publication uses free public-repository GitHub infrastructure.
3. Create a fine-grained PAT with the target organization as resource owner,
   **only that generated repository**, **Contents: read/write** and default
   Metadata: read. No source repo grant, Administration, Workflows, or Pages
   write permission. Choose a 90-day expiry (or shorter organization policy).
   Approve the token in organization settings if required. The publisher uses
   public HTTP byte checks, so it does not need Pages read permission.
4. Create source Actions environment `pr-preview-publishing`. Set deployment branch
   policy to **selected branches**, with only `main` allowed. Add `PREVIEW_DEPLOY_TOKEN`
   as an **environment secret**, never a repository/organization secret. This
   prevents a contributor workflow from requesting it from a PR or other branch.
   Only the trusted publishing job references this environment. Protect main and
   review publisher/workflow changes as security-sensitive code.
5. Source repository Actions variables: `PREVIEW_REPOSITORY=owner/repo`,
   `PREVIEW_BASE_URL=https://owner.github.io/repo/` (or the chosen subdomain path),
   `PREVIEWS_ENABLED=true`. Set the enable switch last, after origin and secret
   protections are checked. Comments use the separate job-scoped source
   `GITHUB_TOKEN` with pull-requests write; the PAT never writes source comments.
6. Merge the reviewed infrastructure PR so workflow_run/dispatch/schedule can
   use it. Existing PRs predating the build workflow need the workflow on their
   branch and a new push, or rebase onto main; do not merge those features.
7. Use two QA PRs: wait for exact-commit Ready links, push to one, rerun an older
   build, then close one. Verify the other directory and production hashes stay
   unchanged. Test an outside fork with no review, old-head approval and then a
   current-head maintainer approval. Inspect job permissions and environment
   policy, not secret values. See validation evidence in ALO-245.

## Camera, storage and trust

A publisher-injected script adds the PR/commit/backlink and namespaces
`localStorage` methods by PR before app modules start. This also works for older
feature heads without changing production application code. Reset/clear stays
within that PR namespace. This is convenience, **not isolation**: JavaScript can
bypass it, read other same-origin storage, register service workers or modify the
banner. PRs share camera permissions and one review origin. Only open code you
trust and grant camera access deliberately. Use a separate browser profile for
untrusted reviews and clear site permissions/storage afterward. No claim is made
that a manifest makes reviewed JavaScript safe or that previews isolate PRs.

Assets, model, WASM and classic tracking worker use relative paths. Browser checks
must exercise `/repo/pr-N/`, including the real local model with fake video.
Those checks establish software startup, not physical-camera tracking accuracy.
Real MacBook camera/setup validation must be reported separately.

## Rotation, revocation and recovery

- Rotate before expiry: create a replacement PAT with the same single-repository
  scope, replace the environment secret, dispatch and verify a preview, then
  revoke the old PAT in GitHub Settings → Developer settings → Fine-grained PATs.
- Emergency stop: set `PREVIEWS_ENABLED=false`, cancel the active publisher,
  revoke the PAT, and disable preview Pages if published content must be removed.
  Disabling a workflow/credential alone does not remove already published files.
- Recovery: restore the environment secret/policy, verify origin configuration,
  re-enable and dispatch Publish previews. Re-run Preview build if its artifact
  expired. A failed Pages verification leaves a non-ready comment and can be
  retried. Never manually force-push over an active publisher.
- Inspect Publish previews logs for failure type, Pages deployment status and the
  source build. Do not paste credentials or signed artifact URLs into issues.
- Generated history is disposable. Monitor site size against GitHub Pages limits;
  close abandoned PRs and keep per-build limits. If history grows large, stop
  publishing, rebuild gh-pages as a fresh orphan containing currently approved
  preview trees plus README/`.nojekyll`, then re-enable and reconcile. Do not
  delete source history. Public builds must not contain secrets or raw recordings.

## Why a small trusted publisher

[OpenGeos](https://github.com/opengeos/pages-preview) demonstrates the dedicated
repository layout. [EndBug/pages-preview](https://github.com/EndBug/pages-preview)
provides preview lifecycle utilities, but those do not by themselves establish
this task's artifact provenance, current-head fork review, scoped environment
secret and deployed-file verification requirements. The stdlib publisher keeps
that boundary explicit and independently testable; no third-party hosting.

[GitHub workflow_run guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
warns that the receiving workflow can access secrets/write tokens. That is why
only trusted main code reads the untrusted static artifact here.
