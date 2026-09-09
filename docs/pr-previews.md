# GitHub PR previews

ALO-245 owns the requirements. Production remains at
https://al-beton.github.io/right-typer/ with its existing Pages workflow.

## Operation

`Preview build` checks out the exact PR head with no persisted credentials. It
builds in a disposable GitHub-hosted job with read-only source access, no cache
shared with publishing and no secrets. Its immutable Actions artifact expires in
seven days; an already published current preview remains available, re-verified
from the generated repository's manifest without needing the expired artifact. No feature merge is needed.

`Publish previews` runs only trusted main-branch code, on PR lifecycle events,
build completion, hourly recovery, or manual dispatch. It reconciles **all** open
PRs because GitHub concurrency can replace pending runs. A single concurrency
group serializes preview writes; non-force Git ref updates reject other writers.
A failed/hostile artifact reports failure without preventing other PRs from
reconciling. The target contains `pr-N/` trees and generated files; replacing one subtree
preserves the others. Closed PRs and forks without current approval are retired.

The publisher checks workflow ID, source/head repository, PR number, successful
run, exact head SHA, run-attempt-specific artifact identity and size. For fork runs,
GitHub may omit the PR list; the fallback binds the run to the live PR's exact
head repository, branch and SHA. ZIP entries are validated in
memory: no filesystem extraction, hidden paths, traversal, symlinks, duplicate
paths, special files or publishing configuration. Expanded files are limited to
100 MiB / 2,000 entries. Only static blob/tree APIs are used; no package install,
PR checkout, shell script, generated workflow or contributor code executes in
the privileged job. `.nojekyll` in the generated repository disables Jekyll.

A sticky bot comment says Ready only after public `preview.json` **and every
listed file's SHA-256** match the expected build. The publisher checks the live
PR state/head/approval before reading artifacts or writing, while waiting and before Ready. A changed
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

1. Use the personal account repository `al-beton/right-typer-previews` at
   `https://al-beton.github.io/right-typer-previews/`. The user explicitly chose
   the same browser origin as production, with a separate repository and path.
   The publisher rejects the production repository and production path.
   Do not use an employer or other company account for this personal project.
2. Create a **public** generated repository, e.g.
   `al-beton/right-typer-previews`, with a `gh-pages` branch containing only a
   short README and empty `.nojekyll`. Enable GitHub Pages from gh-pages, root.
   Branch publication uses free public-repository GitHub infrastructure.
3. Register a **private GitHub App** owned by the personal account `al-beton` and install it on
   **only the generated repository**. Grant **Contents: read/write** and automatic
   Metadata: read. No source repository, organization, Administration, Workflows,
   or Pages permission. Disable webhooks, subscriptions and user authorization;
   the App only authenticates the trusted publisher. Current App:
   [Right Typer Personal Previews](https://github.com/apps/right-typer-personal-previews).
4. Create source Actions environment `pr-preview-publishing`. Set deployment branch
   policy to **selected branches**, with only `main` allowed. Add `PREVIEW_PUBLISHER_PRIVATE_KEY`
   as an **environment secret**, never a repository/organization secret, and set
   environment variable `PREVIEW_PUBLISHER_APP_ID` to the App ID. This
   prevents a contributor workflow from requesting it from a PR or other branch.
   Only the trusted publishing job references this environment. Protect main and
   review publisher/workflow changes as security-sensitive code.
5. Source repository Actions variables: `PREVIEW_REPOSITORY=owner/repo`,
   `PREVIEW_BASE_URL=https://owner.github.io/repo/` (or the chosen subdomain path),
   `PREVIEWS_ENABLED=true`. Set the enable switch last, after origin and secret
   protections are checked. Comments use the separate job-scoped source
   `GITHUB_TOKEN` with pull-requests write; the App never writes source comments.
6. Merge the reviewed infrastructure PR so workflow_run/dispatch/schedule can
   use it. Existing PRs predating the build workflow need the workflow on their
   branch and a new push, or rebase onto main; do not merge those features.
7. Use two QA PRs: wait for exact-commit Ready links, push to one, rerun an older
   build, then close one. Verify the other directory and production hashes stay
   unchanged. Test an outside fork with no review, old-head approval and then a
   current-head maintainer approval. Inspect job permissions and environment
   policy, not secret values. See validation evidence in ALO-245.

## Camera, storage and trust

A publisher-injected script adds a muted footer label (`Review PR #N · short SHA`)
with links to the PR and commit, and namespaces
`localStorage` methods by PR before app modules start. This also works for older
feature heads without changing production application code. Reset/clear stays
within that PR namespace. This is convenience, **not isolation**: JavaScript can
bypass it, read other same-origin storage, register service workers or modify the
label. Previews and production share camera permissions and browser storage
on `al-beton.github.io`; the PR prefix is convenience rather than isolation. Only open code you
trust and grant camera access deliberately. Use a separate browser profile for
untrusted reviews and clear site permissions/storage afterward. No claim is made
that a manifest makes reviewed JavaScript safe or that previews isolate PRs.

The production Pages build shows `Production · short SHA` in the same footer; local
builds show `Local`. No warning banner, overlay or acknowledgement is added.
Publisher format changes regenerate current previews from retained artifacts; if
an artifact has expired, re-run its Preview build to apply the new format.

Assets, model, WASM and classic tracking worker use relative paths. Browser checks
must exercise `/repo/pr-N/`, including the real local model with fake video.
Those checks establish software startup, not physical-camera tracking accuracy.
Real MacBook camera/setup validation must be reported separately.

## Rotation, revocation and recovery

- The App private key has **no scheduled expiration**; treat it as a long-lived
  credential that still needs revocation if compromised. No expiring personal
  token or paid service is required. The pinned `actions/create-github-app-token`
  step issues a token scoped explicitly to `al-beton/right-typer-previews`
  with Contents write. Installation tokens expire after one hour; post-job cleanup
  revokes them sooner (including ordinary failures). If runner loss prevents
  cleanup, expiration bounds the lifetime. The publisher job times out at 30 minutes.
- To rotate the App key, generate a replacement in the App settings, replace
  `PREVIEW_PUBLISHER_PRIVATE_KEY`, verify a real changed preview, then delete the old key.
  Never print keys/tokens, put them in command arguments or retain downloaded keys.
  Keep the App installed only on the preview repo; a key can mint tokens for any
  installation of its App. Main administrators and trusted workflow/action code
  can access this key; no credential design guarantees zero security flaws.
- Emergency stop: set `PREVIEWS_ENABLED=false`, cancel the active publisher,
  suspend/uninstall the App and revoke its keys/tokens, and disable preview Pages if published content must be removed.
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
