# Verification

## Independently verified

Environment: macOS on Apple Silicon, Node 24.19.0, pnpm 11.19.0, Chromium 153.0.8010.12 (Playwright 1.63.0). Tests operate on the production static build.

- TypeScript and 68 deterministic tests: full 49-word synthetic passage, all 28 exercised character keys, both thumbs, intentional wrong fingers on both hands/rows, ambiguity, absent/duplicate hands, stale/dropped/out-of-order frames, processing deadlines, attempt ownership, erased mistakes, pause/retry, WPM and storage failure recovery.
- Real bundled MediaPipe model starts in its worker on Chrome’s **fake camera**, returns zero hands on that fixture, and uses native capture timestamps. Request inspection finds only the application origin, including model and WASM. This checks runtime/network behavior, not recognition accuracy.
- Thirteen browser tests cover guided calibration, full passage, word feedback, all-unknown and mixed words, confident wrong fingers with unknowns (including erased mistakes and space), text errors, both correctly observed and unknown full passages, results/restart, legacy/new persistence and reset, permission denial, missing capture timestamps, worker failure, blocked storage, boundary input ownership and recovery. See the PR/CI result for the final executed counts and screenshots.
- Production build and formatting checks pass. Workflow validation and the dependency audit were verified in PR #2; neither workflows nor dependencies changed here.

One integration finding: validating capture time against rVFC’s earlier render-tick timestamp intermittently discarded valid frames. The implementation now uses `performance.now()` sampled in the callback for validation, while preserving `captureTime` as the observation timestamp. The controlled fixture also preserves pose history by capture time rather than substituting its current pose at inference time.

## ALO-181 policy regression

The approved refinement accepts matching text unless there is confident wrong-finger evidence. Core tests cover all-unknown and mixed words, unknown submitting spaces, preserved erased mistakes, text mismatches, deadline expiry, immutable settled observations and exact counts. Browser tests complete a 49-word all-unknown passage after one text-error retry: 50 submitted attempts, one retry, zero detected wrong fingers and 263 unverified presses (261 passage characters including submitting spaces, plus two presses from the failed attempt). A separate complete passage exercises confident correct observations. These are controlled software results, not real-camera accuracy measurements.

At the final screen, unknowns are labeled “unverified presses”; no accepted word is claimed to have every finger verified. The all-unknown flow continues through repeated tracking gaps without recovery prompts. A delayed worker result cannot revise an accepted word or leak blocked input into the next word. The existing capture-clock and camera setup safety checks remain unchanged.

## Hardware acceptance — pending

No physical MacBook keyboard attempts were observed during ALO-181 implementation. ALO-181 records Al’s report of frequent missed observations; a dropout percentage and its cause remain hypotheses. **Real tracking accuracy, confirmed false rejections and missed deliberate mistakes remain unmeasured in this verification.** This change does not prove zero false rejections. The model’s own labels cannot establish correctness.

A short hands-on check:

1. Run `pnpm dev`; use Chrome on the external display. Tilt the built-in MacBook webcam toward the keyboard. Map the 30 positions; confirm every dot and each hand label. Try f, j and space in the optional diagnostic; confirm the observed labels match your actual fingers.
2. Complete the 49-word passage using correct fingers at a comfortable, deliberate pace. Record false wrong-finger rejections and unverified press counts; unknowns alone should advance without retries. If false rejections repeatedly interrupt you, use setup repair, adjust lighting/framing/dots, and repeat the complete passage. Do not count this acceptance as passed merely because the results screen is reachable.
3. On another passage, deliberately use the left index for **a** (first word), **q** (quick), **z** (zipped), and right index for **o** (fox), **l** (sleepy), **.** (village.). Keep the other letters correct. Confidently detected wrong fingers should stay on the word and explain the finger; repeat correctly to advance. Record missed or unknown deliberate mistakes as well: ALO-181 explicitly accepts missed detections to avoid tracking-only retries. Also submit a word’s space with a non-thumb. Complete the passage.
4. Reload, confirm saved-map reuse still requires alignment checks, then move the lid slightly and **remap**. Check that Reset local data removes calibration/history. Observe whether word boundaries are responsive and whether attempted input during checking is clearly explained.

Record this concise evidence on [ALO-180](https://linear.app/advantagegroup/issue/ALO-180), referencing [ALO-181](https://linear.app/advantagegroup/issue/ALO-181) for the updated progression policy:

| Field                      | Record                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Setup                      | MacBook model, macOS/Chrome versions, built-in camera, lid angle/framing, lighting |
| Correct passages           | Number completed, comfortable pace, effective WPM                                  |
| Confirmed false rejections | Count, word/key, actual finger confirmed by Al                                     |
| Unverified presses         | Count; whether setup changes reduced them                                          |
| Deliberate wrong fingers   | Each key/actual finger, detected / missed / uncertain                              |
| Boundaries                 | Typical visible delay, dropped/buffered-input confusion                            |
| Decision                   | Acceptable for practice, or exact remaining issue and next adjustment              |

Do not post raw camera footage or secrets. Text evidence and aggregate numbers are sufficient. Significant tuning belongs in issue comments and focused code changes; synthetic results remain labelled as synthetic.

## UI evidence

These are screenshots of the implemented interface. Practice/results images use **synthetic landmarks and Chrome’s fake video**, and their counts are software-test outputs, not real-camera accuracy measurements.

[Introduction](images/introduction.png) · [Practice](images/practice-synthetic.png) · [Wrong-finger feedback](images/wrong-finger-synthetic.png) · [Results](images/results-synthetic.png) · [Unknown words accepted](images/unknown-practice-synthetic.png) · [Unknown passage results](images/unknown-results-synthetic.png)
