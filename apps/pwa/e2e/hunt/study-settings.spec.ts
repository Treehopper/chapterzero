import { expect, test } from '@playwright/test';
import { cardWord, firstRun, importAndOpen, startStudy, swipeUp, tap } from '../helpers';

test('Settings from the pull-up panel, and Back returns to the same card', async ({ page }) => {
  await firstRun(page);
  await importAndOpen(page);
  await startStudy(page);
  const word = await cardWord(page);
  await swipeUp(page);
  await tap(page.getByTestId('panel-settings'));
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  // what changes the session comes first
  const titles = await page.locator('.section-title').allInnerTexts();
  expect(titles.slice(0, 2).map((x) => x.toLowerCase())).toEqual(['practice', 'cards']);
  await page.getByTestId('set-sentence').selectOption('off');
  await tap(page.getByRole('button', { name: 'Back', exact: true }));
  await expect(page.getByTestId('study-stage')).toHaveAttribute('data-word', word);
  await expect(page.getByTestId('study-stage').locator('.ex')).toHaveCount(0);
});
