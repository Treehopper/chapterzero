import { expect, test, type Page } from '@playwright/test';
import { cardWord, expectCard, expectPhase, firstRun, importAndOpen, settled, startStudy, swipe, swipeLeft, swipeRight, swipeUp, tap, tapCard } from '../helpers';

const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  await firstRun(page);
});
test.afterEach(() => { expect(errors, 'console errors').toEqual([]); });

const fastRight = (page: Page) => swipe(page, 220, 0, { ms: 60, steps: 4 });
const fastLeft = (page: Page) => swipe(page, -220, 0, { ms: 60, steps: 4 });

test('a second right swipe during the fly animation must not mark the next, unseen card as known', async ({ page }) => {
  await tap(page.getByRole('button', { name: 'Settings' }));
  await page.getByTestId('set-frontswipe').selectOption('known');
  await tap(page.getByRole('button', { name: 'Back', exact: true }));
  await importAndOpen(page);
  await startStudy(page);
  const a = await cardWord(page);
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeRight(page);
  await fastRight(page);                          // lands while A is still flying off
  await settled(page);
  await expect(page.getByTestId('progress')).toHaveText(/^\s*1 \/ \d+$/);
  await expect(page.getByTestId('undo')).toHaveText('Already known · Undo');
  expect(await cardWord(page)).not.toBe(a);
  await expectPhase(page, 'front');
});

test('a left swipe during the fly animation does not nag about flipping the next card', async ({ page }) => {
  await importAndOpen(page);
  await startStudy(page);
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeRight(page);
  await fastLeft(page);
  await settled(page);
  await expect(page.getByTestId('progress')).toHaveText(/^\s*1 \/ \d+$/);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('toast')).toHaveCount(0);
});

test('rapid double tap ends face down, triple tap face up; nothing is lost', async ({ page }) => {
  await importAndOpen(page);
  await startStudy(page);
  const a = await cardWord(page);
  await tapCard(page); await tapCard(page);
  await settled(page);
  await expectCard(page, a, 'front');
  await tapCard(page); await tapCard(page); await tapCard(page);
  await settled(page);
  await expectCard(page, a, 'back');
});

test('the ask sheet: Space behind it must not flip the card under the modal sheet', async ({ page }) => {
  await importAndOpen(page);
  await startStudy(page);
  const a = await cardWord(page);
  await swipeRight(page);
  await expect(page.getByTestId('front-swipe-confirm')).toBeVisible();
  await page.keyboard.press('Space');            // must not flip the card under the sheet
  await page.waitForTimeout(400);
  await expectCard(page, a, 'front');
  await tap(page.getByTestId('front-known'));
  await expect(page.getByTestId('undo')).toHaveText(`“${a}” known · Undo`);
  await expectPhase(page, 'front');
});

test('the ask sheet: Enter on the focused "Yes, mark as known" button answers the question (keyboard users)', async ({ page }) => {
  await importAndOpen(page);
  await startStudy(page);
  const a = await cardWord(page);
  await page.keyboard.press('ArrowRight');       // right "swipe" from the keyboard asks too
  await expect(page.getByTestId('front-swipe-confirm')).toBeVisible();
  await page.getByTestId('front-known').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('front-swipe-confirm')).toHaveCount(0);
  await expect(page.getByTestId('undo')).toHaveText(`“${a}” known · Undo`);
  await expectPhase(page, 'front');
});

test('swipe up during the fly, then Cancel session: the grade in flight is still counted', async ({ page }) => {
  await importAndOpen(page);
  await startStudy(page);
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeRight(page);
  await swipeUp(page);
  await expect(page.getByTestId('panel')).toBeVisible();
  await tap(page.getByTestId('finish'));
  await expect(page.getByTestId('statistics')).toBeVisible();
  await expect(page.getByTestId('stat-known')).toContainText('1 word you already knew');
});

test('reload while the panel / ask sheet is open resumes the card face down without overlays', async ({ page }) => {
  await importAndOpen(page);
  await startStudy(page);
  const a = await cardWord(page);
  await swipeRight(page);
  await expect(page.getByTestId('front-swipe-confirm')).toBeVisible();
  await page.reload();
  await expectCard(page, a, 'front');
  await expect(page.getByTestId('front-swipe-confirm')).toHaveCount(0);
  await swipeUp(page);
  await expect(page.getByTestId('panel')).toBeVisible();
  await page.reload();
  await expectCard(page, a, 'front');
  await expect(page.getByTestId('panel')).toHaveCount(0);
  await swipeLeft(page);
  await expect(page.getByTestId('toast')).toContainText('Tap to flip');
  await expectCard(page, a, 'front');
});
