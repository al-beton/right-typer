// Picker hints cannot choose a named window or persist permission.
export const displayOptions: DisplayMediaStreamOptions & {
  monitorTypeSurfaces: 'exclude';
  selfBrowserSurface: 'exclude';
  surfaceSwitching: 'exclude';
  systemAudio: 'exclude';
} = {
  video: { displaySurface: 'window', frameRate: { ideal: 30 } },
  audio: false,
  monitorTypeSurfaces: 'exclude',
  selfBrowserSurface: 'exclude',
  surfaceSwitching: 'exclude',
  systemAudio: 'exclude',
};

export function displayError(error: DOMException): string {
  if (error.name === 'NotAllowedError' || error.name === 'AbortError')
    return 'Window sharing was cancelled or denied. Choose Share window to try again. If macOS blocked access, allow this browser in System Settings → Privacy & Security → Screen & System Audio Recording.';
  if (error.name === 'NotReadableError')
    return 'The window could not be read. Keep Desk View open, then choose Share window again.';
  if (error.name === 'InvalidStateError')
    return 'Choose Share window from this focused page to open the browser picker.';
  return error.message;
}

// Only a small transient canvas is used; retain counters and a checksum, never pixels.
// An unchanged thumbnail is a diagnostic, not proof that a camera has frozen.
export class DisplayDiagnostics {
  callbacks = 0;
  repeatedMediaTimes = 0;
  unchangedThumbnails = 0;
  results = 0;
  nativeCaptureTime: number | null = null;
  callbackAt = 0;
  changedAt = 0;
  mediaTime = -1;
  presentedFrames = 0;
  width = 0;
  height = 0;
  private arrivals: number[] = [];
  private checksum?: number;
  private canvas?: HTMLCanvasElement;
  observe(
    video: HTMLVideoElement,
    metadata: VideoFrameCallbackMetadata,
    at: number,
    native: number | null,
  ) {
    this.callbacks++;
    if (metadata.mediaTime === this.mediaTime) this.repeatedMediaTimes++;
    this.mediaTime = metadata.mediaTime;
    this.presentedFrames = metadata.presentedFrames;
    this.nativeCaptureTime = native;
    this.callbackAt = at;
    this.width = video.videoWidth;
    this.height = video.videoHeight;
    this.arrivals.push(at);
    this.arrivals = this.arrivals.filter((t) => t >= at - 2000);
  }
  sample(video: HTMLVideoElement, at: number) {
    this.canvas ??= document.createElement('canvas');
    this.canvas.width = 32;
    this.canvas.height = 24;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(video, 0, 0, 32, 24);
    const data = ctx.getImageData(0, 0, 32, 24).data;
    let hash = 2166136261;
    for (const value of data) hash = Math.imul(hash ^ value, 16777619);
    if (hash === this.checksum) this.unchangedThumbnails++;
    else this.changedAt = at;
    this.checksum = hash;
    ctx.clearRect(0, 0, 32, 24);
  }
  fps(now: number) {
    const recent = this.arrivals.filter((t) => t >= now - 2000);
    return recent.length < 2 ? 0 : ((recent.length - 1) * 1000) / (recent.at(-1)! - recent[0]!);
  }
}
