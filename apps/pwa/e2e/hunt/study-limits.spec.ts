import { expect, test, type Page } from '@playwright/test';
import { cardWord, expectCard, expectPhase, firstRun, importAndOpen, settled, startStudy, studyNow, swipeLeft, swipeRight, swipeUp, tap, tapCard } from '../helpers';

const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  await firstRun(page);
});
test.afterEach(() => { expect(errors, 'console errors').toEqual([]); });

const bookId = (page: Page) => page.evaluate(() => decodeURIComponent(location.hash.split('/')[2]));


test('no daily limit: Quick start brings every word still needed to get the book ready', async ({ page }) => {
  await importAndOpen(page);
  const words = Number((await page.getByTestId('book-eta').innerText()).match(/(\d+) words?/)![1]);
  expect(words).toBeGreaterThan(20);
  await startStudy(page);
  await expect(page.getByTestId('progress')).toHaveText(new RegExp(`^\\s*0 / ${words}$`));
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeRight(page);                                 // retire: still everything else that is needed
  await settled(page);
  await expect(page.getByTestId('progress')).toHaveText(new RegExp(`^\\s*1 / ${words}$`));
});

test('a 1-card session ended with "Remove card" has 0 graded cards: statistics show it, no celebration, Keep going works', async ({ page }) => {
  await importAndOpen(page);
  await startStudy(page);
  const id = await bookId(page);
  await page.goto(`/#/study/${id}/cards-1`);
  await expect(page.getByTestId('progress')).toHaveText(/^\s*0 \/ 1$/);
  const w = await cardWord(page);
  await swipeUp(page);
  await tap(page.getByRole('button', { name: 'Edit card' }));
  await tap(page.getByRole('button', { name: 'Remove card' }));
  await expect(page.getByTestId('statistics')).toBeVisible();
  await expect(page.getByTestId('stat-reviewed')).toHaveText('0');
  await page.waitForTimeout(800);
  await expect(page.getByTestId('confetti')).toHaveAttribute('data-fired', '0');
  // the removal toast is on the statistics screen now; its Undo must not break anything
  const undo = page.getByTestId('toast').getByRole('button', { name: 'Undo' });
  if (await undo.count()) await tap(undo);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('statistics')).toBeVisible();
  await tap(page.getByTestId('study-more'));
  await tap(page.getByTestId('quick-start'));
  await expect(page.getByTestId('card-word')).toBeVisible();
  expect(await cardWord(page)).not.toBe(w);                // the removed card is gone
});

test('1-card session, wrong then right: the progress bar never shows more done than total', async ({ page }) => {
  await importAndOpen(page);
  await startStudy(page);
  const id = await bookId(page);
  await page.goto(`/#/study/${id}/cards-1`);
  const w = await cardWord(page);
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeLeft(page);
  await settled(page);
  await expectCard(page, w, 'front');
  const p = await page.getByTestId('progress').innerText();
  const [done, total] = p.trim().split('/').map((s) => Number(s.trim()));
  expect(done).toBeLessThanOrEqual(total);
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeRight(page);
  await expect(page.getByTestId('statistics')).toBeVisible();
  await expect(page.getByTestId('stat-reviewed')).toHaveText('2');
});

test('last card of a session graded by swipe: statistics appear and the undo pill does not linger; reopening shows statistics', async ({ page }) => {
  await importAndOpen(page);
  await startStudy(page);
  const id = await bookId(page);
  await page.goto(`/#/study/${id}/cards-1`);
  await cardWord(page);
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeRight(page);
  await expect(page.getByTestId('statistics')).toBeVisible();
  await expect(page.getByTestId('undo')).toHaveCount(0);
  await expect(page.getByTestId('stat-known')).toContainText('1 word you already knew');
  await page.goto('/');
  await expect(page.getByTestId('statistics')).toBeVisible();
  await tap(page.getByTestId('done'));
  await expect(page.getByTestId('study-now')).not.toHaveText(/Continue/);
});

test('front-swipe "known" on the last card ends the session cleanly', async ({ page }) => {
  await importAndOpen(page);
  await startStudy(page);
  const id = await bookId(page);
  await page.goto(`/#/study/${id}/cards-1`);
  await cardWord(page);
  await swipeRight(page);
  await tap(page.getByTestId('front-known'));
  await expect(page.getByTestId('statistics')).toBeVisible();
  await expect(page.getByTestId('stat-known')).toContainText('1 word you already knew');
  await expect(page.getByTestId('card-back')).toHaveCount(0);
});
