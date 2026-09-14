# Safari direct Desk View experiment

Experimental ALO-180 research; not production browser support or finger-training acceptance.

Run `pnpm install --frozen-lockfile` then `pnpm dev --port 5182 --strictPort`.
Open <http://127.0.0.1:5182/?safariDeskView=1> in Safari when the shared camera slot is available. This development server serves static browser code and bundled assets; it does not bridge or receive camera data.

The experiment adds explicit device enumeration, permission probing, exact camera selection, resolution requests and local metadata diagnostics to the existing Right Typer calibration/practice loop. No capture starts at page load. All inference remains in the bundled MediaPipe classic worker. No native helper, extension, upload, cloud inference, or recording is involved.

## Current evidence

- Build, TypeScript, lint and 328 unit tests pass.
- Chromium fake camera: real bundled model loads and infers with same-origin requests only. Synthetic tests exercise exact selection, stop, permission-probe cleanup, absent VideoFrame, unavailable timing and calibration/text practice. These are software checks, not Safari/hardware evidence.
- Original capture prototype: eight focused Chromium cases passed across a combined run and one corrected assertion rerun. Latest staged-trial addition: all three experiment browser cases pass, including estimated match/mismatch, unchanged unavailable source clocks, no normal word-buffer entry and pending-result cleanup. Full real-camera behavior remains untested by this task.
- Camera-free isolated Chromium UI inspection passes; screenshot below contains no camera image.

![Experiment before camera permission](safari-desk-view.png)

- **User-reported Safari success:** Al reported, “I tested the safari one and it worked great”. Al subsequently clarified that everything worked great on Safari while Chrome never detected fingers pressing the buttons. This is user-reported end-to-end success; the exact URL/query/build and independently confirmed stages remain unspecified. Do not infer a controlled deliberate wrong-finger result from that wording. It supersedes the earlier assumption that Safari remained untested.
- **Follow-up inspection:** after the manager granted the Safari slot, native Safari accessibility inspection showed only Start Page; its Window menu listed no prototype window, and the connected browser-tab inventory contained no prototype URL. The existing tested session was not accessible. No page was navigated/reloaded, permission changed, capture started or camera screenshot/recording taken. Actual selected track label/settings, browser API/worker state, hand count, runtime errors and timing values remain unavailable to this task. Recover the existing page or its metadata-only diagnostic text through the coordinator before drawing stronger conclusions.
- An older cached Playwright WebKit runtime did not initialize with the current automation protocol and was stopped. This supplies no evidence about the installed Safari.

## Timing limitation

