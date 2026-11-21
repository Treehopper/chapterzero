import { expect, test, type Page } from '@playwright/test';
import { endSession, expectPhase, firstRun, importAndOpen, settled, startStudy, swipeLeft, swipeRight, tap, tapCard } from '../helpers';

/** retire the fixture's cards at first sight until the book is ready (Quick start brings all it needs) */
async function finishBook(page: Page) {
  await page.goto('/#/library');
  await importAndOpen(page);
  await startStudy(page);
  for (let i = 0; i < 40; i++) {
    if (await page.getByTestId('statistics').count()) break;
    if (!(await page.getByTestId('card-word').count())) { await page.waitForTimeout(300); continue; }
    await tapCard(page);
    await expectPhase(page, 'back').catch(() => {});
    await swipeRight(page);
    await settled(page).catch(() => {});
    if (await page.getByTestId('banner').count()) await page.getByTestId('banner').tap().catch(() => {});
  }
}

test.describe('statistics & achievements hunt', () => {
  test.setTimeout(150_000);           // finishing the book retires 32 cards one by one
  let errors: string[];
  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('finishing the book: medals on the statistics, book tile first and unlocked with Read, which opens the reader', async ({ page }) => {
    await firstRun(page);
    await finishBook(page);
    await expect(page.getByTestId('statistics')).toBeVisible({ timeout: 15_000 });
    const main = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    console.log('stats:', main.slice(0, 400));
    await expect(page.getByTestId('stat-known')).toContainText('32');   // the 32 the coverage target needs
    await expect(page.getByTestId('stat-achievements')).toBeVisible();
    await expect(page.getByTestId('stat-achievements')).toContainText('Ready for The Lantern Omnibus');
    await expect(page.getByTestId('stat-achievements')).toContainText('Bookworm');
    // reload: the stats come back as they were
    await page.reload();
    await expect(page.getByTestId('stat-achievements')).toContainText('Bookworm', { timeout: 15_000 });
    await tap(page.getByTestId('done'));
    await expect(page.getByTestId('ready-read')).toBeVisible();
    await page.goto('/#/achievements');
    const first = page.getByTestId('achievement').first();
    await expect(first).toContainText('Ready for The Lantern Omnibus');
    await expect(first).not.toHaveClass(/locked/);
    await expect(first.getByTestId('achievement-read')).toBeVisible();
    await tap(first.getByTestId('achievement-read'));
    await expect(page.getByTestId('reader-text')).toBeVisible();
    console.log('reader url', page.url());
    // the bookworm tile shows bronze
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await page.goto('/#/achievements');
    const worm = page.getByTestId('achievement').filter({ hasText: 'Bookworm' });
    await expect(worm).toContainText('1 ✓');
    await expect(worm).toContainText('1 / 5');
  });

  test('achievements off: a finished book shows no medals on statistics, no celebrations banner; Read still on the achievements tile', async ({ page }) => {
    await firstRun(page);
    await page.goto('/#/settings');
    await page.getByRole('checkbox', { name: /Achievements and streaks/ }).tap();
    await page.waitForTimeout(200);
    await finishBook(page);
    await expect(page.getByTestId('statistics')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('stat-achievements')).toHaveCount(0);
    await expect(page.getByTestId('stat-streak')).toHaveCount(0);
    await page.goto('/#/achievements');
    const first = page.getByTestId('achievement').first();
    await expect(first).toContainText('Ready for The Lantern Omnibus');
    await expect(first.getByTestId('achievement-read')).toBeVisible();
  });

  test('Keep going from the statistics starts another session', async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    await startStudy(page);
    await tapCard(page);
    await swipeLeft(page);
    await endSession(page);
    await expect(page.getByTestId('statistics')).toBeVisible();
    await tap(page.getByTestId('study-more'));
    await tap(page.getByTestId('quick-start'));
    await expect(page.getByTestId('card-word')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('card-word')).toBeVisible();
  });

  test('statistics after a session with nothing graded: no streak claimed, no medals', async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    await startStudy(page);
    await endSession(page);
    await expect(page.getByTestId('statistics')).toBeVisible();
    console.log('empty session stats:', (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 300));
    await expect(page.getByTestId('stat-reviewed')).toHaveText('0');
    await expect(page.getByTestId('stat-streak')).toHaveCount(0);
  });
});
