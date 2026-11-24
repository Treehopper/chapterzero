import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { endSession, firstRun, importAndOpen, startStudy, swipeLeft, swipeRight, tap, tapCard } from './helpers';

test('lookup links: reorder, toggle, custom https only (C17)', async ({ page }) => {
  await firstRun(page);
  await tap(page.getByRole('button', { name: 'Settings' }));
  await page.getByLabel('Custom link name').fill('Duden');
  await page.getByLabel('Custom link URL').fill('http://www.duden.de/suchen/{word}');
  await tap(page.getByRole('button', { name: 'Add link' }));
  await expect(page.getByText('https URL containing {word}')).toBeVisible();
  await page.getByLabel('Custom link URL').fill('https://www.duden.de/suchen/dudenonline/{word}');
  await tap(page.getByRole('button', { name: 'Add link' }));
  await expect(page.getByLabel('Show Duden')).toBeChecked();
  await tap(page.getByRole('button', { name: 'Move Duden up' }));
  await page.getByLabel('Show LEO').tap();
  await page.reload();
  await expect(page.getByLabel('Show LEO')).not.toBeChecked();
  const names = await page.getByRole('checkbox', { name: /^Show / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(names.slice(-2)).toEqual(['Show Duden', 'Show Cambridge']);
});

test('backup: export, delete the book, import restores it (F1, F2)', async ({ page }) => {
  await firstRun(page);
  await importAndOpen(page);
  await tap(page.getByRole('button', { name: 'Back to library' }));
  await tap(page.getByRole('button', { name: 'Settings' }));
  const [dl] = await Promise.all([page.waitForEvent('download'), tap(page.getByTestId('export'))]);
  const path = await dl.path();
  const data = JSON.parse(readFileSync(path, 'utf8'));
  expect(data.format).toBe('chapterzero-backup');
  expect(data.books).toHaveLength(1);
  await tap(page.getByRole('button', { name: 'Back', exact: true }));
  await tap(page.getByRole('button', { name: /Open The Lantern Omnibus/ }));
  page.on('dialog', (d) => d.accept());
  await tap(page.getByRole('button', { name: 'Book options' }));
  await tap(page.getByRole('button', { name: 'Delete book' }));
  await expect(page.getByRole('heading', { name: 'Import your first book' })).toBeVisible();
  await tap(page.getByRole('button', { name: 'Settings' }));
  await page.locator('input[type=file][accept*="json"]').setInputFiles(path);
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
  await expect(page.getByTestId('book-tile')).toContainText('The Lantern Omnibus');
});

test('word list info shows versions, sources and licences (A3)', async ({ page }) => {
  await firstRun(page);
  await tap(page.getByRole('button', { name: 'Settings' }));
  await expect(page.getByText('words-en-de · test')).toBeVisible();
  await expect(page.getByText(/GPL/).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'FreeDict eng-deu' })).toBeVisible();
});

test('achievements screen lists locked tiers with progress (G5)', async ({ page }) => {
  await firstRun(page);
  await tap(page.getByRole('button', { name: 'Achievements' }));
  await expect(page.getByTestId('achievement')).toHaveCount(4);
  await expect(page.getByTestId('achievement').first()).toContainText('0 / 5');
});

test('settings: undo button after swiping off, box level on (C6)', async ({ page }) => {
  await firstRun(page);
  await tap(page.getByRole('button', { name: 'Settings' }));
  await page.getByTestId('set-undo').tap();
  await page.getByTestId('set-boxlevel').tap();
  await tap(page.getByRole('button', { name: 'Back', exact: true }));
  await importAndOpen(page);
  await startStudy(page);
  await tapCard(page);
  await expect(page.getByTestId('box-dots')).toHaveCount(0);           // a new card has no filled dot yet
  await swipeRight(page);
  await expect(page.getByTestId('card-word')).toBeVisible();
  await expect(page.getByTestId('undo')).toHaveCount(0);
});

test('statistics put the streak first; achievements and streaks can be turned off (G)', async ({ page }) => {
  await firstRun(page);
  await importAndOpen(page);
  await startStudy(page);
  await tapCard(page);
  await swipeLeft(page);                                                  // a real review (a retired card is no review)
  await endSession(page);
  const streak = page.getByTestId('stat-streak');
  await expect(streak).toContainText('1-day streak');
  const [a, b] = await Promise.all([streak.boundingBox(), page.getByTestId('stat-reviewed').boundingBox()]);
  expect(a!.y).toBeLessThan(b!.y);                                        // no scrolling to find it
  await tap(page.getByTestId('done'));
  await tap(page.getByRole('button', { name: 'Back to library' }));
  await expect(page.getByRole('button', { name: 'Achievements' })).toBeVisible();
  await tap(page.getByRole('button', { name: 'Settings' }));
  await page.getByRole('checkbox', { name: /Achievements and streaks/ }).tap();
  await tap(page.getByRole('button', { name: 'Back', exact: true }));
  await expect(page.getByRole('button', { name: 'Achievements' })).toHaveCount(0);
  await tap(page.getByRole('button', { name: /Open The Lantern Omnibus/ }));
  await expect(page.getByText('day streak')).toHaveCount(0);
  await expect(page.getByText('Reviews today')).toBeVisible();
});
