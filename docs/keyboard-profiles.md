# Keyboard profiles

Choose Keyboard in the green settings below the diagram. New devices start with US ANSI (PC). MacBook US and British presets use the [documented C–M spacebar geometry](keyboard-geometry.md). Existing profile-less `right-typer.v1` storage migrates to the original British geometry as a saved custom setup; its original calibration is retained as `legacyCalibration`, while compatible points are translated to physical codes. Camera, rotation, disconnected state and prior start preferences survive. Switching profiles abandons only the active attempt and requires Start/Resume practice again. Saved calibration is reused only for equal physical geometry/target sets and the same camera identity and dimensions. Moving the actual keyboard/camera still requires remapping.

The diagram shows letters, comma, full stop and space at their physical positions, including dedicated regional letter keys: German ä/ö/ü/ß and French é/è/ç/à/ù. Labels show letters and practice punctuation (French Shift+Comma is labelled full stop); the typing hint supplies required modifiers. Presets retain other positions for custom mapping. The unchanged English passage exercises lowercase letters, comma, full stop and space. Numbers and modifier fingers are not graded. ANSI/ISO is independent geometry metadata; non-letter positions without practice punctuation, including the extra ISO key, are hidden. Regional letters are display-only for the current English passage; they do not add calibration steps. Calibration reuse compares the geometry of calibrated keys, so adding these display positions preserves existing maps. Custom JSON can replace all geometry (including split arrangements).

## Verified preset variants

| Preset                          | Reference and exercised differences                                                                                                                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US QWERTY / ANSI                | [Microsoft US, KLID 00000409](https://learn.microsoft.com/en-us/globalization/keyboards/kbdus_7), [Apple ANSI identification](https://support.apple.com/en-ca/102743).                                                                                                |
| British QWERTY / ISO (PC)       | [Microsoft United Kingdom, KLID 00000809](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/windows-language-pack-default-values). Same exercised mappings as US; ISO geometry. Not UK Extended.                                                 |
| Apple British QWERTY / ISO      | [Apple British/Irish identification and ISO geometry](https://support.apple.com/en-ca/102743). Same exercised characters as PC British; differences outside the practice cluster are not used to infer a hardware model.                                              |
| German QWERTZ / ISO (PC)        | [Microsoft German, KLID 00000407](https://learn.microsoft.com/en-us/globalization/keyboards/kbdgr.html). Physical KeyY produces z; KeyZ produces y.                                                                                                                   |
| French Legacy AZERTY / ISO (PC) | [Microsoft French Legacy, KLID 0000040C](https://learn.microsoft.com/en-us/globalization/keyboards/kbdfr.html). KeyQ→a, KeyW→z, KeyA→q, KeyZ→w, Semicolon→m, KeyM→comma; **Shift+Comma→full stop**. This is not French Standard NF Z71-300, Belgian, or Apple French. |

[`KeyboardEvent.code`](https://www.w3.org/TR/uievents-code/) identifies the position; `key` supplies text. A direct Shift/AltGr mapping is accepted only when code, key and modifiers match the selected profile. Dead/composition events show recovery guidance and create no press. Each press stores `code` and its resolved `allowedFingers`, so text can never be reinterpreted as QWERTY grading. Missing camera evidence retains the existing unknown semantics.

Detect layout is optional and suggestion-only. It compares exposed unshifted mappings; PC US/PC British/MacBook British/MacBook US are deliberately ambiguous. API absence, denial, incomplete maps or no match leave selection untouched. Browser language is never consulted. Hardware geometry cannot be identified by this API.

## Custom format (version 1)

Use Custom to duplicate a preset, name it, choose a physical position and press its actual key (with Shift/AltGr if needed). Edit both finger policies explicitly. Save & select validates passage coverage. Export produces editable JSON; Import assigns a new custom identity, preserving the existing profile on any error. Up to 20 custom profiles can be created locally; migration reserves one additional slot to preserve an existing MacBook setup. Delete removes the selected custom profile; its previously saved calibration remains in local storage until Reset.

A profile has `version: 1`, unique `id`, `name`, `geometry` and `keys`. Every physical key includes:

```json
{
  "code": "Comma",
  "label": "; / .",
  "x": 7.75,
  "y": 2,
  "width": 1,
  "height": 1,
  "outputs": [
    { "text": ";", "shift": false, "altGr": false },
    { "text": ".", "shift": true, "altGr": false }
  ],
  "standard": ["right-middle"],
  "alternate": ["right-ring"]
}
```

Coordinates are arbitrary keyboard units; preserve actual relative key positions and dimensions. Calibration uses the physical geometry to derive local axes from the clicked camera points. Split layouts must explicitly supply fingers; missing neighbors never trigger letter-based guesses. `Space` uses two calibration endpoints and both thumbs in both policies. Either is the union of Standard and Alternate. Labels render as text. Profiles are bounded to 100 KB, 3–100 unique keys, 80-character name/id, bounded finite geometry and valid finger/modifier values. Missing passage characters block saving/import/practice with guidance.

To add a preset, add its data to `PRESETS` in `src/core/profile.ts`, cite its exact source/variant here and add code/key/modifier cases to the profile tests. Exercise and observation logic do not require layout-specific changes. Do not infer Shift outputs by uppercasing characters.

## Recorder integration (open PR #15 / ALO-223)

This feature starts from main and does not include the open recorder branch. When combining them, record the full `Calibration.profile` snapshot (version/id/geometry/keys), and preserve `Press.code` and `Press.allowedFingers` in event JSON and cached replay. Resolved policies must be indexed by code. Stop the recording before any profile edit/switch, just as for other setup changes. Reject profile-aware samples missing their snapshot/allowlist rather than silently falling back to QWERTY. Existing profile-less v1 samples retain their original British/QWERTY interpretation. The recorder owner was notified before implementation. No recordings were captured or uploaded for this change.

Automated camera tests use synthetic landmarks/fake video; physical keyboard/camera accuracy remains unmeasured.

## Setup and calibration integration

The document-level prepractice diagnostic from PR #21 uses `resolveEvent(profile, event)`, snapshots `Press.code` and `profileFingers(profile, code, mode)`, and retains the full `Calibration.profile`. Calibration targets and labels remain profile-specific. The composed-path/control guards exclude Custom key capture and other editable controls. Browser regressions exercise German/French physical-code diagnostics and confirm Custom key capture does not trigger a competing diagnostic.

PR #20's shared color/dot helpers receive resolved profile fingers for physical codes, normalizing the two space endpoints to `Space`. Diagram and camera dots share the same policy colors; automated checks cover policy changes, dot sizes and rotations.

PR #19's concise setup/practice feedback and removal of the diagram heading are retained. Physical labels, the selected profile footer and calibration target counts remain dynamic.
