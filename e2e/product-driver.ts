import { expect, test as base, type Page, type TestInfo } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { handsAt } from '../tests/fixtures';
import type { Finger } from '../src/core/types';
import { EXPECTED } from '../src/core/keyboard';
import { syntheticCamera, setup, openSettings, resumePractice } from './helpers';

/** Explicit fixture evidence, independent of what the app expects. */
export type Observation = Finger | 'unknown';
export type FixturePolicy = 'traditional-right-thumb' | 'traditional-left-thumb';
export type ProductState = {
  target: string;
  input: string;
  feedback: string;
  counters: string;
  focus: string;
  drawer: boolean;
};
const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function intendedBase() {
  if (process.env.PRODUCT_BASE_SHA) return process.env.PRODUCT_BASE_SHA;
  if (process.env.GITHUB_EVENT_PATH) {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const sha = event.pull_request?.base?.sha ?? event.before;
    if (typeof sha === 'string' && /^[0-9a-f]{40}$/.test(sha) && !/^0+$/.test(sha)) return sha;
  }
  try {
    return git('merge-base', 'HEAD', 'origin/main');
  } catch {
    // Default Actions checkout is shallow. A PR merge commit still names its base parent.
    const parents = [...git('cat-file', '-p', 'HEAD').matchAll(/^parent ([0-9a-f]{40})$/gm)];
    if (parents.length > 1) return parents[0]![1]!;
    return 'unavailable in shallow checkout; set PRODUCT_BASE_SHA';
  }
}

