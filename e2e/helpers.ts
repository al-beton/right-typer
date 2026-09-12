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
    __cameraRequests: number;
    __denyCamera: boolean;
  }
}
// Test-only replacement at the worker boundary. Production code exposes no simulation mode.
// A real browser fake camera still supplies rVFC capture timestamps and pixels.
export async function syntheticCamera(page: Page, initialHands = handsAt('f', 'left-index')) {
  await page.addInitScript(
    ({ hands }) => {
      // Incognito fake cameras rotate their opaque IDs on reload. Supply a stable
      // identity for the persistence scenario; real-camera identity changes are tested separately.
      window.__deviceId = 'synthetic-macbook-camera';
      const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (constraints) => {
        const video = constraints?.video;
        // Stable test IDs stand in for Chrome's changing incognito fake-camera ID.
        if (
          video &&
          typeof video === 'object' &&
          (video.deviceId as ConstrainDOMStringParameters)?.exact === 'synthetic-macbook-camera'
        ) {
          return getUserMedia({ ...constraints, video: { ...video, deviceId: undefined } });
        }
        return getUserMedia(constraints);
      };
      navigator.mediaDevices.enumerateDevices = async () => [
        {
          kind: 'videoinput',
          deviceId: 'synthetic-macbook-camera',
          label: 'Synthetic camera',
          groupId: '',
          toJSON() {
            return {};
          },
        } as MediaDeviceInfo,
      ];
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
    { hands: initialHands },
  );
}
export async function openSettings(page: Page, group = 'camera-group') {
  if (!(await page.locator('#settings').evaluate((el) => (el as HTMLDialogElement).open)))
    await page.locator('#settings-open').click();
  const disclosure = page.locator(`#${group}`);
  if (!(await disclosure.evaluate((el) => (el as HTMLDetailsElement).open)))
    await disclosure.locator(':scope > summary').click();
}
export async function editSetup(page: Page) {
  await openSettings(page);
  if (await page.locator('#edit-map').isVisible()) await page.locator('#edit-map').click();
}
export async function resumePractice(page: Page) {
  if (await page.locator('#settings').evaluate((el) => (el as HTMLDialogElement).open))
    await page.locator('#settings-resume').click();
  else await page.getByRole('button', { name: /^(Start|Resume) practice$/ }).click();
}
export async function setup(page: Page, saved = false) {
  await page.goto('/');
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  if (!saved) {
    await expect(page.getByRole('button', { name: /^(Start|Resume) practice$/ })).toBeDisabled();
    await openSettings(page);
    for (const point of Object.values(calibration().points)) {
      const canvas = page.locator('#overlay');
      const box = await canvas.boundingBox();
      await canvas.click({ position: { x: point.x * box!.width, y: point.y * box!.height } });
    }
  }
  await expect(page.getByRole('button', { name: /^(Start|Resume) practice$/ })).toBeEnabled();
  await resumePractice(page);
}
export async function press(page: Page, key: string, finger?: Finger, missing = false) {
  await page.evaluate(
    (hands) => {
      window.__hands = hands;
    },
    missing ? [] : handsAt(key, finger ?? (key === ' ' ? 'right-thumb' : EXPECTED[key]!)),
  );
  // Hold the synthetic pose around the actual event so the nearest frame carries it. A missing
  // pose must cover the whole ±500 ms search window, otherwise an earlier pose is used instead.
  const hold = missing ? 550 : 100;
  await page.waitForTimeout(hold);
  await page.locator('#typing').press(key === ' ' ? 'Space' : key);
  await page.waitForTimeout(hold);
}
export async function word(page: Page, value: string) {
  for (const key of value + ' ') await press(page, key);
}
