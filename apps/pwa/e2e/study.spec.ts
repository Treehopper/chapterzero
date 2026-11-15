import { expect, test, type Page } from '@playwright/test';
import { cardWord, expectCard, expectPhase, firstRun, importAndOpen, startStudy, swipe, swipeDown, swipeLeft, swipeRight, swipeUp, tap, tapCard } from './helpers';

async function ready(page: Page) {
  await firstRun(page);
  await importAndOpen(page);
  await startStudy(page);
}
const back = (page: Page) => page.getByTestId('card-back');

test.describe('study (C1–C18)', () => {
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('tap flips; swipes only grade after the flip; short drags spring back @android', async ({ page }) => {
    const w = await cardWord(page);
    await expect(page.getByTestId('hints')).toContainText('tap to flip');
    await swipeRight(page);                       // not flipped yet → no grade
    await expectCard(page, w, 'front');
    await tapCard(page);
    await expectCard(page, w, 'back');
    await expect(back(page)).toBeVisible();
    await expect(page.getByTestId('hints')).toContainText('knew');
    await swipe(page, 60, 0, { ms: 400 });        // < 30 % and slow → springs back
    await expectCard(page, w, 'back');
    await swipe(page, 0, 0);                      // a tap flips back
    await expectCard(page, w, 'front');
    await expect(page.getByTestId('card-word')).toBeVisible();
  });

  test('first-sight right swipe retires the card; undo brings it back (C18, C6)', async ({ page }) => {
    const w = await cardWord(page);
    await tapCard(page);
    await expectPhase(page, 'back');
    await swipeRight(page);
    await expect(page.getByTestId('undo')).toHaveText('Already known · Undo');
    expect(await cardWord(page)).not.toBe(w);
    await expect(page.getByTestId('hints')).toHaveCount(0);   // all hints gone after the first grade
    await tap(page.getByTestId('undo'));
    await expectCard(page, w, 'back');
    await expect(back(page)).toBeVisible();
  });

  test('left swipe: review mode with lookup links, then continue (C16)', async ({ page }) => {
    const w = await cardWord(page);
    await tapCard(page);
    await expectPhase(page, 'back');
    await swipeLeft(page);
    await expectCard(page, w, 'wrongReview');
    const link = page.getByRole('link', { name: 'Wiktionary ↗' });
    await expect(link).toHaveAttribute('href', `https://en.wiktionary.org/wiki/${w}#English`);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('link', { name: 'dict.cc ↗' })).toBeVisible();
    await expect(page.getByText('tap or swipe to continue')).toBeVisible();
    await expect(page.getByTestId('undo')).toHaveText('Undo');
    // swiping in review mode does not grade again: it continues
    await swipeRight(page);
    await expectPhase(page, 'front');
    expect(await cardWord(page)).not.toBe(w);
    await expect(page.getByText('tap or swipe to continue')).toHaveCount(0);
  });

  test('close and reopen: same card, same side, same counters (C5)', async ({ page }) => {
    await tapCard(page);
    await expectPhase(page, 'back');
    await swipeLeft(page);
    await expectPhase(page, 'wrongReview');
    await tapCard(page);                          // continue after review
    await expectPhase(page, 'front');
    const w = await cardWord(page);
    await tapCard(page);                          // flip the new card
    await expectCard(page, w, 'back');
    await swipeDown(page);
    const progress = await page.getByTestId('progress').innerText();
    await page.reload();
    await expectCard(page, w, 'back');
    await expect(back(page)).toBeVisible();
    await swipeDown(page);
    await expect(page.getByTestId('progress')).toHaveText(progress);
    // relaunching the app from the start URL resumes too
    await page.goto('/');
    await expectCard(page, w, 'back');
  });

  test('wrong review mode survives a reload', async ({ page }) => {
    await tapCard(page);
    await expectPhase(page, 'back');
    await swipeLeft(page);
    await expectPhase(page, 'wrongReview');
    await page.reload();
    await expect(page.getByText('tap or swipe to continue')).toBeVisible();
  });

  test('swipe down shows progress for 3 s; swipe up opens the panel; edge swipes are ignored (C11, C12)', async ({ page }) => {
    await swipeDown(page);
    const p = page.getByTestId('progress');
    await expect(p).toHaveClass(/show/);
    await expect(p).toContainText('0 / ');
    await expect(p).not.toHaveClass(/show/, { timeout: 5000 });
    // a vertical swipe starting at the top edge belongs to iOS
    await swipe(page, 0, 160, { from: { x: 196, y: 20 } });
    await page.waitForTimeout(200);
    await expect(p).not.toHaveClass(/show/);
    await swipeUp(page);
    await expect(page.getByTestId('panel')).toBeVisible();
    // tapping the dimmed card closes the panel and does not flip
    await tapCard(page);
    await expect(page.getByTestId('panel')).toHaveCount(0);
    await expectPhase(page, 'front');
  });

  test('edit card from the panel keeps the card and side (C13)', async ({ page }) => {
    const w = await cardWord(page);
    await tapCard(page);
    await expectPhase(page, 'back');
    await swipeUp(page);
    await tap(page.getByRole('button', { name: '✎ Edit card' }));
    await page.getByLabel('Translation 1').fill('meine Übersetzung');
    await tap(page.getByTestId('save-edit'));
    await expectCard(page, w, 'back');
    await expect(back(page)).toContainText('meine Übersetzung');
  });

  test('remove the current card with undo toast (C13, D3)', async ({ page }) => {
    const w = await cardWord(page);
    await swipeUp(page);
    await tap(page.getByRole('button', { name: '✎ Edit card' }));
    await tap(page.getByRole('button', { name: 'Remove card' }));
    await expect(page.getByTestId('toast')).toContainText(`“${w}” removed`);
    expect(await cardWord(page)).not.toBe(w);
    await tap(page.getByTestId('toast').getByRole('button', { name: 'Undo' }));
    await expectCard(page, w);
  });

  test('finish shows statistics; reopening shows them again (C14)', async ({ page }) => {
    await tapCard(page);
    await expectPhase(page, 'back');
    await swipeLeft(page);
    await expectPhase(page, 'wrongReview');
    await tapCard(page);
    await expectPhase(page, 'front');
    await tapCard(page);
    await expectPhase(page, 'back');
    await swipeRight(page);
    await expect(page.getByTestId('undo')).toHaveText('Already known · Undo');
    await swipeUp(page);
    await tap(page.getByTestId('finish'));
    await expect(page.getByTestId('statistics')).toBeVisible();
    await expect(page.getByTestId('stat-reviewed')).toHaveText('1');
    await expect(page.getByTestId('stat-known')).toContainText('1 word you already knew was removed');
    await page.reload();
    await expect(page.getByTestId('statistics')).toBeVisible();
    await tap(page.getByTestId('done'));
    await expect(page.getByTestId('book-coverage')).toBeVisible();
  });

  test('keyboard: space flips, arrows grade, Z undoes (C7)', async ({ page }) => {
    const w = await cardWord(page);
    await page.keyboard.press('Space');
    await expectPhase(page, 'back');
    await page.keyboard.press('ArrowLeft');
    await expectPhase(page, 'wrongReview');
    await page.keyboard.press('z');
    await expectCard(page, w, 'back');
    await expect(page.getByRole('button', { name: 'Knew it' })).toBeAttached();
    await expect(page.getByRole('button', { name: "Didn't know" })).toBeAttached();
  });
});

test('achievement pop-up after 5 correct answers in a row (G1, G4)', async ({ page }) => {
  await firstRun(page);
  await tap(page.getByRole('button', { name: 'Settings' }));
  await page.getByRole('checkbox', { name: /First-try correct/ }).tap();
  await expect(page.getByText('Schedule normally')).toBeVisible();
  await tap(page.getByRole('button', { name: 'Back', exact: true }));
  await importAndOpen(page);
  await startStudy(page);
  // tap and swipe in quick succession: the swipe must not be lost while the flip is saved
  for (let i = 0; i < 5; i++) {
    await tapCard(page);
    await swipeRight(page);
  }
  await expect(page.getByTestId('banner')).toContainText('On a Roll · Bronze');
});