/** Scenario format: ordinary async TypeScript using real UI actions and Playwright assertions. */
export class ProductDriver {
  readonly events: unknown[] = [];
  private randomState: number;
  private stepNumber = 0;
  constructor(
    readonly page: Page,
    readonly info: TestInfo,
    readonly seed: number,
  ) {
    this.randomState = seed >>> 0;
  }
  private jitter() {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState % 41;
  }
  async snapshot(): Promise<ProductState> {
    return this.page.evaluate(() => ({
      target: document.querySelector('.passage .active')?.textContent?.trim() ?? '',
      input: (document.querySelector('#typing') as HTMLInputElement)?.value ?? '',
      feedback: document.querySelector('#feedback')?.textContent?.trim() ?? '',
      counters: document.querySelector('.practice-metrics')?.textContent?.trim() ?? '',
      focus: document.activeElement?.id ?? '',
      drawer: (document.querySelector('#settings') as HTMLDialogElement)?.open ?? false,
    }));
  }
  async transition(label: string, action: () => Promise<unknown>) {
    await base.step(label, async () => {
      const before = await this.snapshot();
      try {
        await action();
      } finally {
        this.events.push({ action: label, before, after: await this.snapshot() });
      }
    });
  }
  async checkpoint(label: string) {
    const path = this.info.outputPath(
      `${++this.stepNumber}-${label.replace(/[^a-z0-9-]/gi, '-')}.png`,
    );
    await this.page.screenshot({ path, fullPage: true });
    await this.info.attach(`SYNTHETIC ${label}`, { path, contentType: 'image/png' });
  }
  async check(label: string, expected: Partial<ProductState>) {
    await base.step(label, async () => {
      try {
        await expect.poll(() => this.snapshot()).toMatchObject(expected);
      } finally {
        this.events.push({ assertion: label, expected, actual: await this.snapshot() });
      }
    });
  }
  async start() {
    this.page.setDefaultTimeout(10000);
    await syntheticCamera(this.page);
    // Label test sessions without adding consumer controls or changing layout.
    await this.page.addInitScript(() => {
      addEventListener('DOMContentLoaded', () => {
        document.title = `SYNTHETIC PRODUCT TEST — ${document.title}`;
        const label = document.createElement('div');
        label.textContent = 'SYNTHETIC PRODUCT TEST · fake video / supplied fingers';
        label.setAttribute('aria-hidden', 'true');
        label.style.cssText =
          'position:fixed;bottom:0;left:0;z-index:2147483647;background:#111;color:#fff;font:11px monospace;padding:3px;pointer-events:none;max-width:100vw;box-sizing:border-box';
        document.body.append(label);
        // Native modal dialogs paint above body overlays. Keep their evidence labeled too.
        document.querySelector('#settings')?.append(label.cloneNode(true));
      });
    });
    // Date-only control leaves performance.now(), capture timestamps and timers real.
    if (process.env.PRODUCT_DATE)
      await this.page.clock.setFixedTime(new Date(process.env.PRODUCT_DATE));
    await this.transition('fresh profile: map through UI and start practice', () =>
      setup(this.page),
    );
    const sha = await this.page.locator('#build-version a').getAttribute('title');
    const expectedSha =
      process.env.PRODUCT_SHA ?? process.env.GITHUB_SHA ?? git('rev-parse', 'HEAD');
    expect(sha, 'artifact SHA must match the requested candidate').toBe(expectedSha);
    this.events.push({
      artifact: {
        sha,
        base: intendedBase(),
        url: this.page.url(),
      },
    });
    await this.checkpoint('fresh-practice');
  }
  async target() {
    const value = (await this.snapshot()).target;
    expect(value, 'a visible active target is required').not.toBe('');
    return value;
  }
  async pose(key: string, observed: Observation) {
    await this.page.evaluate(
      (hands) => {
        window.__hands = hands;
      },
      observed === 'unknown' ? [] : handsAt(key, observed),
    );
  }
  async delayInference(ms: number) {
    if (!Number.isFinite(ms) || ms < 0 || ms > 10000)
      throw new Error('Inference delay must be 0–10000 ms');
    await this.page.evaluate((delay) => {
      window.__inferenceDelay = delay;
    }, ms);
    this.events.push({ inferenceDelayMs: ms });
  }
  async press(
    key: string,
    observed: Observation,
    options: { code?: string; cadenceMs?: number } = {},
  ) {
    await this.transition(
      `press ${JSON.stringify(key)} using ${observed}${options.code ? ` / ${options.code}` : ''}`,
      async () => {
        // Never focus the input here: lost focus is an observable event-ownership bug.
        await expect(this.page.locator('#typing')).toBeFocused();
        await this.pose(key, observed);
        const hold = observed === 'unknown' ? 550 : 100;
        await this.wait(hold);
        await this.page.keyboard.press(options.code ?? (key === ' ' ? 'Space' : key));
        await this.wait(hold + (options.cadenceMs ?? this.jitter()));
      },
    );
  }
  async type(text: string, observations: Observation[]) {
    if ([...text].length !== observations.length)
      throw new Error('Every character needs explicit observation evidence');
    for (const [index, key] of [...text].entries()) await this.press(key, observations[index]!);
  }
  async correctWord(policy: FixturePolicy) {
    const value = await this.target();
    this.events.push({ fixturePolicy: policy, target: value });
    for (const key of value) {
      const finger = EXPECTED[key];
      if (!finger) throw new Error(`No traditional fixture finger for ${key}`);
      await this.press(key, finger);
    }
    await this.submit(policy === 'traditional-left-thumb' ? 'left-thumb' : 'right-thumb');
  }
  async submit(observed: Observation) {
    await this.press(' ', observed);
  }
  async backspace() {
    await this.transition('backspace', () => this.page.keyboard.press('Backspace'));
  }
  async retry() {
    await this.transition('Retry word', () =>
      this.page.getByRole('button', { name: /^Retry word/ }).click(),
    );
  }
  async pause() {
    await this.transition('Pause', () =>
      this.page.getByRole('button', { name: 'Pause', exact: true }).click(),
    );
  }
  async resume() {
    await this.transition('explicit resume', () => resumePractice(this.page));
  }
  async openSettings(group = 'camera-group') {
    await this.transition(`open ${group}`, () => openSettings(this.page, group));
  }
  async closeSettings() {
    await this.transition('close drawer and remain paused', () =>
      this.page.locator('#settings-close').click(),
    );
  }
  async reload() {
    await this.transition('reload existing synthetic profile', () => this.page.reload());
  }
  async wait(ms: number) {
    await this.page.waitForTimeout(ms);
  }
  async persisted() {
    return this.page.evaluate(() => JSON.parse(localStorage.getItem('right-typer.v1') ?? '{}'));
  }
  /** Bounded real UI completion; no imported passage or state/counter writes. */
  async exercise(policy: FixturePolicy, maxWords = 80) {
    if (!Number.isInteger(maxWords) || maxWords < 1 || maxWords > 1000)
      throw new Error('Exercise bound must be 1–1000 words');
    for (let count = 0; count < maxWords; count++) {
      if ((await this.snapshot()).feedback.includes('Passage complete')) return count;
      const before = await this.snapshot();
      await this.target();
      await this.correctWord(policy);
      await expect
        .poll(async () => {
          const state = await this.snapshot();
          return (
            state.target !== before.target ||
            state.counters !== before.counters ||
            state.feedback.includes('Passage complete')
          );
        })
        .toBe(true);
      if ((await this.snapshot()).feedback.includes('Passage complete')) return count + 1;
    }
    throw new Error(`Exercise did not complete within ${maxWords} words`);
  }
  async session(exercises: number, policy: FixturePolicy, maxWords = 80) {
    if (!Number.isInteger(exercises) || exercises < 1 || exercises > 5)
      throw new Error('Session must contain 1–5 exercises');
    for (let round = 0; round < exercises; round++) {
      await this.exercise(policy, maxWords);
      await this.checkpoint(`exercise-${round + 1}-complete`);
      if (round + 1 < exercises)
        await this.page.getByRole('button', { name: 'Practise again', exact: true }).click();
    }
  }
}

