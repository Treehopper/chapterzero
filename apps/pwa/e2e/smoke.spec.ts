import { expect, test } from '@playwright/test';
import { firstRun, importAndOpen, startStudy } from './helpers';

test('first run, import and first card @android', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await firstRun(page);
  await expect(page.getByTestId('level-hint')).toBeVisible();
  await importAndOpen(page);
  await startStudy(page);
  expect(errors).toEqual([]);
});
