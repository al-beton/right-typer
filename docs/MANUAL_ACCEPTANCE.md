# Manual acceptance checklist

Record one run on each target device before claiming camera accuracy.

## Test record

| Field | MacBook Air | MacBook Pro |
| --- | --- | --- |
| Model and year | Not tested | Not tested |
| Chrome version | Not tested | Not tested |
| macOS version | Not tested | Not tested |
| Camera resolution | Not tested | Not tested |
| Date | Not tested | Not tested |

## Setup and calibration

- [ ] A fresh Chrome profile explains the supported hardware and local-processing model.
- [ ] Permission denial gives a recoverable instruction.
- [ ] The built-in camera shows a responsive mirrored preview.
- [ ] The keyboard fits the trapezoid guide with both hands visible.
- [ ] Hand tracking reports exactly two hands before calibration can start.
- [ ] All 31 inputs require a centre and expected-finger motion sample.
- [ ] Hidden-hand, stale, distant, and low-motion samples are rejected.
- [ ] The final overlay visibly aligns with every calibrated key centre.
- [ ] Refreshing can reuse calibration with the same camera.
- [ ] Changing camera invalidates the saved calibration.

## Lesson behaviour

- [ ] Literal errors appear immediately and Backspace repairs the text.
- [ ] Backspace does not erase a previously observed wrong-finger press.
- [ ] Correctly fingered words advance exactly once.
- [ ] A confident wrong finger identifies the character, expected finger, and observed finger, then repeats the word.
- [ ] Tracking uncertainty repeats the word without increasing the failed-attempt total.
- [ ] The final word completes without requiring a trailing space.
- [ ] The camera preview stays responsive and visible beneath the lesson.
- [ ] Completion totals are internally consistent and restart works.

## Accuracy trials

Run ten deliberate wrong-finger presses for each representative key and record rejected trials. Passing is at least 8/10 for every key on each target device.

| Key | Expected finger | Air rejected / 10 | Pro rejected / 10 |
| --- | --- | --- | --- |
| `a` | left little | — | — |
| `f` | left index | — | — |
| `j` | right index | — | — |
| `p` | right little | — | — |
| `c` | left middle | — | — |
| `m` | right index | — | — |

Type ten representative correctly fingered words. Passing is at least 9/10 accepted on each device.

| Device | Correct words accepted / 10 |
| --- | --- |
| MacBook Air | — |
| MacBook Pro | — |

Measure word-boundary feedback with Chrome Performance recordings. Passing is p95 under 150 ms.

| Device | p95 boundary latency |
| --- | --- |
| MacBook Air | — |
| MacBook Pro | — |

## Privacy and packaging

- [ ] Build with `BASE_PATH=/right-typer/ npm run build` and serve `dist/` over HTTPS or localhost.
- [ ] Clear the Network panel, complete setup and several words, and confirm every request is same-origin.
- [ ] Confirm no request payload contains camera frames, video, landmarks, calibration data, or typed content.
- [ ] Confirm the Content Security Policy reports or blocks any attempted off-origin dependency telemetry.
- [ ] Confirm the output is static and works without an application server.

## Sign-off

- Overall result: **Not tested on target hardware**
- Tested by:
- Notes and threshold changes:
