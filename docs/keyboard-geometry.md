# MacBook spacebar geometry

ALO-264 changes only the MacBook presets. MacBook British ISO and the explicit MacBook US ANSI preset span physical KeyC's left edge through KeyM's right edge. Coordinates are x=2.75, width=5 key pitches. A cell includes its gutters: equal padding on the Space, C and M cells makes the **visible** outer edges match, including at the mobile padding breakpoint.

Evidence checked 2026-09-09:

- British: Al's direct hardware observation in [ALO-264](https://linear.app/advantagegroup/issue/ALO-264) explicitly requires C–M alignment.
- US: Apple's [MacBook Air Magic Keyboard guide](https://support.apple.com/guide/macbook-air/magic-keyboard-apdab672d5e9/mac) links this [US keyboard illustration](https://help.apple.com/assets/68E55784E266DE1F4A0ACA56/69726E59320F229D6106C907/en_US/a285052250496e01516c2dc53c15513e.png). Its horizontal Return and long left Shift identify the ANSI arrangement; Space visibly shares the C left edge and M right edge. The five-pitch model is a visual inference, not an Apple engineering measurement or a claim about every historical MacBook.

ANSI/ISO and language do not determine bottom-row dimensions. The existing US preset is explicitly labelled PC; all PC coordinates remain unchanged (including their existing approximate x=2, width=6 Space). This issue does not claim to correct PC hardware. Layout detection reports the ambiguous QWERTY matches and still cannot detect physical hardware. No extra keys or typing targets are added.

Saved setups keep their geometry and camera points. An old calibrated Apple British snapshot is retained verbatim and made selectable through a custom profile named “MacBook British — saved geometry”. It stays selected for existing users. Selecting the corrected built-in requires a new map because the geometry signature differs; the old map remains available by switching back. Profile-less calibrations first receive the original British geometry, never the new dimensions. Existing custom geometry is unchanged. New or uncalibrated selections use the corrected built-in.

Profile version 1 and Calibration.profile remain full snapshots. Recorder consumers must continue using each recorded snapshot rather than substituting a current preset by ID. This change does not touch the separate recording PR, event allowlists, grading or camera attribution. Browser checks use synthetic video and do not establish physical-camera accuracy.
