/** Captures the main screens for visual review (test-results/shots). */
import { test } from '@playwright/test';
import { firstRun, importBook, swipeLeft, tap, tapCard } from './helpers';

test('screenshots', async ({ page }) => {
  const shot = (n: string) => page.screenshot({ path: `test-results/shots/${n}.png` });
  await page.goto('/?packs=test');
  await shot('01-install');
  await tap(page.getByRole('button', { name: 'Continue in the browser' }));
  await page.getByTestId('check-word').waitFor();
  await shot('02-check');
  await tapCard(page);
  await page.waitForTimeout(400);
  await shot('03-check-back');
  await tap(page.getByRole('button', { name: 'Skip' }));
  await page.getByRole('heading', { name: 'Library' }).waitFor();
  await shot('04-library-empty');
  await importBook(page);
  await shot('05-preview');
  await tap(page.getByTestId('create-cards'));
  await page.getByTestId('book-coverage').waitFor();
  await shot('06-book');
  await tap(page.getByTestId('study-now'));
  await page.getByTestId('card-word').waitFor();
  await page.waitForTimeout(400);
  await shot('07-study-front');
  await tapCard(page);
  await page.waitForTimeout(500);
  await shot('08-study-back');
  await swipeLeft(page);
  await page.waitForTimeout(700);
  await shot('09-review');
});
