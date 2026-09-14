# Desk View framing investigation and preserved crop candidate

[ALO-289](https://linear.app/advantagegroup/issue/ALO-289) asks whether Safari can use Apple's native Desk View viewing-area control. The ordinary pixel crop below was a misunderstanding of that request and is preserved for diagnosis; PR #52 review/rollout is paused. It does not answer the native-control question.

Apple describes Desk View as cropping the ultra-wide feed, applying perspective correction and rotating it into an overhead view ([WWDC22](https://developer.apple.com/videos/play/wwdc2022/10018/)). Its native app has a viewing-area slider; Apple recommends sharing that app's window with third-party apps ([support](https://support.apple.com/en-us/121541)). Current [WebKit capture source](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/mediastream/cocoa/AVVideoCaptureSource.mm) discovers Desk View cameras but provides no zoom range on macOS in `computeMinZoom`/`computeMaxZoom`. This is source evidence, not a measurement of Al's installed Safari capabilities. Whether changing Desk View's native slider propagates into Safari's direct camera stream remains unverified.

## Preserved full-app pixel crop

The candidate extends the complete Desk View app from [PR #51](https://github.com/al-beton/right-typer/pull/51). The earlier standalone comparison lab has been removed.

Run `pnpm dev --port 5192` and open <http://127.0.0.1:5192/> in Safari. Select your Desk View camera in **Camera settings**. Choose **Crop view**, drag around the keyboard and both hands (or use the four sliders), then map/check your key positions and **Close & resume**. The ordinary typing loop, observed-finger feedback, progress and heatmaps use the cropped input. **Use full frame** resets it.

Cropping affects actual model pixels and both the setup/practice preview. Key coordinates remain relative to the original source. Returned landmarks are transformed back into that coordinate system, preserving saved maps and view rotation. Changing a crop clears pending observations and pauses practice; hiding mapped keys prevents resume until the crop includes them again. Crops persist separately per camera identity and delivered resolution. Window shares remain transient. A changed source/resolution restores only its matching crop.

This is a child of the full Desk View implementation, not a second model/grading policy. Cropping does not establish improved real-camera accuracy or change the parent's timing assumptions. No physical camera was accessed during automated verification. The browser-only privacy boundary remains: no uploads or recordings by default. Debug sample recording requires full frame because its existing bundle format assumes source-sized model inputs.

Al reported stationary hand outlines offset from the video in Safari on the candidate. A synthetic pixel regression reproduced a WebKit defect: `createImageBitmap(VideoFrame, x, y, width, height)` returns the requested dimensions but scales the full image instead of cropping it. The workaround materializes a full ImageBitmap first, then crops it through a canvas. The frozen frame and its timestamps remain paired. The regression checks all four corners of the actual worker input against a known colored source region; dimensions alone missed this failure.

Verification: `pnpm check`, `pnpm lint`, `pnpm build`, and `pnpm exec playwright test --config playwright.crop.config.ts`. The focused suite covers cropped inference pixels, source-space landmark conversion, delayed-result rejection, calibration through a rotated crop, persistence/reconnect, normal wrong-finger feedback, and a real-model synthetic-media practice flow in Chromium and WebKit. WebKit's synthetic stream needs an explicit camera-start click to satisfy autoplay; this is not a physical Desk View permission test.

The original frozen Safari test on port 5184 remains untouched. The integrated crop candidate is separately served on port 5192. Native Safari/Desk View tracking benefit remains for Al's hands-on review.
