import { test, expect } from '@playwright/test';
import { setup, syntheticCamera } from './helpers';
import { handsAt } from '../tests/fixtures';

test('implicit setup checks report evidence, preserve control ownership and discard stale results', async ({
  page,
}) => {
  await syntheticCamera(page);
  await setup(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const result = page.locator('#diagnostic-result');
  const go = page.getByRole('button', { name: 'Go', exact: true });
  await expect(page.locator('#diagnostic-input')).toHaveCount(0);
  await page.locator('#overlay').press('f');
  await expect(result).toContainText('saw left index');
  await page.evaluate(
    (hands) => {
      window.__hands = hands;
    },
    handsAt('f', 'right-index'),
  );
  await page.waitForTimeout(150);
  await page.locator('#overlay').press('f');
  await expect(result).toContainText('saw right index. Intended: left index.');
  await expect(go).toBeEnabled();
  await page.evaluate(() => {
    window.__hands = [];
  });
  await page.waitForTimeout(550);
  await page.locator('#overlay').press('f');
  await expect(result).toContainText('f: unknown.');
  await expect(go).toBeEnabled();
  const unknown = await result.textContent();
  // Includes native controls, custom editors and shortcut/composition/repeat events.
  await page.evaluate(() => {
    for (const html of [
      '<input>',
      '<textarea></textarea>',
      '<div contenteditable="true"><span>edit</span></div>',
      '<div role="grid"><span>key editor</span></div>',
    ]) {
      const host = document.createElement('div');
      host.innerHTML = html;
      document.body.append(host);
      const target = host.querySelector('span') ?? host.firstElementChild!;
      const event = new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      if (event.defaultPrevented) throw new Error('Configuration key consumed');
      host.remove();
    }
    for (const selector of ['#device', '#camera-rotation', '#swap', '#fingering-mode']) {
      const event = new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true });
      document.querySelector(selector)!.dispatchEvent(event);
      if (event.defaultPrevented) throw new Error('Control key consumed');
    }
    for (const modifiers of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { repeat: true },
      { isComposing: true },
    ]) {
      const event = new KeyboardEvent('keydown', {
        key: 'f',
        bubbles: true,
        cancelable: true,
        ...modifiers,
      });
      document.body.dispatchEvent(event);
      if (event.defaultPrevented) throw new Error('Modified key consumed');
    }
  });
  await expect(result).toHaveText(unknown!);
  await page.evaluate(() => {
    window.__inferenceDelay = 450;
  });
  await page.locator('#overlay').press('f');
  await page.locator('#swap').click();
  await page.waitForTimeout(700);
  await expect(result).toHaveText('Press a practice key to check the observed finger.');
  await page.evaluate(
    (hands) => {
      window.__hands = hands;
      window.__inferenceDelay = 12;
    },
    handsAt('f', 'left-index'),
  );
  await page.waitForTimeout(550);
  await page.locator('#overlay').press('f');
  await expect(result).toContainText('saw right index');
  await go.click();
  await expect(result).toBeEmpty();
  await expect(page.locator('#typing')).toBeFocused();
});

test('camera controls wrap without overflow and Go remains independent of checks', async ({
  page,
}) => {
  await syntheticCamera(page);
  await setup(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const boxes = await page.locator('.camera-options').evaluate((el) => ({
      width: el.clientWidth,
      scroll: el.scrollWidth,
      children: [...el.children].map((c) => {
        const r = c.getBoundingClientRect();
        return { left: r.left, right: r.right };
      }),
    }));
    expect(boxes.scroll).toBeLessThanOrEqual(boxes.width);
    expect(boxes.children.every((b) => b.left >= 0 && b.right <= width)).toBe(true);
    await page.screenshot({ path: `test-results/compact-setup-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.locator('#typing')).toBeEnabled();
});
