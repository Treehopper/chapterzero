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

async function setDailyLimit(page: Page, n: number) {
  await tap(page.getByRole('button', { name: 'Settings' }));
  const input = page.getByLabel('New cards per day');
  await input.fill(String(n));
  await input.blur();
  await tap(page.getByRole('button', { name: 'Back', exact: true }));
}

test('daily limit 1: one new card; after it is learnt nothing is due; "Get ahead" brings it back and resumes after a reload', async ({ page }) => {
  await setDailyLimit(page, 1);
  await importAndOpen(page);
  await startStudy(page);
  await expect(page.getByTestId('progress')).toHaveText(/^\s*0 \/ 1$/);
  const w = await cardWord(page);
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeLeft(page);                                  // wrong → comes straight back
  await settled(page);
  await expectCard(page, w, 'front');
  await expect(page.getByTestId('progress')).toHaveText(/^\s*1 \/ 2$/);
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeRight(page);                                 // known now (not first sight) → level 1, due tomorrow
  await expect(page.getByTestId('statistics')).toBeVisible();
  await expect(page.getByTestId('stat-reviewed')).toHaveText('2');
  await tap(page.getByTestId('done'));
  await studyNow(page);
  await expect(page.getByTestId('nothing-due')).toBeVisible();
  await page.reload();                                    // nothing-due is not a session: reloading shows it again
  await expect(page.getByTestId('nothing-due').or(page.getByTestId('study-now'))).toBeVisible();
  if (await page.getByTestId('study-now').isVisible()) await studyNow(page);
  await expect(page.getByTestId('nothing-due')).toBeVisible();
  await tap(page.getByRole('button', { name: 'Get ahead' }));
  await expectCard(page, w, 'front');
  await expect(page.getByTestId('progress')).toHaveText(/^\s*0 \/ 1$/);
  await page.reload();                                    // the get-ahead session resumes (C5)
  await expectCard(page, w, 'front');
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeRight(page);
  await expect(page.getByTestId('statistics')).toBeVisible();
  await expect(page.getByTestId('stat-reviewed')).toHaveText('1');
});

test('daily limit 2: retiring at first sight pulls in the next new card (limit not used up); a plain grade does not', async ({ page }) => {
  await setDailyLimit(page, 2);
  await importAndOpen(page);
  await startStudy(page);
  await expect(page.getByTestId('progress')).toHaveText(/^\s*0 \/ 2$/);
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeRight(page);                                 // retire
  await settled(page);
  await expect(page.getByTestId('undo')).toHaveText('Already known · Undo');
  await expect(page.getByTestId('progress')).toHaveText(/^\s*1 \/ 3$/);
  await swipeUp(page);
  await tap(page.getByTestId('panel-known'));             // mark as known: refills too
  await settled(page);
  await expect(page.getByTestId('progress')).toHaveText(/^\s*2 \/ 4$/);
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeLeft(page);                                  // wrong: used the limit, re-queued
  await settled(page);
  await expect(page.getByTestId('progress')).toHaveText(/^\s*3 \/ 5$/);
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
