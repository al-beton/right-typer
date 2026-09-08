# Setup and practice flow (ALO-251)

The start/resume action lives beside the target word. Before readiness, one inline message explains the blocker and links to mapping/camera settings. Mapping opens automatically for a new camera. Completing the map focuses Start practice but does not start or require detected fingers. During practice, mapping controls are hidden; Pause offers Resume directly and Edit setup opens adjustments. Results offer direct Practise again and Edit setup.

Start/resume commits the map and saved automatic-start preference. Explicit Pause, Edit setup, remap and disconnect clear that preference. Refresh with an enabled compatible map starts a fresh passage; an explicitly paused/disconnected user stays paused. Resuming preserves completed words and discards the incomplete attempt. Camera lifecycle and capture-time attribution remain unchanged.

Keyboard activation belongs to the focused control. Mapping hands focus to Start; start/resume hands it to word input; pause hands it to Resume; edit hands it to the camera. Delayed grading preserves focused controls. Optional diagnostics exclude controls, editable content and keyboard-editor ancestors, and stale requests cannot update the next state.

## Keyboard profiles integration contract

This PR targets main independently of user-owned #23 and #15. #23's owner confirmed:

- Replace fixed readiness with ready camera, no `coverage(profile)` gaps and `validCalibration(makeCalibration())`. Use `calibrationCodes(profile)` and physical labels for mapping/counts. Navigation must not bypass this predicate.
- Calibration snapshots include profile, points, camera ID/dimensions and hand swap. Reuse requires `geometrySignature` compatibility and matching actual camera/dimensions, not profile ID alone.
- Profile changes disable auto-start, pause/discard the active attempt, invalidate diagnostics, clear boundary input/evidence and retain completed words. Use a compatible saved map or require mapping, then explicit start/resume.
- Diagnostic presses use `resolveEvent(profile,event)` and snapshot physical code, allowed fingers and the full calibration. Custom capture/editor input owns its events.

Profile switch/custom-profile coverage is verified in #23's integration suite, not claimed by this independent main change. All local browser evidence uses fake video/synthetic landmarks; it does not measure physical-camera accuracy.
