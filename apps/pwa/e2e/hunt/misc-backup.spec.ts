import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { endSession, firstRun, importAndOpen, startStudy, swipeLeft, tap, tapCard } from '../helpers';

async function exportBackup(page: Page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), tap(page.getByTestId('export'))]);
  return (await dl.path())!;
}
const importBackup = (page: Page, path: string) => page.locator('input[type=file][accept*="json"]').setInputFiles(path);

test.describe('backup hunt', () => {
  let errors: string[];
  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('restoring a backup with achievements on while they are off: trophy follows the restored settings', async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    await page.goto('/#/settings');
    const path = await exportBackup(page);
    expect(JSON.parse(readFileSync(path, 'utf8')).settings.achievementPopups).toBe(true);
    await page.getByRole('checkbox', { name: /Achievements and streaks/ }).tap();
    await tap(page.getByRole('button', { name: 'Back', exact: true }));
    await expect(page.getByRole('button', { name: 'Achievements' })).toHaveCount(0);
    await tap(page.getByRole('button', { name: 'Settings' }));
    await importBackup(page, path);
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    // the backup says achievements are on
    await expect(page.getByRole('button', { name: 'Achievements' })).toBeVisible();
    await page.goto('/#/settings');
    await expect(page.getByRole('checkbox', { name: /Achievements and streaks/ })).toBeChecked();
  });

  test('restore keeps the reader text and position of the restored book; stats, streak, medals consistent', async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    await tap(page.getByTestId('read'));
    await tap(page.getByTestId('next-chapter'));
    await expect(page.locator('header h1')).toHaveText('The Moor · Two');
    await page.waitForTimeout(300);
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await startStudy(page);
    await tapCard(page);
    await swipeLeft(page);
    await endSession(page);
    await expect(page.getByTestId('stat-streak')).toContainText('1-day streak');
    await tap(page.getByTestId('done'));
    await page.goto('/#/settings');
    const path = await exportBackup(page);
    // meanwhile: another session, and the reader moved on
    await tap(page.getByRole('button', { name: 'Back', exact: true }));
    await tap(page.getByRole('button', { name: /Open The Lantern Omnibus/ }));
    await tap(page.getByTestId('read'));
    await tap(page.getByTestId('next-chapter'));
    await expect(page.locator('header h1')).toHaveText('The Harbour · One');
    await page.waitForTimeout(300);
    await page.goto('/#/settings');
    await importBackup(page, path);
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    await tap(page.getByRole('button', { name: /Open The Lantern Omnibus/ }));
    await expect(page.getByTestId('book-coverage')).toBeVisible();
    await expect(page.getByTestId('read')).toBeVisible();
    await expect(page.getByLabel('1 day streak')).toBeVisible();
    await tap(page.getByTestId('read'));
    await expect(page.getByTestId('reader-text')).toBeVisible();
    console.log('reader after restore opens at:', await page.locator('header h1').innerText());
    await expect(page.getByTestId('reader-text').locator('.w.active').first()).toBeVisible();
  });

  test('restore while a study session is open on the book: the session is replaced consistently', async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    await page.goto('/#/settings');
    const path = await exportBackup(page);        // no session in the backup
    await tap(page.getByRole('button', { name: 'Back', exact: true }));
    await tap(page.getByRole('button', { name: /Open The Lantern Omnibus/ }));
    await startStudy(page);
    await tapCard(page);
    await swipeLeft(page);
    const study = page.url();
    await page.goto('/#/settings');
    await importBackup(page, path);
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    // the old session is gone: the book shows no Continue, and the study URL starts afresh without errors
    await tap(page.getByRole('button', { name: /Open The Lantern Omnibus/ }));
    await expect(page.getByTestId('study-now')).not.toContainText('Continue');
    await page.goto(study);
    await page.waitForTimeout(1000);
    console.log('old study url →', (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 160));
    await expect(page.locator('.error')).toHaveCount(0);
  });

  test('restore of a backup taken on the statistics screen, then the old stats URL', async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    await startStudy(page);
    await tapCard(page);
    await swipeLeft(page);
    await endSession(page);
    await expect(page.getByTestId('stat-reviewed')).toHaveText('1');
    await page.waitForTimeout(500);
    const stats = page.url();
    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    const path = await exportBackup(page);
    await importBackup(page, path);
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    await page.goto(stats);
    await page.waitForTimeout(1000);
    console.log('old stats after restore →', page.url(), (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 200));
    await expect(page.getByTestId('stat-reviewed')).toHaveText('1');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Library' }).or(page.getByTestId('statistics')).first()).toBeVisible();
    console.log('relaunch after restore →', page.url());
  });

  test('after a restore the word lists are still installed: a relaunch opens the library, not the download', async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    await page.goto('/#/settings');
    await expect(page.getByText('words-en-de · test')).toBeVisible();
    const path = await exportBackup(page);
    await importBackup(page, path);
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    // the settings screen still lists the word lists
    await tap(page.getByRole('button', { name: 'Settings' }));
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.waitForTimeout(500);
    console.log('word lists after restore:', (await page.locator('main').innerText()).replace(/\s+/g, ' ').match(/Word lists.{0,120}/)?.[0]);
    await expect.soft(page.getByText('words-en-de · test')).toBeVisible({ timeout: 2000 });
    // a relaunch must not ask for the download again
    await page.goto('/');
    await page.waitForTimeout(800);
    console.log('relaunch after restore →', page.url());
    await expect(page.getByTestId('download-start')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();   // back where we were
  });

  test('invalid backup files: a toast, nothing replaced', async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    await page.goto('/#/settings');
    const dir = test.info().outputPath();
    const bad1 = `${dir}/bad1.json`; writeFileSync(bad1, '{not json');
    const bad2 = `${dir}/bad2.json`; writeFileSync(bad2, JSON.stringify({ format: 'something-else', version: 1 }));
    const bad3 = `${dir}/bad3.json`; writeFileSync(bad3, JSON.stringify({ format: 'chapterzero-backup', version: 1 }));   // right header, no data
    for (const f of [bad1, bad2, bad3]) {
      await importBackup(page, f);
      await expect(page.getByTestId('toast')).toBeVisible();
      console.log(f.split('/').pop(), '→', await page.getByTestId('toast').innerText(), page.url());
      await page.waitForTimeout(3200);
    }
    await page.goto('/#/library');
    await expect(page.getByTestId('book-tile')).toContainText('The Lantern Omnibus');
  });
});
