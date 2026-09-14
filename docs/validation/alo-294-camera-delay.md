# Camera delay: local clip calibration

[ALO-294](https://linear.app/advantagegroup/issue/ALO-294) follows the accepted [ALO-293 timing contract](https://linear.app/advantagegroup/issue/ALO-293#comment-09c8ac7a-d6ff-42e3-a30c-7b71da4fffc9). The previous label-only setup check was rejected and is replaced by actual recorded pixels.

## Try it in Safari

1. Select Desk View and check your crop/key mapping. Open Camera settings → **Camera delay adjustment**.
2. Choose **Record a short clip**. Tap F→R, E→R and slow controls in the focused recording box. Stop early or let the five-second limit finish.
3. Choose a keypress marker. Inspect the large replay, previous/next captured frames, scrubber and slow playback to see the physical key contact.
4. Change the proposed delay from 0 to 50 ms, or another value. The **same clip** seeks the nearest frame using the proposed compensation. Read the current-frame/key difference and examine nearby frames. Fifty is a hypothesis, not a measurement.
5. **Apply & save delay** changes live timing and retains the clip for review. **Reset to 0 ms**, **Cancel adjustment**, **Retake** and **Discard clip** are explicit. Closing settings discards the clip and returns to practice.

## Pixels, clocks and privacy

- Each frame is frozen synchronously from the selected video in its rVFC callback. Its raw native/callback timing and selected source-basis time travel with those exact pixels through asynchronous JPEG encoding. The clip is a timestamped frame sequence; no recorder-start/blob-arrival/playback-currentTime estimate is used.
- Capture includes the current crop and rotation, at up to960px on its longest source dimension. Limits are5 seconds,180 frames,24MiB retained encoded data,100 keys and two outstanding frame encodes. Gaps/skips remain visible as actual source-time gaps; playback never interpolates a missing image. Independent JPEG frames avoid video-container encoding-boundary ambiguity.
- Actual keydown events are normalized into the same page clock. Only the dedicated recording input captures events; typing in numeric controls is excluded. No exercise/progress, heatmap or daily-goal path receives setup events.
- Pixels and events remain in memory only. No microphone, automatic download, upload or persisted footage. Retake/discard/close/reload/source/basis/crop/rotation/mapping invalidation disposes retained data and rejects late encode/decode work. Applying a delay retains a valid clip because its raw pixels and source times remain unchanged.

## Live timing contract

- Ordinary-camera behavior is preserved. Manual D applies only to estimated Desk View/window sources: `effectiveFrameAt = selected basis − D` once. Raw metadata remains; `FrameTiming.offsetMs = −D`, positive `residualDelayMs = D`, and `Observation.offsetMs = effectiveFrameAt−keypressAt` are distinct. Uncertainty remains unmeasured.
- D is0–500ms, with numeric input and5ms spinner steps; zero adds no compensation. No callback/inference/presentation duration is automatically treated as exposure delay.
- Registration, ordering and watermark use effective time. Each request fixes deadline press+D+1000ms; the±500ms search remains. Incompatible pending/queued evidence is invalidated on timing changes; the tracking model's monotonic clock remains separate.
- Save per browser-local source/device/video size/timing basis. Runtime basis changes start at zero with a recheck notice. New unidentified window shares start at zero and require explicit reuse. Timing changes retain calibration and progress.

## Evidence limits

Synthetic visual tests prove different recorded pixels are selected at0/50ms with production-consistent sign, alongside timing, lifecycle, persistence and browser checks. They do not establish Al's physical Safari exposure delay or resolve the F→R/E→R/A report. Physical acceptance remains separate on the delivered build.
