# Local progress accounting

[ALO-280](https://linear.app/advantagegroup/issue/ALO-280) defines the product contract. This is an implementation guide; camera attribution and word grading are unchanged.

| Measure                  | Numerator / denominator or interval                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Text accuracy            | Correct / accepted character presses, including submitting Space                                                  |
| Expected target accuracy | Correct / prompted presses for the expected character and mapped physical key                                     |
| Finger compliance        | Allowed observed finger / observed presses on the actual physical key                                             |
| Hand compliance          | Allowed observed hand / observed presses on the actual physical key                                               |
| Coverage / unknown       | Observed / all, and unknown / all; pending is separate                                                            |
| Space thumb split        | Recorded left or right thumb / recorded thumbs; other, unknown and older unclassified observations remain visible |
| Response                 | Median of the latest 32 valid correct-prefix transitions, with sample and exclusion counts                        |
| Active practice          | Positive focused inter-action intervals up to 5 seconds, including meaningful Backspace                           |

Wrong or erased presses retain evidence. Wrong X while N is expected affects expected N and actual X. Unknown fingers never become compliant evidence. Setup, shortcuts, repeats, paste/IME, rejected mappings, checking input and retry-control Space do not count. First presses and boundaries add no response interval or leading/trailing active time. Result WPM keeps its existing wall-clock meaning.

Active durations use the monotonic event clock. Wall time allocates them to local dates, splitting at midnight. Clock discontinuities never inflate duration; invalid dates are reported as undated activity. The date ledger combines all histories; each selected cohort also shows its own cumulative active time.

The inspector lives in **Settings & progress → Practice & history**. Lifetime totals and recent windows are labelled separately. No denominator displays “No data”; fewer than 20 samples displays “Limited evidence.” Tables scroll within the drawer.

The existing `right-typer.progress.v1` storage key now contains schema **version 2**. Version 1 upgrades in place after exclusive writer ownership is acquired. It retains curriculum, counters and recent evidence, starts active time at zero, and labels older observed Space as having no recorded thumb side. It does not infer history from result WPM. Metric semantics and cohort signatures remain compatible.

One tab holds the progress Web Lock; other tabs practise in memory and explain how to resume saving. Persistence allows 16 cohorts, 90 local dates and 1 MiB; reaching a cap preserves the previous saved data and enables in-memory inspection/export/reset. Numeric and collection bounds are checked before replacing saved data. Settled/abandoned words and page hide flush progress; accepted inputs debounce at 500 ms. No frame-driven writes occur.

Exports contain progress and semantic mapping identities, without calibration, camera identifiers, frames, landmarks, precise event timestamps or a typed transcript. Progress-only reset clears all curriculum/metric histories and stops an active debugging sample before replacing the exercise; it retains that sample for download. Calibration, profiles, preferences and completed results remain. Full local-data reset is separate; progress import is not supported.

`tests/progress-metrics.test.ts` covers exact denominators, ownership, timing/date anomalies and migration. `e2e/progress-metrics.spec.ts` exercises the real input boundary, inspection, export, reload, capacity and reset. All such evidence uses synthetic camera inputs and is not a physical-camera accuracy claim.