export const test = base.extend<{ product: ProductDriver }>({
  product: async ({ page, browser }, use, info) => {
    const seed = Number(process.env.PRODUCT_SEED ?? 285);
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
      throw new Error('PRODUCT_SEED must be a uint32');
    const driver = new ProductDriver(page, info, seed);
    const startedAt = new Date().toISOString();
    const runnerSha = git('rev-parse', 'HEAD');
    const runnerChanges = git('status', '--short');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await driver.start();
      await use(driver);
      expect(errors, 'no uncaught browser errors').toEqual([]);
    } finally {
      const reportPath = info.outputPath('synthetic-product-report.json');
      await writeFile(
        reportPath,
        JSON.stringify(
          {
            synthetic: true,
            startedAt,
            finishedAt: new Date().toISOString(),
            command: [
              'pnpm',
              'exec',
              'playwright',
              'test',
              'e2e/product-journeys.spec.ts',
              '--grep',
              info.title,
              '--trace',
              'on',
            ],
            environment: Object.fromEntries(
              [
                'PLAYWRIGHT_BASE_URL',
                'PLAYWRIGHT_PORT',
                'PRODUCT_SHA',
                'PRODUCT_BASE_SHA',
                'PRODUCT_SEED',
                'PRODUCT_DATE',
                'PRODUCT_EXERCISES',
              ].map((key) => [key, process.env[key] ?? null]),
            ),
            scenarioVersion: 1,
            scenario: info.title,
            seed,
            browser: browser.version(),
            date: process.env.PRODUCT_DATE ?? 'real browser wall clock',
            runnerSha,
            runnerChanges,
            runnerChangedDuringRun:
              runnerSha !== git('rev-parse', 'HEAD') || runnerChanges !== git('status', '--short'),
            status: info.status,
            errors,
            events: driver.events,
          },
          null,
          2,
        ),
      );
      await info.attach('synthetic-product-report', {
        path: reportPath,
        contentType: 'application/json',
      });
      if (!page.isClosed()) await driver.checkpoint('final-state');
    }
  },
});
export { expect };
