# Private reference library

The library pairs original recordings with human finger labels. Use it to compare
future algorithms or rebuild landmarks from captured pixels. It is a local research
tool, separate from the shipped browser app. Python 3.9+ and the project's Node/pnpm
installation are required (macOS or Linux).

## Collect, label, freeze

Keep the library outside **every Git checkout**. Participant IDs are pseudonyms,
assigned by the curator; reuse the same ID for the same person. Assign a new setup
ID when the keyboard or camera arrangement changes. Original recording metadata is
retained even when its participant/setup IDs were placeholders.

```sh
pnpm dataset -- init /private/right-typer-library
pnpm dataset -- import /private/right-typer-library /private/sample.tar \
  --participant person01 --setup laptop01 --split development
pnpm dataset -- review /private/right-typer-library --reviewer curator01
```

Open the printed localhost address. Watch each half-speed frame loop, then choose
a finger with the buttons or keys **1–0**. **Space** means “can't tell.” Each choice
saves before advancing. Back edits the preceding answer; reload resumes at the
first unlabelled press. A small circle flashes at the calibrated key when the press
happens. The review automatically orients the keyboard with Q on the left and P
on the right, using calibrated key positions rather than trusting the recorded
preview rotation. The footage and circle rotate together; original pixels and
calibration stay unchanged. If Q/P positions are unavailable, the recorded rotation
is retained. The circle marks the key location, not a predicted finger. No model answer or
standard typing finger is shown. Images are cached for only the current/next clip.

Nearby presses intentionally share overlapping footage, but each case has a unique
`sessionId/attemptId/pressId`. Hover over the saved-answer text to see that identity
and timestamp. Reimporting the same archive does not add duplicate cases; conflicting
archives with the same session ID are rejected.

To revisit questionable cases, supply `--queue /private/recheck.json`: a JSON array
of case IDs in review order. Existing answers are displayed and retained until the
reviewer submits again. Queue reviews start at the first case on each launch/reload.
Use a different `--reviewer` for a second independent annotator. Disagreement is
resolved by human review, never by copying model predictions into labels.

After review, explicitly promote one reviewer's answers to a named reference set:

```sh
pnpm dataset -- freeze /private/right-typer-library pilot-v1 --reviewer curator01
pnpm dataset -- verify /private/right-typer-library
```

`freeze` is the curator's approval step. Use `--exclude /private/unresolved.json`
(an array of case IDs) for unresolved disputes. Unlabelled/excluded presses become
`unreviewed`; “can't tell” stays `unlabelable`. Neither counts as confirmed truth.
Snapshots cannot be overwritten; subsequent corrections require a new snapshot.
The original journal and every previous answer remain available.

## Stored format (version 1)

```text
library.json                      # recording catalog and participant/setup/split aliases
archives/<sha256>.tar              # original recording bytes, addressed by checksum
recordings/<sessionId>/            # extracted original manifest, events, PNGs, etc.
annotations/<reviewer>.jsonl       # append-only human answers and corrections
imports/<reviewer>-<sha256>.json   # exact legacy label file, if migrated
snapshots/<name>/manifest.json     # pinned recordings, checksums, reviewer, exclusions
snapshots/<name>/index.jsonl       # paired press/frame references and selected annotation
snapshots/<name>/<session>.labels.jsonl # compatible with the existing sample replay CLI
derived/                          # future results, separate from human truth
```

Each journal row includes `schemaVersion`, full case `id`, `sessionId`, `attemptId`,
`pressId`, `atMs`, `finger`, `status`, `reviewer`, `source`, and `savedAt`. `finger` is
one of left/right × thumb/index/middle/ring/little, or null for unlabelable. The latest
row per case is that reviewer's current answer. Snapshot rows pin the selected
annotation, press/code/time, nearby timestamped frame paths, calibration key point,
camera geometry, archive checksum, participant, setup and split. The original
archive retains the complete calibration, all input frames, recorded landmarks,
model/app versions and event timeline, allowing a different frame window or model
to be used later. A snapshot's labels use the existing replay schema:

```json
{
  "attemptId": 1,
  "pressId": 12,
  "status": "confirmed",
  "finger": "left-middle",
  "source": "human:curator01; snapshot:pilot-v1"
}
```

Use `pnpm sample -- /private/original.tar --labels /private/library/snapshots/pilot-v1/SESSION.labels.jsonl`
to replay a recording against a snapshot. The existing report measures grading
behaviour and changes in recorded decisions; it is not a complete finger-classifier
accuracy metric and does not rerun the vision model on pixels. Future comparisons
should write to `derived/<method-version>/<snapshot>/` and identify both versions.

## Integrity and scope

Import validates archive paths, checksums and the application's recording schema.
`verify` checks archive/extracted-file integrity, label references, snapshot hashes
and participant separation. It cannot certify that a human interpreted footage
correctly. Archives and snapshots are immutable through the tool; keep a private
backup of the whole library to recover disk corruption or external edits. The
append-only journal is flushed on every answer; malformed/truncated journals fail
visibly rather than silently discarding labels.

Choose development, validation or test per **participant**, not per clip. The importer
rejects putting a person in multiple splits. Similar neighbouring clips must not be
randomly split across training and evaluation. A one-person pilot is useful regression
material, not evidence of performance across people or a held-out benchmark.

The local server binds only to loopback and serves the review UI and selected PNGs;
there is no public hosting, cloud upload or contributor portal. Catalog entries start
as `evaluation-only`. Obtain and record appropriate contributor permission before
sharing recordings or using them for training. Keep footage, labels, participant
identity mappings and real-data reports out of public Git and issue comments.

To preserve answers from the original quick-review prototype:

```sh
pnpm dataset -- import-labels /private/right-typer-library /private/human-quick-review.json \
  --reviewer curator01
```

This command is only for human label files. It validates press identity and timing,
keeps the exact original file and row metadata, and is idempotent. It refuses to
replace a conflicting existing answer. Keep the prototype's history file alongside
the imported evidence if earlier edits are needed; future edits use the journal.

Run `pnpm test:dataset` for synthetic integrity, migration and snapshot tests. CI
runs these without access to private recordings.

## Recorded fixtures in ordinary tests

The reviewed pilot also has a compact numeric copy in
[`tests/fixtures/recorded`](../tests/fixtures/recorded/README.md). `pnpm test:reference`
runs the production finger-attribution heuristic against all 77 human labels; these
checks also run automatically in `pnpm test` and `pnpm check`/CI. Known disagreements
are explicit, and an optional strict accuracy command fails until they are fixed.
The first four recordings were subsequently approved for publication and are used by
the [full camera benchmark](camera-benchmark.md). Other recordings remain private
unless separately approved. See the fixture guide for regeneration
and for the distinction between heuristic regression, full replay and vision-model evaluation.
