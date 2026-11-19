import { expect, test, type Page } from '@playwright/test';
import { cardWord, endSession, expectCard, expectPhase, firstRun, importAndOpen, startStudy, studyNow, swipe, swipeLeft, swipeRight, swipeUp, tap, tapCard } from './helpers';

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
    await swipeRight(page);                       // not flipped yet → asks, "Cancel" → nothing happens
    await expect(page.getByTestId('front-swipe-confirm')).toContainText(`Mark “${w}” as known?`);
    await tap(page.getByRole('button', { name: "Cancel, I'll flip first" }));
    await expectCard(page, w, 'front');
    await swipeLeft(page);                        // a left swipe before the flip never grades and never shows the back
    await expect(page.getByTestId('front-swipe-confirm')).toHaveCount(0);
    await expectCard(page, w, 'front');
    await expect(page.getByTestId('toast')).toContainText('Tap to flip the card first');
    await tapCard(page);
    await expectCard(page, w, 'back');
    await expect(back(page)).toBeVisible();
    await expect(page.getByTestId('box-dots')).toHaveCount(0);          // off unless enabled in Settings
    await expect(page.getByTestId('hints')).toContainText('knew');
    await swipe(page, 60, 0, { ms: 400 });        // < 30 % and slow → springs back
    await expectCard(page, w, 'back');
    await swipe(page, 0, 0);                      // a tap flips back
    await expectCard(page, w, 'front');
    await expect(page.getByTestId('card-word')).toBeVisible();
  });

  test('right swipe before the flip: "mark as known" is asked once, then just happens; the back is never shown (C20)', async ({ page }) => {
    const w = await cardWord(page);
    await swipeRight(page);
    await tap(page.getByTestId('front-known'));
    await expect(page.getByTestId('undo')).toHaveText(`“${w}” known · Undo`);
    const next = await cardWord(page);
    expect(next).not.toBe(w);
    await expectPhase(page, 'front');
    await swipeRight(page);                       // no question any more
    await expect(page.getByTestId('front-swipe-confirm')).toHaveCount(0);
    await expect(page.getByTestId('undo')).toHaveText(`“${next}” known · Undo`);
    await expectPhase(page, 'front');
    await tap(page.getByTestId('undo'));
    await expectCard(page, next, 'front');
    await endSession(page);
    await expect(page.getByTestId('stat-known')).toContainText('1 word you already knew');
    await tap(page.getByTestId('done'));
    await tap(page.getByRole('button', { name: 'Back to library' }));
    await tap(page.getByRole('button', { name: 'Settings' }));
    await expect(page.getByTestId('set-frontswipe')).toHaveValue('known');
  });

  test('right swipe before the flip: "count it as knew it" grades from the front from then on', async ({ page }) => {
    const w = await cardWord(page);
    await swipeRight(page);
    await tap(page.getByTestId('front-grade'));
    await expect(page.getByTestId('undo')).toHaveText('Already known · Undo');   // first sight: retired (C18)
    expect(await cardWord(page)).not.toBe(w);
    await expectPhase(page, 'front');
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

  test('links on the card back can be turned off in the settings (C17)', async ({ page }) => {
    await tapCard(page);
    await expectPhase(page, 'back');
    await expect(page.getByTestId('card-links')).toBeVisible();
    const study = page.url();
    await page.goto('/#/settings');
    await page.getByTestId('set-links').tap();
    await expect(page.getByTestId('set-links')).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Show Wiktionary' })).toHaveCount(0);
    await page.waitForTimeout(300);
    await page.goto(study);
    await expectPhase(page, 'back');
    await expect(back(page)).toBeVisible();
    await expect(page.getByTestId('card-links')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Wiktionary ↗' })).toHaveCount(0);
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

  test('progress is always visible, no Finish in the corner; swipe up opens the panel; edge swipes are ignored (C11, C12)', async ({ page }) => {
    const p = page.getByTestId('progress');
    await expect(p).toBeVisible();
    await expect(p).toHaveText(/^\s*0 \/ \d+$/);
    await expect(page.getByTestId('end-session')).toHaveCount(0);
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
    await tap(page.getByRole('button', { name: 'Edit card' }));
    await page.getByLabel('Translation 1', { exact: true }).fill('meine Übersetzung');
    await tap(page.getByTestId('save-edit'));
    await expectCard(page, w, 'back');
    await expect(back(page)).toContainText('meine Übersetzung');
  });

  test('edit card: pick another part of speech, edit the definition, reorder translations (C13)', async ({ page }) => {
    expect(await cardWord(page)).toBe('moor');      // noun and verb in the lists
    await tapCard(page);
    await tap(page.getByTestId('grab'));             // the handle opens the panel too
    await tap(page.getByRole('button', { name: 'Edit card' }));
    await expect(page.getByTestId('sense-noun')).toHaveAttribute('aria-checked', 'true');
    await tap(page.getByTestId('sense-verb'));
    await expect(page.getByLabel('Translation 1', { exact: true })).toHaveValue('anlegen');
    await expect(page.getByTestId('edit-definition')).toHaveValue(/cast anchor/);
    await page.getByTestId('edit-definition').fill('To tie up a boat.');
    // reorder: the back lists the translations in this order
    await expect(page.getByRole('button', { name: 'Move translation 1 up' })).toBeDisabled();
    await tap(page.getByRole('button', { name: 'Move translation 3 up' }));
    await tap(page.getByRole('button', { name: 'Move translation 2 up' }));
    await expect(page.getByLabel('Translation 1', { exact: true })).toHaveValue('vertäuen');
    await tap(page.getByTestId('save-edit'));
    await expect(page.getByTestId('card-word')).toHaveText('to moor');
    await expect(back(page)).toHaveText('vertäuen, anlegen, ankern, festmachen');
    await expect(page.locator('.def')).toHaveText('To tie up a boat.');
  });

  test('swipe-up hint and handle on the first card (C13)', async ({ page }) => {
    await expect(page.getByTestId('hint-up')).toContainText('to edit the card or end the session');
    await expect(page.getByTestId('grab')).toBeVisible();
    await swipeUp(page);
    await expect(page.getByTestId('panel')).toBeVisible();
    await expect(page.getByTestId('panel').getByRole('button')).toHaveText(['Edit card', 'Mark as known', 'Cancel session']);
    await expect(page.getByTestId('grab')).toHaveCount(0);
  });

  test('remove the current card with undo toast (C13, D3)', async ({ page }) => {
    const w = await cardWord(page);
    await swipeUp(page);
    await tap(page.getByRole('button', { name: 'Edit card' }));
    await tap(page.getByRole('button', { name: 'Remove card' }));
    await expect(page.getByTestId('toast')).toContainText(`“${w}” removed`);
    expect(await cardWord(page)).not.toBe(w);
    await tap(page.getByTestId('toast').getByRole('button', { name: 'Undo' }));
    await expectCard(page, w);
  });

  test('mark as known straight from the panel; undo brings the card back; the edit sheet has no such button (C13)', async ({ page }) => {
    const w = await cardWord(page);
    await swipeUp(page);
    await tap(page.getByRole('button', { name: 'Edit card' }));
    await expect(page.getByRole('button', { name: 'Mark as known' })).toHaveCount(0);
    await expect(page.getByText(/makes no sense/)).toHaveCount(0);
    await tap(page.getByRole('button', { name: 'Cancel', exact: true }));
    await swipeUp(page);
    await tap(page.getByTestId('panel-known'));
    await expect(page.getByTestId('toast')).toContainText(`“${w}” marked as known · won’t be repeated`);
    expect(await cardWord(page)).not.toBe(w);
    await tap(page.getByTestId('toast').getByRole('button', { name: 'Undo' }));
    await expectCard(page, w);
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
    await endSession(page);
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
    await endSession(page);
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
    const grab = page.getByTestId('grab');
    await expect(grab.or(page.getByTestId('statistics'))).toBeVisible();
    if (await grab.isVisible()) await endSession(page);
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
