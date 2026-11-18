import { expect, test, type Page } from '@playwright/test';
import { cardWord, expectCard, expectPhase, firstRun, importAndOpen, startStudy, studyNow, swipe, swipeLeft, swipeRight, swipeUp, tap, tapCard } from './helpers';

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
    await swipeRight(page);                       // not flipped yet → asks once, "No" → no grade
    await tap(page.getByRole('button', { name: "No, I'll flip first" }));
    await expectCard(page, w, 'front');
    await swipeRight(page);                       // not asked again, still no grade
    await expect(page.getByTestId('front-swipe-confirm')).toHaveCount(0);
    await expectCard(page, w, 'front');
    await tapCard(page);
    await expectCard(page, w, 'back');
    await expect(back(page)).toBeVisible();
    await expect(page.getByTestId('box-dots')).toHaveText('new');       // labelled, not a lone unexplained dot
    await expect(page.getByTestId('box-dots').locator('i')).toHaveCount(8);
    await expect(page.getByTestId('hints')).toContainText('knew');
    await swipe(page, 60, 0, { ms: 400 });        // < 30 % and slow → springs back
    await expectCard(page, w, 'back');
    await swipe(page, 0, 0);                      // a tap flips back
    await expectCard(page, w, 'front');
    await expect(page.getByTestId('card-word')).toBeVisible();
  });

  test('after "Yes" to the one-time question, a swipe on the front grades', async ({ page }) => {
    const w = await cardWord(page);
    await swipeRight(page);
    await tap(page.getByRole('button', { name: 'Yes, count it as “knew it”' }));
    await expect(page.getByTestId('undo')).toHaveText('Already known · Undo');
    const next = await cardWord(page);
    expect(next).not.toBe(w);
    await swipeLeft(page);                        // straight from the front, no question → shows the answer to review
    await expect(page.getByTestId('front-swipe-confirm')).toHaveCount(0);
    await expectCard(page, next, 'wrongReview');
  });

  test('flipped and turned back to the front: a swipe grades without asking', async ({ page }) => {
    const w = await cardWord(page);
    await tapCard(page);
    await expectPhase(page, 'back');
    await tapCard(page);
    await expectPhase(page, 'front');
    await swipeLeft(page);
    await expect(page.getByTestId('front-swipe-confirm')).toHaveCount(0);
    await expectPhase(page, 'front');                 // seen already: straight on, no review step
    expect(await cardWord(page)).not.toBe(w);
    await expect(page.getByTestId('undo')).toHaveText('Undo');
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

  test('the back shows lookup links; a left swipe after the flip moves straight on (C16)', async ({ page }) => {
    const w = await cardWord(page);
    await expect(page.getByRole('link', { name: 'Wiktionary ↗' })).toHaveCount(0);
    await tapCard(page);
    await expectPhase(page, 'back');
    const link = page.getByRole('link', { name: 'Wiktionary ↗' });
    await expect(link).toHaveAttribute('href', `https://en.wiktionary.org/wiki/${w}#English`);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('link', { name: 'dict.cc ↗' })).toBeVisible();
    const [a, face] = await Promise.all([link.boundingBox(), page.locator('.back').boundingBox()]);
    expect(a!.y + a!.height).toBeLessThanOrEqual(face!.y + face!.height);
    await swipeLeft(page);
    await expectPhase(page, 'front');
    expect(await cardWord(page)).not.toBe(w);
    await expect(page.getByTestId('undo')).toHaveText('Undo');
    await tap(page.getByTestId('undo'));
    await expectCard(page, w, 'back');
  });

  test('close and reopen: same card, same side, same counters (C5)', async ({ page }) => {
    await tapCard(page);
    await expectPhase(page, 'back');
    await swipeLeft(page);
    await expectPhase(page, 'front');
    const w = await cardWord(page);
    await tapCard(page);                          // flip the new card
    await expectCard(page, w, 'back');
    const progress = await page.getByTestId('progress').innerText();
    await page.reload();
    await expectCard(page, w, 'back');
    await expect(back(page)).toBeVisible();
    await expect(page.getByTestId('progress')).toHaveText(progress);
    // relaunching the app from the start URL resumes too
    await page.goto('/');
    await expectCard(page, w, 'back');
  });

  test('review after a wrong swipe on the front survives a reload', async ({ page }) => {
    await swipeLeft(page);
    await tap(page.getByRole('button', { name: "Yes, count it as “didn't know”" }));
    await expectPhase(page, 'wrongReview');
    await expect(page.getByText('tap or swipe to continue')).toBeVisible();
    await page.reload();
    await expect(page.getByText('tap or swipe to continue')).toBeVisible();
    await swipeRight(page);                       // swiping in review mode continues, never grades again
    await expectPhase(page, 'front');
    await expect(page.getByText('tap or swipe to continue')).toHaveCount(0);
  });

  test('progress and Finish are always visible; swipe up opens the panel; edge swipes are ignored (C11, C12)', async ({ page }) => {
    const p = page.getByTestId('progress');
    await expect(p).toBeVisible();
    await expect(p).toHaveText(/^\s*0 \/ \d+$/);
    await expect(page.getByTestId('end-session')).toBeVisible();
    await tapCard(page);
    await expectPhase(page, 'back');
    await swipeRight(page);
    await expect(p).toHaveText(/^\s*1 \/ \d+$/);
    // a vertical swipe starting at the bottom edge belongs to iOS
    await swipe(page, 0, -160, { from: { x: 196, y: page.viewportSize()!.height - 10 } });
    await page.waitForTimeout(200);
    await expect(page.getByTestId('panel')).toHaveCount(0);
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

  test('"translation makes no sense" moves the word to Not in lists; undo brings the card back', async ({ page }) => {
    const w = await cardWord(page);
    await swipeUp(page);
    await tap(page.getByTestId('nonsense'));
    await expect(page.getByTestId('toast')).toContainText(`“${w}” moved to the words not in the lists`);
    expect(await cardWord(page)).not.toBe(w);
    await tap(page.getByTestId('toast').getByRole('button', { name: 'Undo' }));
    await expectCard(page, w);
    await swipeUp(page);
    await tap(page.getByTestId('nonsense'));
    await expect(page.getByTestId('toast')).toBeVisible();
    await tap(page.getByTestId('end-session'));
    await tap(page.getByTestId('done'));
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await expect(page.getByRole('tab', { name: /Not in lists/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(`[data-word="${w}"]`)).toBeVisible();
  });

  test('finish shows statistics; reopening shows them again (C14)', async ({ page }) => {
    await tapCard(page);
    await expectPhase(page, 'back');
    await swipeLeft(page);
    await expectPhase(page, 'front');
    await tapCard(page);
    await expectPhase(page, 'back');
    await swipeRight(page);
    await expect(page.getByTestId('undo')).toHaveText('Already known · Undo');
    await tap(page.getByTestId('end-session'));
    await expect(page.getByTestId('statistics')).toBeVisible();
    await expect(page.getByTestId('stat-reviewed')).toHaveText('1');
    await expect(page.getByTestId('stat-known')).toContainText('1 word you already knew was removed');
    await page.reload();
    await expect(page.getByTestId('statistics')).toBeVisible();
    await tap(page.getByTestId('done'));
    await expect(page.getByTestId('book-coverage')).toBeVisible();
  });

  test('finishing on the first card without grading anything does not celebrate', async ({ page }) => {
    await expectPhase(page, 'front');
    await tap(page.getByTestId('end-session'));
    await expect(page.getByTestId('statistics')).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByTestId('confetti')).toHaveAttribute('data-fired', '0');
  });

  test('coverage gained outside the session (re-filter) is not celebrated when finishing without a grade', async ({ page }) => {
    await expectPhase(page, 'front');
    await page.goBack();
    await tap(page.getByRole('button', { name: 'Book options' }));
    await tap(page.getByRole('button', { name: 'Change level for this book…' }));
    await page.getByLabel('Cutoff rank').fill('20000');   // lifts the first chapter from 84 % past the 98 % target
    await tap(page.getByRole('button', { name: 'Re-filter' }));
    await expect(page.getByTestId('toast')).toBeVisible();
    await studyNow(page);
    // the open card was filtered out: the session skips it (it used to hang on "Loading…")
    const end = page.getByTestId('end-session');
    await expect(end.or(page.getByTestId('statistics'))).toBeVisible();
    if (await end.isVisible()) await tap(end);
    await expect(page.getByTestId('statistics')).toBeVisible();
    await expect(page.getByTestId('stat-reviewed')).toHaveText('0');
    await page.waitForTimeout(800);
    await expect(page.getByTestId('confetti')).toHaveAttribute('data-fired', '0');
  });

  test('keyboard: space flips, arrows grade, Z undoes (C7)', async ({ page }) => {
    const w = await cardWord(page);
    await page.keyboard.press('Space');
    await expectPhase(page, 'back');
    await page.keyboard.press('ArrowLeft');
    await expectPhase(page, 'front');
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
  const b = page.getByTestId('banner');
  await expect(b).toContainText('On a Roll · Bronze');
  const box = (await b.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(80);       // big enough to notice
  await page.waitForTimeout(3500);
  await expect(b).toBeVisible();                       // stays a while…
  await tap(b);
  await expect(b).toHaveCount(0);                      // …unless tapped away
  await expectPhase(page, 'front');                    // the tap does not reach the card
});
