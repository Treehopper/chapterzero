import { expect, test } from '@playwright/test';
import { firstRun, swipeLeft, swipeRight, tap, tapCard } from './helpers';

test.describe('first run (A1, A2, H1–H3)', () => {
  test('install guide → download with progress → vocabulary check → level → library @android', async ({ page }) => {
    await page.goto('/?packs=test');
    await expect(page.getByRole('heading', { name: 'Install VocabFirst first' })).toBeVisible();
    await expect(page.getByText('Add to Home Screen')).toBeVisible();
    const packRequests: string[] = [];
    page.on('request', (r) => { if (r.url().includes('.json.gz')) packRequests.push(r.url()); });
    await tap(page.getByRole('button', { name: 'Continue in the browser' }));
    // the download waits for a tap (no accidental mobile-data use)
    await expect(page.getByTestId('wifi-hint')).toContainText('Wi-Fi');
    await expect(page.getByTestId('download-start')).toHaveText(/^Download \d+(\.\d)? [KM]B$/);
    await page.waitForTimeout(500);
    expect(packRequests).toEqual([]);
    await tap(page.getByTestId('download-start'));
    await expect(page.getByTestId('check-counter')).toHaveText('1 / 60');
    await expect(page.getByTestId('check-why')).toContainText('skip the words you already know');

    // the first swipe before the flip asks once; "No" keeps flipping first, and is not asked again
    const first = await page.getByTestId('check-word').innerText();
    await swipeRight(page);
    await expect(page.getByTestId('front-swipe-confirm')).toContainText('Settings › Vocabulary check: flip before answering');
    await tap(page.getByRole('button', { name: "No, I'll flip first" }));
    await expect(page.getByTestId('front-swipe-confirm')).toHaveCount(0);
    await swipeRight(page);
    await expect(page.getByTestId('front-swipe-confirm')).toHaveCount(0);
    await expect(page.getByTestId('check-counter')).toHaveText('1 / 60');
    await expect(page.getByTestId('check-word')).toHaveText(first);

    // the check is where the gestures are learnt: hints stay until each gesture was used once
    const hints = page.getByTestId('hints');
    await expect(hints).toContainText('tap to flip');
    await tapCard(page);
    await expect(hints).not.toContainText('tap to flip');
    await expect(page.getByTestId('hint-right')).toBeVisible();
    await expect(page.getByTestId('hint-left')).toBeVisible();
    await swipeRight(page);
    await expect(page.getByTestId('check-counter')).toHaveText('2 / 60');
    await tapCard(page);
    await expect(page.getByTestId('hint-right')).toHaveCount(0);
    await expect(page.getByTestId('hint-left')).toBeVisible();
    await swipeLeft(page);
    await expect(page.getByTestId('check-counter')).toHaveText('3 / 60');
    await expect(hints).toHaveCount(0);

    // answer up to 30 words, then leave and come back: it resumes at the same word
    for (let i = 2; i < 30; i++) {
      await tapCard(page);
      if (i % 3 === 2) await swipeLeft(page); else await swipeRight(page);
      await expect(page.getByTestId('check-counter')).toHaveText(`${i + 2} / 60`);
    }
    const word = await page.getByTestId('check-word').innerText();
    await page.reload();
    await expect(page.getByTestId('check-counter')).toHaveText('31 / 60');
    await expect(page.getByTestId('check-word')).toHaveText(word);
    for (let i = 30; i < 60; i++) {
      await tapCard(page);
      if (i % 3 === 2) await swipeLeft(page); else await swipeRight(page);
      if (i < 59) await expect(page.getByTestId('check-counter')).toHaveText(`${i + 2} / 60`);
    }
    await expect(page.getByTestId('check-result')).toBeVisible();
    const level = Number(await page.getByTestId('start-level').innerText());
    expect(level).toBeGreaterThanOrEqual(1);
    expect(level).toBeLessThanOrEqual(10);
    await tap(page.getByRole('button', { name: 'Use this' }));
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    await expect(page.getByTestId('level-hint')).toHaveCount(0);

    // relaunch goes straight to the library
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
  });

  test('keyboard can run the check; adjusting the cutoff is saved as manual', async ({ page }) => {
    await page.goto('/?packs=test');
    await tap(page.getByRole('button', { name: 'Continue in the browser' }));
    await tap(page.getByTestId('download-start'));
    await expect(page.getByTestId('check-counter')).toHaveText('1 / 60');
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Space');
      await page.keyboard.press(i < 30 ? 'ArrowRight' : 'ArrowLeft');
      if (i < 59) await expect(page.getByTestId('check-counter')).toHaveText(`${i + 2} / 60`);
    }
    await expect(page.getByTestId('check-result')).toBeVisible();
    await tap(page.getByRole('button', { name: 'Adjust' }));
    await page.getByLabel('Cutoff rank').fill('20000');
    await expect(page.getByTestId('cutoff')).toHaveText('20,000');
    await expect(page.getByTestId('start-level')).toHaveText('7');
    await tap(page.getByRole('button', { name: 'Use this' }));
    await tap(page.getByRole('button', { name: 'Settings' }));
    await expect(page.getByText('Level 7 · cutoff rank 20,000')).toBeVisible();
    await expect(page.getByText('manual')).toBeVisible();
  });

  test('a specialist word can be swapped out uncounted; the back explains and links the word', async ({ page }) => {
    await firstRun(page, { check: 'none' });
    await expect(page.getByTestId('check-counter')).toHaveText('1 / 60');
    const word = await page.getByTestId('check-word').innerText();
    await expect(page.getByTestId('check-replace')).toHaveCount(0);
    await tapCard(page);
    await expect(page.getByRole('link', { name: /Wiktionary/ })).toHaveAttribute('href', /wiktionary\.org/);
    await tap(page.getByTestId('check-replace'));
    await expect(page.getByTestId('check-word')).not.toHaveText(word);
    await expect(page.getByTestId('check-counter')).toHaveText('1 / 60');
    await tapCard(page);
    await swipeRight(page);
    await expect(page.getByTestId('check-counter')).toHaveText('2 / 60');
  });

  test('on a short screen, long card text does not squeeze the dictionary links', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 440 });
    await firstRun(page, { check: 'none' });
    await expect(page.getByTestId('check-word')).toBeVisible();
    await tapCard(page);
    await expect(page.getByTestId('check-replace')).toBeVisible();
    await page.evaluate(() => {
      const de = document.querySelector('.back .de')!;
      de.textContent = 'Glücksspiel um hohe Einsätze, Hasardspiel, Zockerei';
      de.classList.add('long');
      const def = document.querySelector('.back .def') ?? de.insertAdjacentElement('afterend', Object.assign(document.createElement('p'), { className: 'def small muted' }))!;
      def.textContent = 'A stake or wager placed by a gambler on the outcome of an uncertain event, especially in games of chance played for money.';
    });
    const link = page.getByRole('link', { name: /Wiktionary/ });
    const [a, row, face] = await Promise.all([link.boundingBox(), link.locator('..').boundingBox(), page.locator('.back').boundingBox()]);
    expect(row!.height).toBeGreaterThanOrEqual(a!.height - 0.5);
    expect(a!.height).toBeGreaterThanOrEqual(43.5); // 44 px, give or take the flip transform
    expect(a!.y + a!.height).toBeLessThanOrEqual(face!.y + face!.height);
  });

  test('grading from the front after the one-time confirmation; the setting follows', async ({ page }) => {
    await firstRun(page, { check: 'none' });
    await expect(page.getByTestId('check-counter')).toHaveText('1 / 60');
    await swipeLeft(page);
    await expect(page.getByTestId('front-swipe-confirm')).toBeVisible();
    await tap(page.getByRole('button', { name: "Yes, count it as “didn't know”" }));
    await expect(page.getByTestId('check-counter')).toHaveText('2 / 60');
    await swipeRight(page); // no question any more, no flip needed
    await expect(page.getByTestId('check-counter')).toHaveText('3 / 60');
    await expect(page.getByTestId('front-swipe-confirm')).toHaveCount(0);
    await tap(page.getByRole('button', { name: 'Skip' }));
    await tap(page.getByRole('button', { name: 'Settings' }));
    await expect(page.getByRole('checkbox', { name: 'Vocabulary check: flip before answering' })).not.toBeChecked();
  });

  test('in the check, a word flipped and turned back is graded by a swipe without asking', async ({ page }) => {
    await firstRun(page, { check: 'none' });
    await expect(page.getByTestId('check-counter')).toHaveText('1 / 60');
    await tapCard(page);
    await expect(page.getByTestId('check-replace')).toBeVisible();
    await tapCard(page);
    await expect(page.getByTestId('check-replace')).toHaveCount(0);
    await swipeRight(page);
    await expect(page.getByTestId('front-swipe-confirm')).toHaveCount(0);
    await expect(page.getByTestId('check-counter')).toHaveText('2 / 60');
    // the next word starts unseen again: a front swipe asks
    await swipeRight(page);
    await expect(page.getByTestId('front-swipe-confirm')).toBeVisible();
  });

  test('skipping the check sets level 5 and shows a dismissible hint', async ({ page }) => {
    await firstRun(page);
    await expect(page.getByTestId('level-hint')).toBeVisible();
    await tap(page.getByTestId('level-hint').getByRole('button', { name: 'Dismiss' }));
    await expect(page.getByTestId('level-hint')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    await expect(page.getByTestId('level-hint')).toHaveCount(0);
  });

  test('a failed download can be retried and resumes', async ({ page }) => {
    let fail = true;
    await page.route('**/test-packs/forms-en.000.json.gz', (route) => (fail ? route.fulfill({ status: 500, body: 'x' }) : route.continue()));
    await page.goto('/?packs=test');
    await tap(page.getByRole('button', { name: 'Continue in the browser' }));
    await tap(page.getByTestId('download-start'));
    await expect(page.getByRole('alert')).toContainText('Download failed');
    fail = false;
    await tap(page.getByRole('button', { name: 'Try again' }));
    await expect(page.getByTestId('check-word')).toBeVisible();
  });
});
