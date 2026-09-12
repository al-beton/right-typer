# Recorded-camera accuracy benchmark

This is the primary end-to-end recorded-data benchmark. It starts from the recorded
camera **pixels**, runs the production MediaPipe worker, then runs the production
finger-attribution and grading logic against independently supplied human labels.
It reports an accuracy percentage; 100% is not required for a successful run.

## Run in GitHub

Open **Actions → Recorded camera accuracy → Run workflow**. The workflow also runs
on pull requests that change tracking, mapping, recording replay, model assets or
benchmark inputs, and on relevant main-branch changes. Each run publishes:

- An accuracy score and per-recording breakdown in the job summary.
- `report.json`: every human label and prediction, unclassified cases, grading
  counts, original-behaviour changes, and hashes of the model, worker and mapping code.
- `landmarks.json`: newly computed skeletal maps and inference timings for later
  analysis. These are outputs; a full benchmark never reuses them as model inputs.

The action fails for corrupt/missing data, a model/runtime error, or incomplete label
coverage. Ordinary misclassifications lower the score and remain visible; they do
not fail the action. This benchmark is separate from the required fast unit-test gate.

## Run locally

Install the project dependencies and Chromium, then:

```sh
pnpm exec playwright install chromium
python3 scripts/benchmark/prepare.py --output /private/camera-benchmark-inputs
pnpm benchmark:camera -- --input /private/camera-benchmark-inputs/input.json --output /private/camera-benchmark-report
```

The preparer downloads and verifies the four original archives (about 1.1 GB). To
reuse an existing managed library without downloading:

```sh
python3 scripts/benchmark/prepare.py --library /private/library --output /private/camera-benchmark-inputs
```

The reviewed label files and checksum manifest are in [`datasets/`](../datasets/).
The four camera recordings are published as versioned [GitHub release assets](https://github.com/al-beton/right-typer/releases/tag/reference-pilot-human-v2), with the contributor's explicit permission.
This keeps a normal source checkout small while making the full benchmark reproducible.
Future recordings remain private unless separately approved for publication.

## What is recomputed

1. Verify the original archive, calibration, frame and reviewed-label checksums.
2. Decode every captured PNG into an image bitmap, in capture-time order.
3. Start a fresh production worker for each recording. Run the pinned MediaPipe
   model with the app's CPU delegate, hand count and confidence settings.
4. Clear **all** archived skeletal maps, then replace them with the new model output.
   Recorded result events without corresponding pixels retain empty hands; there
   is no cached-landmark fallback.
5. Replay the original event/capture timeline through the production `EvidenceBuffer`
   and grading logic. Compare each resulting finger with its human label.
6. Score exact finger agreement. Unclassified predictions count as misses; human
   “can't tell” or unreviewed labels are excluded from the denominator.

The PNGs are the original camera images supplied to tracking, before any review
rotation. They are used instead of extracting frames from `camera.webm`, because
the recorder explicitly marks WebM as viewing-only; the PNGs have exact capture
IDs and times shared with the keypress log. This is a pixel-to-landmarks-to-finger
benchmark, not a test against cached skeletal maps.

Original event timings are replayed to keep the heuristic comparison reproducible;
CI inference wall time is reported separately and is not substituted for those
recorded timings. Fresh workers begin without pre-recording tracking history. This
can change predictions compared with a warmed-up recorded session. Camera frames
missed before capture cannot be reconstructed. These limitations remain visible
rather than being filled with old model results.

## Dataset and scores

`pilot-human-v2` has 77 human-labelled presses from four recordings, one participant,
and three setup aliases. It is development data, not an independent holdout or a
representative population accuracy estimate. The first local pixel-level run scored
**74/77 (96.1%)**, with no unclassified presses; platform/model changes may produce
a different score. Three C/Z disagreements remained. Compare runs using the same
dataset version and the recorded code/model hashes.

The [fast numeric reference tests](../tests/fixtures/recorded/README.md) also remain
in ordinary `pnpm check`: they isolate mapping regressions using cached landmarks
and currently match 73/77 labels. They complement, rather than replace, this full
camera benchmark. Different scores are possible because fresh MediaPipe tracking
can differ from the original session's tracking state.

To compare a future mapping method, run this action on its code branch using the
same dataset. The replay invokes production mapping functions, so new heuristic
implementations are evaluated through the same path. Publish a new dataset version
for additional recordings or corrected ground truth; do not silently replace release
assets or modify labels to agree with an algorithm.