[WebKit camera discovery](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/mediastream/cocoa/AVVideoCaptureSource.mm#L918-L944) includes Desk View cameras. This is source evidence, not proof of installed Safari enumeration or successful capture.

The same file's [AVFoundation sample-delivery callback](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/mediastream/cocoa/AVVideoCaptureSource.mm#L1427-L1437) sets `metadata.captureTime` using `MonotonicTime::now()` after creating the video frame from the delivered sample. That callback does not read sensor exposure time. The [rVFC specification](https://wicg.github.io/video-rvfc/) describes local captureTime as camera capture time; field presence alone cannot settle this provenance question. Current upstream source is not a verified mapping to the installed Safari binary.

The explicit experiment therefore sets `captureClockTrusted = false`; every inference result carries `clock: unavailable`. Raw browser timestamps remain visible for investigation. Callback time supplies monotonic inference ordering only. No callback, presentation, media, VideoFrame-constructor or inference completion timestamp is promoted to exposure evidence. Correct text can advance with unknown observations, as existing product rules allow. The new staged timing trial reports separate estimated finger candidates without changing those source clocks or contributing to practice grades/metrics. Ordinary non-experiment capture and classifier rules are unchanged. The ordinary route retains its existing capture-time eligibility; because Al's tested URL/query/build could not be recovered, it is not established whether he used the unknown-only experiment route or another route.

This does **not** show that Safari can never grade fingers. A measured timing relationship with stable offset and bounded uncertainty may be viable. Ordinary practice applies no experimental offset and no production classifier changes. The optional trial below explores explicitly labeled assumed delays.

## Live test, after slot grant

1. Open the URL in Safari. Select **Refresh devices** before requesting capture and inspect the list. Hidden labels or IDs before permission are not proof that a camera is unavailable.
2. If needed, select **Allow camera briefly** and allow Camera for this localhost page. The resulting stream is immediately stopped. A denial is reported once; allow Camera in Safari's website settings before retrying. Do not change global privacy settings or interrupt another app's camera session.
3. Refresh and select the exact **Studio Display Desk View Camera**, then **Start selected camera**. Selection uses `deviceId: { exact: ... }`; it cannot silently fall back to a different camera. If absent after permission, have Al start Apple's existing Desk View setup, complete framing, then refresh and compare. Do not install a helper.
4. Open diagnostics. Record only non-sensitive text: browser version, selected/actual label, track dimensions/rate, worker ready/error, latest inferred hand count, raw captureTime availability and callback rate. Test 960×720 and 1920×1440 requests separately; actual track settings are the result, requested sizes are not guarantees.
5. If preview/model work, use **Settings & progress → Camera & keyboard** to mark key centres, then **Start practice**. Use real correct typing and deliberate wrong fingers to assess visible tracking/focus/recovery; all finger observations must remain unknown in this experiment. Do not interpret word advancement as finger compliance.
6. Stop with **Stop camera**. Verify preview/track release. Refresh devices after any hardware/setup change. Changes in crop/zoom/framing can invalidate alignment even when ID and dimensions remain the same; recheck the map manually.

A selectable camera or moving preview alone is partial success. A model error, missing API, inaccessible device or timing limitation must be reported at its actual stage. No raw camera screenshots/video should be saved or published for this test.

## Runnable staged attribution test

Use the existing or next user-chosen session; do not reopen or restart a successful camera session just to run this test. Confirm the full URL contains `?safariDeskView=1` and note the build in diagnostics. Preserve selected source/framing/calibration.

1. Complete or reuse mapping and select Start practice once to accept it. The main word loop retains unknown finger observations.
2. Expand **Staged finger timing trial**. Select the finger you will actually use before each tap. Focus the test pad, tap a mapped key, then wait about 1.6 seconds for the row. These staged presses do not enter the normal word buffer.
3. In **Explore offset**, start with 0 ms assumed delay and ±30 ms sensitivity. Repeat an intended finger and a deliberately different finger on the same key. The result compares observed nearest-fingertip geometry with your declaration and separately with the profile's intended fingers; it never substitutes the intended finger for the observed candidate.
4. Inspect source frame ID, unchanged source clock, callback/inference-arrival times, estimated frame time and residual. Exploration lists matching offsets from 0–600 ms in 25 ms steps. Sensitivity checks the chosen delay's nonnegative ±range in 10 ms steps plus the endpoints. Different candidates or missing data across samples are marked offset-sensitive; no nearby hands remains inconclusive.
5. Choose a plausible delay for **Held-out check**, keep it fixed, and repeat both intended and deliberately different fingers. Report mismatches and ambiguity as well as agreement. A finger held still may fit every delay; that does not measure latency or jitter. The trial tests one separated press at a time, not full-speed typing accuracy.
6. Results retain at most 60 staged rows in memory; Clear discards them and any pending trial. Camera/mapping changes discard a pending press. No raw pixels, video, landmark archive, upload or progress write is added.

This is an explicit estimated-attribution diagnostic, not production grading or a claim of true exposure time. The existing synthetic checks demonstrate both match and mismatch paths and unchanged `clock: unavailable`; physical performance remains for Al to test.

## Next timing measurement if direct capture works

Use at least 30 separated visible key contacts with one finger, then a faster sequence, repeating at each resolution and after restart. In memory, associate keydown's normalized time with rVFC metadata and visible fingertip motion before inference transfer; preserve the result's source-frame identity. Report median/tails of event-to-motion offset, variation across runs, metadata regressions, duplicate media timestamps, skipped presented frames, inference skips and contact ambiguity. Stationary hands do not establish duplicate images; presentation counters alone do not establish unique camera exposures.

Initial feasibility can be assessed with repeated user-confirmed staged presses, offset/jitter estimates and held-out correct/wrong-finger observations, with the evidence and its limits explicitly labeled. That comparison includes switch scan delay, contact mechanics and tracking error. A separately bounded optical timing reference in the camera field is an optional way to strengthen timestamp provenance; account for its own display/update delay if used. It is not an agreed product requirement or a prerequisite for this initial feasibility test. No raw footage recording is authorized; any such recording needs explicit user permission. Do not subtract a fitted mean and call it sensor exposure. Define a conservative uncertainty interval and verify held-out presses and dropped/delayed cases before proposing grading changes to the liaison. Ordinary practice continues to report finger observations as unknown; the separate trial labels its results experimental estimates.

## Recovery

Owner: Safari research spike task `01a09f2e-1296-76c1-8026-c9d2e0e1afe0`; coordinator `01a09f24-9e2b-7a02-8f22-24b4e3804c1d` (local). Branch `codex/safari-desk-view-spike`, independent from main `8b7f601377700e6dfc472996baaddfe799766950`; no stack parent or production deployment. Manager granted the inspection slot; the tested Safari page was not accessible. Next owner is the coordinator to clarify the user-confirmed stages and locate the existing session/diagnostic text. Preserve its source, framing and calibration. Work paused at Al’s request for consolidation into one research issue. The owned port 5182 server is stopped; the draft PR, branch and worktree are preserved. Resume only through that research handoff. Exact current head and latest acceptance evidence belong in the draft PR.
