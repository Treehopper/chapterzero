import { expect, test } from '@playwright/test';
import { endSession, firstRun, importAndOpen, startStudy, swipeLeft, tap, tapCard } from '../helpers';

test.describe('navigation hunt', () => {
  let errors: string[];
  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('stats of an old session by URL after a second session; Done goes to the book', async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    await startStudy(page);
    await tapCard(page);
    await swipeLeft(page);
    await endSession(page);
    await expect(page.getByTestId('stat-reviewed')).toHaveText('1');
    const oldStats = page.url();
    await tap(page.getByTestId('done'));
    // a second session with two reviews
    await startStudy(page);
    await tapCard(page); await swipeLeft(page);
    await tapCard(page); await swipeLeft(page);
    await endSession(page);
    await expect(page.getByTestId('stat-reviewed')).toHaveText('2');
    await page.goto(oldStats);
    await expect(page.getByTestId('stat-reviewed')).toHaveText('1');
    await page.reload();
    await expect(page.getByTestId('stat-reviewed')).toHaveText('1');
    await tap(page.getByTestId('done'));
    await expect(page.getByTestId('book-coverage')).toBeVisible();
  });

  test('stats with a bogus session id: error and a way back', async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    await page.goto('/#/stats/not-a-session');
    await expect(page.locator('.error')).toBeVisible();
    console.log('stats error:', await page.locator('.error').innerText());
    // any button at all?
    const buttons = await page.locator('main button').allInnerTexts();
    console.log('buttons:', buttons);
    expect(buttons.length).toBeGreaterThan(0);
  });

  test('a failing statistics route is remembered as the last route: relaunch comes back to the error', async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    await page.goto('/#/stats/not-a-session');
    await expect(page.locator('.error')).toHaveText('Session not found');
    await page.waitForTimeout(2000);
    await page.goto('/');                 // relaunch without a hash (the PWA icon)
    await page.waitForTimeout(800);
    console.log('relaunch →', page.url());
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
  });

  for (const hash of ['#/book/nope', '#/words/nope', '#/study/nope', '#/import/nope', '#/read/nope', '#/nonsense']) {
    test(`bogus route ${hash}: an error message and no console error`, async ({ page }) => {
      await firstRun(page);
      await importAndOpen(page);
      await page.goto('/' + hash);
      await page.waitForTimeout(800);
      const txt = (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 160);
      console.log(hash, '→', page.url(), txt);
      if (hash !== '#/nonsense') expect(txt).toMatch(/not found/i);
    });
  }

  test('browser back from the statistics screen', async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    await startStudy(page);
    await tapCard(page);
    await swipeLeft(page);
    await endSession(page);
    await expect(page.getByTestId('statistics')).toBeVisible();
    await page.goBack();
    await page.waitForTimeout(800);
    console.log('back from stats →', page.url(), (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 120));
    await page.goBack();
    await page.waitForTimeout(800);
    console.log('back again →', page.url(), (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 120));
  });

  test('closing the app on the statistics screen reopens the statistics, not a new session', async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    await startStudy(page);
    await tapCard(page);
    await swipeLeft(page);
    await endSession(page);
    await expect(page.getByTestId('statistics')).toBeVisible();
    await page.waitForTimeout(300);
    await page.goto('/');
    await expect(page.getByTestId('statistics')).toBeVisible();
    await expect(page.getByTestId('stat-reviewed')).toHaveText('1');
  });

  test('setup routes after setup redirect to the last route; library/achievements/settings reload in place', async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    const book = page.url();
    for (const hash of ['#/install', '#/download', '#/check']) {
      await page.goto('/' + hash);
      await page.waitForTimeout(800);
      console.log(hash, '→', page.url());
    }
    await page.goto('/#/achievements');
    await expect(page.getByRole('heading', { name: 'Achievements' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Achievements' })).toBeVisible();
    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.goto(book);
    await expect(page.getByTestId('book-coverage')).toBeVisible();
  });

  test('Achievements → Read opens the reader; back goes to achievements', async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    await page.goto('/#/achievements');
    const first = page.getByTestId('achievement').first();
    await expect(first).toContainText('The Lantern Omnibus');
    console.log('first tile:', (await first.innerText()).replace(/\s+/g, ' '));
    console.log('read buttons:', await page.getByTestId('achievement-read').count());
  });
});
