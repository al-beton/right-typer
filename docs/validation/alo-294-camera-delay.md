# Camera delay adjustment

[ALO-294](https://linear.app/advantagegroup/issue/ALO-294) follows the accepted [ALO-293 timing recommendation](https://linear.app/advantagegroup/issue/ALO-293#comment-09c8ac7a-d6ff-42e3-a30c-7b71da4fffc9).

## Try it in Safari

1. Select Desk View, retain/check your key mapping, then open Camera settings.
2. Find **Camera delay adjustment**. Start at zero; if fast transitions show earlier finger positions, try **50 ms** and **Apply & save delay**. Fifty is a starting hypothesis, not a measurement.
3. Expand **Check the delay before practice**. Run quick F→R and E→R, then the slow controls. Compare the displayed observation with the finger you actually used.
4. Run the deliberate middle-finger R control. It should report middle, despite the usual intended index finger. Unknown does not establish success.
5. Adjust and repeat, or **Reset to 0 ms**. **Close & resume** returns to practice. These checks never enter practice statistics, heatmaps or daily goals.

## Timing and ownership

- Ordinary-camera capture/unavailable behavior is preserved. Manual compensation applies only to estimated Desk View/window sources.
- Effective frame time is validated capture time (otherwise sampled callback time) **minus** the explicitly configured residual D. Raw timestamp values and basis remain available in the decision inspector. `FrameTiming.offsetMs` is the signed additive shift −D; `residualDelayMs` is positive D. `Observation.offsetMs` is separately the effective frame-to-press difference. Uncertainty remains unmeasured.
- D is 0–500 ms, with numeric input and 5 ms spinner steps. Zero adds no compensation. No callback/inference/presentation duration is automatically treated as optical delay.
- In-flight registration, frame ordering and completed watermark use effective time. Each request fixes its deadline to press+D+1000 ms; the ±500 ms candidate search remains unchanged. Late results cannot regrade settled attempts. The model receives a separate monotonic timestamp so adjustment cannot make its video clock go backwards.
- Apply/reset/source/basis changes invalidate pending and queued evidence. Source geometry and progress survive timing changes. Camera delay saves locally by source, device, video dimensions and timestamp basis. Runtime basis changes start at zero with a recheck notice. Unidentified new window shares start at zero; prior window delay requires explicit reuse.
- Setup checks retain only the current bounded check in memory and clear on repeat, timing changes or leaving settings. No new footage, upload or retained typing history is introduced. Existing metadata replay preserves each request's fixed delay budget.

## Evidence limits

Controlled tests can prove timing arithmetic, ownership, persistence and UI behavior. They cannot establish the actual Safari exposure delay or resolve Al's physical F→R/E→R or A report. Physical verification remains separate on the delivered build. Existing user previews/native capture must remain untouched during review.
