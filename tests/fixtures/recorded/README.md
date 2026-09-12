# Human-labelled recording fixtures

These are **real recorded numeric inputs**, not synthetic hands. Normal `pnpm test`
and `pnpm check` replay the production `attribute()` rule against every labelled
press. Run just this set with `pnpm test:reference`.

`pilot-human-v2` contains 77 human labels from four recordings by one participant.
The current rule agrees with 73/77. Four known disagreements remain: one C, two Z
presses and a thumb Space. The 16 presses in the new recording agree with its labels.
A green regression run means no new errors relative to that documented baseline;
it does **not** mean every prediction is correct. Fixing a known error passes;
changing it to a different wrong answer fails. Ground-truth labels stay unchanged.
`pnpm test:reference:accuracy` requires every prediction to match the human label
and currently fails on those four cases.

Files:

- `cases.json`: the key, relative keypress time, nearby frame IDs, human finger and
  allowed typing fingers. Human labels are the reference, not typing-map guesses.
- `frames.jsonl`: cached 2D hand landmarks and their relative capture/arrival times.
  Frames are deduplicated within each recording. Only frames available by the
  recorded observation, within ±500 ms of the press, are included.
- `recordings.json`: recorded calibration and physical keyboard geometry.
- `known-disagreements.json`: explicitly documented model mistakes, separate from
  the human labels. Do not add entries just to make a failing test green.
- `manifest.json`: source archive/label/snapshot checksums for reproducibility.

The test checks the attribution heuristic using recorded tracking output. It does
not run MediaPipe on video, replay the entire asynchronous evidence timeline, or
establish usability/general accuracy across people. Other synthetic tests cover
buffer timing and grading; `pnpm sample` replays full private recordings. The [full camera benchmark](../../../docs/camera-benchmark.md) reruns the production
vision model on all captured PNG inputs. The four pilot archives are published with
explicit approval; other recordings and review histories remain in the private library.

The export contains no video, images, participant/session identifiers, local paths,
absolute recording dates, device identifiers or reviewer notes. Recording names
are generic, times are relative, and only the 2D tracking inputs are retained.

To add a reviewed snapshot, export to a **new** fixture directory:

```sh
python3 scripts/dataset/export_reference.py /private/library SNAPSHOT tests/fixtures/recorded/SNAPSHOT
```

The exporter verifies source integrity, reads human labels only from that snapshot,
and keeps the reverse lookup to original sessions/frames in the private library's
`derived/` directory. Review the numeric data, labels and proposed known-error list
before committing; update the fixture path in the test and this baseline summary.
The exported data is an immutable, small evaluation asset. Large-scale collection
continues in the private library rather than growing ordinary CI to thousands of videos.
