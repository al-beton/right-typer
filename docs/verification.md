# Verification

## Independently verified

Environment: macOS on Apple Silicon, Node 26.8.1, pnpm 11.19.0, Chromium (Playwright 1.63.0). Tests operate on the production static build.

- TypeScript and 72 deterministic tests: full 49-word synthetic passage, all 28 exercised character keys, both thumbs, intentional wrong fingers on both hands/rows, nearest-frame selection with one-sided and out-of-order frames, handless frames skipped, one hand, low handedness score, far fingertips, same-label hands relabelled by position, swap, no-hands unknowns, in-flight waiting, deadlines, attempt ownership, erased mistakes, pause/retry, WPM and storage failure recovery.
- Real bundled MediaPipe model starts in its worker on Chrome’s **fake camera**, returns zero hands on that fixture, and uses native capture timestamps. Request inspection finds only the application origin, including model and WASM. This checks runtime/network behavior, not recognition accuracy.
- Browser tests cover in-place calibration, full passage, word feedback, no-hands unknown and mixed words, wrong fingers with unknowns (including erased mistakes and space), text errors, a correctly observed full passage and a passage with unknown words, results/restart, legacy/new persistence and reset, permission denial, missing capture timestamps, worker failure, blocked storage, deadline answers from the nearest completed frame, boundary input ownership and recovery. See the PR/CI result for the final executed counts and screenshots.
- Production build and formatting checks pass. Workflow validation and the dependency audit were verified in PR #2; neither workflows nor dependencies changed here.

One integration finding: validating capture time against rVFC’s earlier render-tick timestamp intermittently discarded valid frames. The implementation now uses `performance.now()` sampled in the callback for validation, while preserving `captureTime` as the observation timestamp. The controlled fixture also preserves pose history by capture time rather than substituting its current pose at inference time.

## ALO-185 attribution rule

Attribution is one rule: the frame nearest the press with any hand, then the fingertip nearest the key. Core tests show single frames before or after the press attributing, the nearest of several frames winning, handless frames skipped, one visible hand or a low handedness score attributing normally, a far fingertip still named, same-label hands relabelled by keyboard position, and unknown with no capture-timed hand evidence within ±500 ms. Lifecycle tests show the buffer waiting for a nearer in-flight frame, not waiting for a farther one, answering at the deadline from completed evidence, and never revising a settled press.

Browser tests hold synthetic hands for 550 ms either side of a "missing" press so no earlier pose is within the search window. A mixed passage with two no-hands words and one text-error retry completes with the exact unverified count; a delayed frame at the word boundary is answered from the nearest completed frame and the late result cannot revise the accepted word. These are controlled software results, not real-camera accuracy measurements.

## Hardware acceptance — pending

No physical MacBook keyboard attempts were observed during ALO-185 implementation. Al reported frequent “finger hidden” results with the finger plainly in view under the previous gated rule; that motivated the always-answer rule. **Real tracking accuracy, false wrong-finger reports and missed deliberate mistakes remain unmeasured in this verification.** Removing the gates trades unknowns for possible wrong answers; only hardware use shows the balance.

A short hands-on check:

1. Run `pnpm dev`; use Chrome on the external display. Tilt the built-in MacBook webcam toward the keyboard. Map the 30 positions; inspect the dots and hand labels. Go should unlock without checkboxes or a both-hands gate. Try f, j and space in the optional diagnostic; confirm the observed labels match your actual fingers.
2. Complete the 49-word passage using correct fingers at a comfortable, deliberate pace. Record false wrong-finger rejections and unverified press counts; record any unverified presses and whether the camera reports missing capture timing or no hands. If false rejections repeatedly interrupt you, use setup repair, adjust lighting/framing/dots, and repeat the complete passage. Do not count this acceptance as passed merely because the results screen is reachable.
3. On another passage, deliberately use the left index for **a** (first word), **q** (quick), **z** (zipped), and right index for **o** (fox), **l** (sleepy), **.** (village.). Keep the other letters correct. Confidently detected wrong fingers should stay on the word and explain the finger; repeat correctly to advance. Record missed deliberate mistakes as well: every press now receives a finger, so a missed mistake means the nearest-fingertip estimate named a different finger. Also submit a word’s space with a non-thumb. Complete the passage.
4. Reload, check that saved dots load automatically and can be adjusted, then move the lid slightly and **remap**. Check that Reset local data removes calibration/history. Observe whether word boundaries are responsive and whether attempted input during checking is clearly explained.

Record this concise evidence on [ALO-180](https://linear.app/advantagegroup/issue/ALO-180), referencing [ALO-185](https://linear.app/advantagegroup/issue/ALO-185) for the attribution rule:

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

[Initial page](images/introduction.png) · [Mapped setup (synthetic)](images/setup-synthetic.png) · [Practice](images/practice-synthetic.png) · [Wrong-finger feedback](images/wrong-finger-synthetic.png) · [Results](images/results-synthetic.png) · [Unknown words accepted](images/unknown-practice-synthetic.png) · [Unknown passage results](images/unknown-results-synthetic.png)

## Single-page restyle (ALO-222)

The browser regression measures the keyboard and camera rectangles before camera enablement, after every mapped key, during optional finger testing, practice, retry and setup edits; all remain unchanged. The full-passage test also checks the camera rectangle at results. Go is tested with zero hands and is disabled until all 30 positions are valid. Missing capture timestamps produce unknown observations instead of using callback time.

Screenshots generated under `test-results/` are synthetic UI evidence, not real-camera accuracy measurements. The camera stays live at results and restarting practice reuses the map in place.
