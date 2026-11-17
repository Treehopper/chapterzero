import { expect, test } from '@playwright/test';
import { firstRun, importAndOpen, settled, swipeRight, tap, tapCard } from './helpers';

test.describe('start options (C19)', () => {
  test.beforeEach(async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
  });

  test('Study now offers Quick start, a number of cards or a time; an open session is continued', async ({ page }) => {
    await tap(page.getByTestId('study-now'));
    const sheet = page.getByTestId('start-study');
    await expect(sheet.getByTestId('quick-start')).toContainText('Quick start');
    await expect(sheet.getByRole('button', { name: '20 cards' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: '10 min' })).toBeVisible();
    await tap(sheet.getByTestId('start-cards-10'));
    await expect(page.getByTestId('progress')).toHaveText(/^\s*0 \/ 10$/);
    await tapCard(page);
    await swipeRight(page);
    await expect(page.getByTestId('progress')).toHaveText(/^\s*1 \/ 10$/);
    // leaving and coming back continues the same session, without asking again
    await page.goBack();
    await expect(page.getByTestId('study-now')).toHaveText('Continue · 1 / 10');
    await tap(page.getByTestId('study-now'));
    await expect(page.getByTestId('start-study')).toHaveCount(0);
    await expect(page.getByTestId('progress')).toHaveText(/^\s*1 \/ 10$/);
    await page.reload();                                  // a relaunch resumes it too
    await expect(page.getByTestId('progress')).toHaveText(/^\s*1 \/ 10$/);
  });

  test('a timed session counts down and ends after the card in hand', async ({ page }) => {
    await tap(page.getByTestId('study-now'));
    await tap(page.getByTestId('start-min-5'));
    await expect(page.getByTestId('time-left')).toHaveText(/^[45]:\d\d left$/);
    await tapCard(page);
    await swipeRight(page);
    await settled(page);
    await expect(page.getByTestId('card-word')).toBeVisible();        // still going
    // the same with 3 seconds (the URL takes decimals; the sheet offers whole minutes)
    const bookId = await page.evaluate(() => decodeURIComponent(location.hash.split('/')[2]));
    await page.goto(`/#/study/${bookId}/min-0.05`);
    await expect(page.getByTestId('time-left')).toHaveText('last card', { timeout: 6000 });
    await expect(page.getByTestId('card-word')).toBeVisible();        // the card in hand stays
    await tapCard(page);
    await swipeRight(page);
    await expect(page.getByTestId('statistics')).toBeVisible();
  });
});
