import { expect, test } from '@playwright/test';
import { firstRun, importBook, tap } from './helpers';

test.describe('import (B1–B15, B7)', () => {
  test.beforeEach(async ({ page }) => { await firstRun(page); });

  test('preview: works, default exclusions, live counts, create', async ({ page }) => {
    await importBook(page);
    await expect(page.getByTestId('preview-title')).toHaveText('The Lantern Omnibus');
    const list = page.getByTestId('chapter-list');
    await expect(list.getByLabel('Include The Moor')).toBeChecked();
    await expect(list.getByRole('checkbox', { name: /Cover/ })).not.toBeChecked();
    await expect(list.getByRole('checkbox', { name: /Contents/ })).not.toBeChecked();
    await expect(list.getByRole('checkbox', { name: /About the Author/ })).not.toBeChecked();
    // footnotes are folded into their chapters, not listed
    await expect(list).not.toContainText('Footnotes');
    const before = Number((await page.getByTestId('preview-cards').innerText()).match(/([\d,]+) cards/)![1].replace(',', ''));
    expect(before).toBeGreaterThan(10);

    // counts add up
    const counts = page.getByTestId('preview-counts');
    const num = async (label: string) => Number((await counts.getByText(label).locator('..').innerText()).replace(/\D+/g, ' ').trim().split(' ').pop());
    const parts = await Promise.all(['Cards', 'Common words', 'Below your level', 'Already known', 'Nearly the same in German', 'Names skipped', 'Not in the lists'].map(num));
    expect(parts.reduce((a, b) => a + b, 0)).toBe(await num('Distinct words'));

    // expanding a work shows its chapters; unticking a work lowers the card count
    await tap(list.getByRole('button', { name: /The Harbour/ }));
    await expect(list.getByText('One').last()).toBeVisible();
    await list.getByLabel('Include The Harbour').tap();
    await expect(page.getByTestId('preview-cards')).not.toContainText(`${before} cards`);
    const after = Number((await page.getByTestId('preview-cards').innerText()).match(/([\d,]+) cards/)![1].replace(',', ''));
    expect(after).toBeLessThan(before);
    await tap(page.getByTestId('create-cards'));
    await expect(page.getByTestId('book-coverage')).toBeVisible();
    await expect(page.getByTestId('chapter-row').filter({ hasText: 'Not included' })).toHaveCount(5);
    await expect(page.getByTestId('chapter-row').filter({ hasText: 'Learning' })).toHaveCount(1);
  });

  test('cancelling the preview discards the draft; library tile after import', async ({ page }) => {
    await importBook(page);
    await tap(page.getByRole('button', { name: 'Cancel import' }));
    await expect(page.getByRole('heading', { name: 'Import your first book' })).toBeVisible();
    await importBook(page);
    await tap(page.getByTestId('create-cards'));
    await tap(page.getByRole('button', { name: 'Back to library' }));
    const tile = page.getByTestId('book-tile');
    await expect(tile).toContainText('The Lantern Omnibus');
    await expect(tile).toContainText('The Moor · One');
    await expect(tile).toContainText('Level 5');
  });

  test('a file that is not an EPUB shows an error', async ({ page }) => {
    await page.getByTestId('file-input').setInputFiles({ name: 'notes.epub', mimeType: 'application/epub+zip', buffer: Buffer.from('hello') });
    await expect(page.getByRole('alert')).toContainText('not a valid EPUB');
  });

  test('re-filtering a book at another level changes its cards (B3)', async ({ page }) => {
    await importBook(page);
    await tap(page.getByTestId('create-cards'));
    const cards = async () => Number((await page.getByText(/rare words\./).innerText()).match(/of this book's ([\d,]+) rare/)![1]);
    const before = await cards();
    await tap(page.getByRole('button', { name: 'Book options' }));
    await tap(page.getByRole('button', { name: 'Change level for this book…' }));
    await page.getByLabel('Cutoff rank').fill('15000');
    await tap(page.getByRole('button', { name: 'Re-filter' }));
    await expect(page.getByTestId('toast')).toContainText('level 6'); // 15,000 is the top of level 6
    expect(await cards()).toBeLessThan(before);
  });
});
