import { test } from '@playwright/test';
import { tap } from './helpers';
test('debug', async ({ page }) => {
  page.on('console', (m) => console.log('INFO console', m.type(), m.text()));
  page.on('pageerror', (e) => console.log('INFO pageerror', e.message));
  await page.goto('/?packs=test');
  await tap(page.getByRole('button', { name: 'Continue in the browser' }));
  await page.waitForTimeout(8000);
  console.log('INFO text', (await page.locator('main').innerText()).slice(0, 300));
});
