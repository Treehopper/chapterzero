import { expect, test, type Page } from '@playwright/test';
import { cardWord, expectCard, expectPhase, firstRun, importAndOpen, settled, startStudy, swipeLeft, swipeRight, swipeUp, tap, tapCard } from '../helpers';

const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  await firstRun(page);
  await importAndOpen(page);
});
test.afterEach(() => { expect(errors, 'console errors').toEqual([]); });

const bookId = (page: Page) => page.evaluate(() => decodeURIComponent(location.hash.split('/')[2]));
const back = (page: Page) => page.getByTestId('card-back');

test('a later grade takes the "Remove card" toast away: its Undo would now undo the grade', async ({ page }) => {
  await startStudy(page);
  const a = await cardWord(page);
  await swipeUp(page);
  await tap(page.getByRole('button', { name: 'Edit card' }));
  await tap(page.getByRole('button', { name: 'Remove card' }));
  await expect(page.getByTestId('toast')).toContainText(`“${a}” removed`);
  const b = await cardWord(page);
  expect(b).not.toBe(a);
  // grade the next card while the removal toast is still up
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeRight(page);
  await settled(page);
  const c = await cardWord(page);
  expect(c).not.toBe(b);
  await expect(page.getByTestId('toast')).toHaveCount(0);
  // the pill undoes what it says: the grade of B
  await tap(page.getByTestId('undo'));
  await settled(page);
  await expectCard(page, b);
});

test('mark as known on the last card: the toast on the statistics screen must not offer a dead Undo', async ({ page }) => {
  await startStudy(page);
  const id = await bookId(page);
  await page.goto(`/#/study/${id}/cards-1`);
  await expect(page.getByTestId('progress')).toHaveText(/^\s*0 \/ 1$/);
  const w = await cardWord(page);
  await swipeUp(page);
  await tap(page.getByTestId('panel-known'));
  await expect(page.getByTestId('statistics')).toBeVisible();
  await expect(page.getByTestId('stat-known')).toContainText('1 word you already knew');
  const undo = page.getByTestId('toast').getByRole('button', { name: 'Undo' });
  if (await undo.count()) {
    await tap(undo);
    // if Undo is offered it must do something: bring the card back (or at least not stay on the stats as if nothing happened)
    await expect(page.getByTestId('study-stage')).toBeVisible({ timeout: 3000 });
    await expectCard(page, w);
  }
});

test('undo pill off: no pill, and the panel never offers Undo', async ({ page }) => {
  const id = await bookId(page);
  await page.goto('/#/settings');
  await page.getByTestId('set-undo').tap();
  await expect(page.getByTestId('set-undo')).not.toBeChecked();
  await page.goto(`/#/book/${id}`);
  await startStudy(page);
  const w = await cardWord(page);
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeRight(page);
  await settled(page);
  expect(await cardWord(page)).not.toBe(w);
  await expect(page.getByTestId('undo')).toHaveCount(0);
  await swipeUp(page);
  await expect(page.getByTestId('panel')).toBeVisible();
  await expect(page.getByTestId('panel').getByRole('button')).toHaveText(['Edit card', 'Mark as known', 'Cancel session']);
});

test('keyboard: Enter on the focused Undo pill undoes instead of flipping the card', async ({ page }) => {
  await startStudy(page);
  const w = await cardWord(page);
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeRight(page);
  await settled(page);
  const next = await cardWord(page);
  expect(next).not.toBe(w);
  await page.getByTestId('undo').focus();
  await page.keyboard.press('Enter');
  await settled(page);
  await expectCard(page, w, 'back');
});

test('keyboard: Enter on the focused handle opens the panel; Enter on "Cancel session" ends the session', async ({ page }) => {
  await startStudy(page);
  await page.getByTestId('grab').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('panel')).toBeVisible();
  await expectPhase(page, 'front');
  await page.getByTestId('finish').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('statistics')).toBeVisible();
});

test('undo twice (Z Z) is harmless and the second does nothing', async ({ page }) => {
  await startStudy(page);
  const w = await cardWord(page);
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeRight(page);
  await settled(page);
  await page.keyboard.press('z');
  await page.keyboard.press('z');
  await settled(page);
  await expectCard(page, w, 'back');
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
});

test('undo of a grade keeps an edit made afterwards to the same (re-queued) card', async ({ page }) => {
  await startStudy(page);
  const id = await bookId(page);
  await page.goto(`/#/study/${id}/cards-1`);
  const w = await cardWord(page);
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeLeft(page);                       // the only card comes straight back (queue was empty)
  await settled(page);
  await expectCard(page, w, 'front');
  await swipeUp(page);
  await tap(page.getByRole('button', { name: 'Edit card' }));
  await page.getByLabel('Translation 1', { exact: true }).fill('meine Übersetzung');
  await tap(page.getByTestId('save-edit'));
  await settled(page);
  await tapCard(page);
  await expectCard(page, w, 'back');
  await expect(back(page)).toContainText('meine Übersetzung');
  await page.keyboard.press('z');              // undo the "didn't know" grade
  await settled(page);
  await expectCard(page, w, 'back');
  await expect(back(page)).toContainText('meine Übersetzung');
});

test('undo after an edit of the next card: the edit survives, the previous card comes back', async ({ page }) => {
  await startStudy(page);
  const a = await cardWord(page);
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeRight(page);
  await settled(page);
  const b = await cardWord(page);
  await swipeUp(page);
  await tap(page.getByRole('button', { name: 'Edit card' }));
  await page.getByLabel('Translation 1', { exact: true }).fill('zwei');
  await tap(page.getByTestId('save-edit'));
  await settled(page);
  await page.keyboard.press('z');
  await settled(page);
  await expectCard(page, a, 'back');
  await swipeRight(page);
  await settled(page);
  await expectCard(page, b, 'front');
  await tapCard(page);
  await expect(back(page)).toContainText('zwei');
});
