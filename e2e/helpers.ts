import { expect, type Page } from '@playwright/test';
import { calibration, handsAt } from '../tests/fixtures';
import type { Finger, SeenHand } from '../src/core/types';
import { EXPECTED } from '../src/core/keyboard';

declare global {
  interface Window {
    __hands: SeenHand[];
    __inferenceDelay: number;
    __terminated: number;
    __deviceId: string;
  }
}
// Test-only replacement at the worker boundary. Production code exposes no simulation mode.
// A real browser fake camera still supplies rVFC capture timestamps and pixels.
export async function syntheticCamera(page: Page) {
  await page.addInitScript(
    ({ hands }) => {
      // Incognito fake cameras rotate their opaque IDs on reload. Supply a stable
      // identity for the persistence scenario; real-camera identity changes are tested separately.
      window.__deviceId = 'synthetic-macbook-camera';
      const getSettings = MediaStreamTrack.prototype.getSettings;
      MediaStreamTrack.prototype.getSettings = function () {
        const settings = getSettings.call(this);
        return this.kind === 'video' ? { ...settings, deviceId: window.__deviceId } : settings;
      };
      let currentHands = hands;
      const poses = [{ at: 0, hands }];
      Object.defineProperty(window, '__hands', {
        get: () => currentHands,
        set: (next) => {
          currentHands = next;
          poses.push({ at: performance.now(), hands: structuredClone(next) });
        },
      });
      window.__inferenceDelay = 12;
      window.__terminated = 0;
      class SyntheticWorker {
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: (() => void) | null = null;
        terminated = false;
        postMessage(message: {
          type: string;
          bitmap?: ImageBitmap;
          id?: number;
          at?: number;
          clock?: string;
        }) {
          if (message.type === 'init') {
            setTimeout(() => {
              if (!this.terminated)
                this.onmessage?.(new MessageEvent('message', { data: { type: 'ready' } }));
            }, 20);
            return;
          }
          message.bitmap?.close();
          const data = {
            type: 'frame',
            id: message.id,
            at: message.at,
            clock: message.clock,
            hands: structuredClone(poses.findLast((p) => p.at <= (message.at ?? 0))!.hands),
          };
          setTimeout(() => {
            if (!this.terminated) this.onmessage?.(new MessageEvent('message', { data }));
          }, window.__inferenceDelay);
        }
        terminate() {
          this.terminated = true;
          window.__terminated++;
        }
      }
      window.Worker = SyntheticWorker as unknown as typeof Worker;
    },
    { hands: handsAt('f', 'left-index') },
  );
}
export async function setup(page: Page, saved = false) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up your camera' }).click();
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await expect(page.locator('#camera-badge')).toContainText('Both hands');
  if (saved) await page.getByRole('button', { name: 'Check saved key positions' }).click();
  else {
    await page.getByRole('button', { name: 'Map the key positions' }).click();
    const points = calibration().points;
    for (const point of Object.values(points)) {
      const canvas = page.locator('#overlay');
      const box = await canvas.boundingBox();
      await canvas.click({ position: { x: point.x * box!.width, y: point.y * box!.height } });
    }
    await page.getByRole('button', { name: 'Check alignment' }).click();
  }
  await expect(page.getByRole('button', { name: 'Start practising' })).toBeDisabled();
  await page.locator('#alignment').check();
  await page.locator('#identity').check();
  await expect(page.getByRole('button', { name: 'Start practising' })).toBeEnabled();
  await page.getByRole('button', { name: 'Start practising' }).click();
}
export async function press(page: Page, key: string, finger?: Finger, missing = false) {
  await page.evaluate(
    (hands) => {
      window.__hands = hands;
    },
    missing ? [] : handsAt(key, finger ?? (key === ' ' ? 'right-thumb' : EXPECTED[key]!)),
  );
  // Hold the synthetic pose around the actual event, providing independent before/after camera samples.
  await page.waitForTimeout(100);
  await page.locator('#typing').press(key === ' ' ? 'Space' : key);
  await page.waitForTimeout(100);
}
export async function word(page: Page, value: string) {
  for (const key of value + ' ') await press(page, key);
}
