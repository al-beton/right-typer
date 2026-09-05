import type { LandmarkFrame } from './types'

export class LandmarkFrameBuffer {
  private frames: LandmarkFrame[] = []
  private readonly retentionMs: number

  constructor(retentionMs = 1_500) {
    this.retentionMs = retentionMs
  }

  push(frame: LandmarkFrame): void {
    this.frames.push(frame)
    const oldest = frame.timestamp - this.retentionMs
    while (this.frames[0] && this.frames[0].timestamp < oldest) this.frames.shift()
  }

  around(timestamp: number, beforeMs = 180, afterMs = 30): LandmarkFrame[] {
    return this.frames.filter(
      (frame) => frame.timestamp >= timestamp - beforeMs && frame.timestamp <= timestamp + afterMs,
    )
  }

  latest(): LandmarkFrame | undefined {
    return this.frames.at(-1)
  }

  clear(): void {
    this.frames = []
  }
}
