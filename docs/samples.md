# Record a sample

Open **Debugging** below the camera, then choose **Start sample (fresh passage)**
when your setup is ready. Debugging is collapsed by default; opening it does not
start recording. The optional `?record=1` URL shortcut opens the same controls.
Normal practice does not record anything.

1. Choose your keyboard layout, map the keys, and choose **Standard**, **Alternate diagonal** or **Either**.
2. Enter anonymous person/setup IDs and a brief description of the keyboard,
   framing, lighting or problem. Keep the keyboard and camera still.
3. Click **Start sample (fresh passage)**. This starts a fresh passage and explicitly
   records camera video and keys typed into the practice box. It does not record
   audio, other applications or unrelated input fields; nothing uploads.
4. For the first pilot, type for **15–30 seconds**, including an example of the
   problem. Keep mistakes and retries. Click **Stop sample**, then **Download sample**.
5. Keep the `.tar` download privately and send it manually to Al if agreed.
   Discard clears the browser copy and enables the next sample.

Recording stops automatically on pause, camera/setup/fingering changes, keyboard
profile edits or switches, five
minutes or 256 MiB. Exact frame PNGs can fill that limit much sooner than five
minutes, depending on frame rate and image detail. The stop reason appears beside
Download. Do a pilot before scheduling longer sessions. Downloads are not saved
across reloads; the page warns before leaving while a sample is retained.

Once the pilot replays correctly, collect roughly 5–6 sessions across people and
setups: deliberate slow coverage, comfortable passage typing, and a few confirmed
wrong-finger examples across both hands/rows. Use a new setup ID and calibration
when geometry changes. Record separate samples for each fingering policy. A prompt
to use a finger is not proof that it was used; confirm it during review.

## Validate, replay and import

From the repository (Node and pnpm as in README):

```sh
pnpm sample -- /private/path/right-typer-sample.tar
pnpm sample -- /private/path/right-typer-sample.tar --import /private/path/right-typer-data
```

The first command checks archive paths, file hashes, geometry, references and the
schema, then runs the **production EvidenceBuffer and grade** against saved input,
result-arrival and deadline events. It reports changed observations/verdicts and
exits nonzero for differences. It does not infer new ground truth from agreement.
The second additionally imports files; existing sessions are never overwritten.

```text
right-typer-data/
  catalog.json
  samples/p01/s01/<session-id>/
    manifest.json           # schema, mode/allowlists, app/model/worker hashes, setup
    calibration.json        # native key positions, hand swap; no browser device ID
    camera.webm             # watchable video, no overlays/audio
    inputs/<frame-id>.png   # exact sampled ImageBitmap copied into canvas PNG
    frames.jsonl            # IDs, capture/dispatch times, source media times, copy cost
    events.jsonl            # practice keys, evidence scheduling, observations, verdicts
    landmarks.jsonl         # original tracking results, indexed by frame ID
    labels.jsonl            # initially unreviewed; never generated from predictions
    review.html             # generated local label-review page
  splits/regression.json
  splits/holdout.json
  reports/<session-id>-<run-time>.json
```

Keep this root **outside the public checkout**. The importer initializes empty
splits; assign whole participant/setup sessions to regression or holdout manually.
Do not tune on holdout sessions. No real recordings belong in Git or Linear.

## Label a sample

Open the imported `review.html` locally. For each press, inspect the nearest and
adjacent PNGs (and full video if helpful), select the actual finger and record an
independent source, such as participant confirmation or a human frame review.
Choose **Unlabelable** when unclear. Predictions are omitted from the review UI.
Download a label revision; preserve the original bundle. Then:

```sh
pnpm sample -- /private/path/sample.tar --labels /private/path/label-revision.jsonl
```

The report counts confirmed correct-finger presses that were rejected and known
wrong-finger presses missed, with denominators. Unreviewed presses do not become
accuracy evidence. Full dataset aggregation, held-out comparison gates, per-word
human-labelled metrics and model reruns on recorded pixels belong to **ALO-182**;
this capture PR supplies the input files and deterministic cached replay.

## Timing and limitations

All `at`, `receivedAt`, `dispatchedAt`, `eventAt` and `encodedAt` values are
milliseconds relative to sample start. `mediaTime` retains rVFC's source-media
**seconds**; `presentedFrames` retains its source counter. Negative capture times
can represent frames captured just before recording began. Capture-clock
unavailability remains explicitly marked; it is never replaced by video playback
position for attribution.

MediaRecorder's movie is for watching, not exact alignment. The PNGs snapshot the
same native, unrotated ImageBitmap sent to the tracking worker and are the
frame-addressable replay input. Canvas PNG preserves canvas pixels, not original
sensor bytes. View rotation is metadata; key positions and tracking stay in native
normalized coordinates. No constant-FPS or movie-start synchronization assumption
is made. A result already in flight when recording starts may contain landmarks
without a PNG; it is retained for faithful cached replay and reported separately.

Observed callback skips are recorded, while unobserved camera drops remain unknown.
Encoding adds overhead: each frame reports synchronous copy time and PNG completion,
and landmarks preserve actual inference arrival. Slow PNG export stops the sample
instead of silently omitting inputs. Final in-flight frames/presses may be unfinished
when Stop is clicked; cached replay does not invent later evidence. Browser tests
use fake video and synthetic landmarks; only the upcoming physical-camera pilot
can establish real collection overhead and finger accuracy.

## Layout-aware samples

New recordings use schema v2. `calibration.json` contains the full versioned
keyboard profile (physical codes, geometry, outputs/modifiers and both finger
policies). The manifest's finger map is indexed by physical code. Each recorded
press retains its `code` and resolved `allowedFingers`; raw key events also retain
Shift and AltGr. Replay and labelled metrics use these snapshots, not whichever
keyboard is currently selected. Incomplete or inconsistent v2 snapshots are rejected.

Original profile-less schema v1 bundles still replay with their British QWERTY
interpretation. They are not migrated to the new default layout. Keep the original
bundle and download independent label revisions alongside it.
