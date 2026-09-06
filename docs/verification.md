# Verification

## Independently verified

Environment: macOS on Apple Silicon, Node 24.19.0, pnpm 11.19.0, Chromium 153.0.8010.12 (Playwright 1.63.0). Tests operate on the production static build.

- TypeScript and 61 deterministic tests: full 49-word synthetic passage, all 28 exercised character keys, both thumbs, intentional wrong fingers on both hands/rows, ambiguity, absent/duplicate hands, stale/dropped/out-of-order frames, processing deadlines, attempt ownership, erased mistakes, pause/retry, WPM and storage failure recovery.
- Real bundled MediaPipe model starts in its worker on Chrome’s **fake camera**, returns zero hands on that fixture, and uses native capture timestamps. Request inspection finds only the application origin, including model and WASM. This checks runtime/network behavior, not recognition accuracy.
- Eleven browser tests cover guided calibration, full passage, word feedback, results/restart, persistence/reset, permission denial, missing capture timestamps, worker failure, blocked storage, boundary input ownership and recovery. See the PR/CI result for the final executed counts and screenshots.
- Both workflows pass a full YAML parse and actionlint; formatting checks pass.
- Production dependency audit reports no known vulnerabilities at verification time.

One integration finding: validating capture time against rVFC’s earlier render-tick timestamp intermittently discarded valid frames. The implementation now uses `performance.now()` sampled in the callback for validation, while preserving `captureTime` as the observation timestamp. The controlled fixture also preserves pose history by capture time rather than substituting its current pose at inference time.

## Hardware acceptance — pending

No physical MacBook keyboard attempts were observed in this implementation session. Al said the keyboard was currently out of frame. **Confirmed false rejections, missed deliberate mistakes and real-camera uncertainty retries are unmeasured, not zero.** The model’s own labels cannot establish correctness.

A short hands-on check:

1. Run `pnpm dev`; use Chrome on the external display. Tilt the built-in MacBook webcam toward the keyboard. Map the 30 positions; confirm every dot and each hand label. Try f, j and space in the optional diagnostic; confirm the observed labels match your actual fingers.
2. Complete the 49-word passage using correct fingers at a comfortable, deliberate pace. Record every false wrong-finger rejection and every uncertainty-only retry. If these repeatedly interrupt you, use setup repair, adjust lighting/framing/dots, and repeat the complete passage. Do not count this acceptance as passed merely because the results screen is reachable.
3. On another passage, deliberately use the left index for **a** (first word), **q** (quick), **z** (zipped), and right index for **o** (fox), **l** (sleepy), **.** (village.). Keep the other letters correct. Each deliberately wrong attempt should stay on its word and explain the finger; repeat correctly to advance. Also submit a word’s space with a non-thumb. Complete the passage.
4. Reload, confirm saved-map reuse still requires alignment checks, then move the lid slightly and **remap**. Check that Reset local data removes calibration/history. Observe whether word boundaries are responsive and whether attempted input during checking is clearly explained.

Record this concise evidence on [ALO-180](https://linear.app/advantagegroup/issue/ALO-180):

| Field                      | Record                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Setup                      | MacBook model, macOS/Chrome versions, built-in camera, lid angle/framing, lighting |
| Correct passages           | Number completed, comfortable pace, effective WPM                                  |
| Confirmed false rejections | Count, word/key, actual finger confirmed by Al                                     |
| Uncertainty retries        | Count; whether setup changes reduced them                                          |
| Deliberate wrong fingers   | Each key/actual finger, detected / missed / uncertain                              |
| Boundaries                 | Typical visible delay, dropped/buffered-input confusion                            |
| Decision                   | Acceptable for practice, or exact remaining issue and next adjustment              |

Do not post raw camera footage or secrets. Text evidence and aggregate numbers are sufficient. Significant tuning belongs in issue comments and focused code changes; synthetic results remain labelled as synthetic.

## UI evidence

These are screenshots of the implemented interface. Practice/results images use **synthetic landmarks and Chrome’s fake video**, and their counts are software-test outputs, not real-camera accuracy measurements.

[Introduction](images/introduction.png) · [Practice](images/practice-synthetic.png) · [Wrong-finger feedback](images/wrong-finger-synthetic.png) · [Results](images/results-synthetic.png)
