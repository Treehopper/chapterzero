import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FIXTURE_EPUB, firstRun, importBook, tap } from './helpers';

test.describe('import (B1–B15, B7)', () => {
  test.beforeEach(async ({ page }) => { await firstRun(page); });

  test('a long file name without spaces is cut with an ellipsis, not wider than the screen', async ({ page }) => {
    // hold the analysis for a moment so the progress dialog can be measured
    await page.evaluate(() => {
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (this: Worker, msg: { path?: string[] }, ...rest: never[]) {
        if (msg?.path?.join('.') === 'books.analyse') setTimeout(() => post.call(this, msg, ...rest), 1500);
        else post.call(this, msg, ...rest);
      } as typeof post;
    });
    const name = 'Herman_Melville-Moby_Dick_or_The_Whale-Complete_Unabridged_Edition_with_Illustrations_2024.epub';
    await page.getByTestId('file-input').setInputFiles({ name, mimeType: 'application/epub+zip', buffer: readFileSync(FIXTURE_EPUB) });
    const label = page.getByTestId('analysing-name');
    await expect(label).toHaveText(name);
    const vw = page.viewportSize()!.width;
    const box = (await page.getByTestId('analysing').locator('.card-box').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
    expect(await label.evaluate((e) => e.scrollWidth > e.clientWidth && getComputedStyle(e).textOverflow === 'ellipsis')).toBe(true);
    await expect(page.getByTestId('preview-title')).toBeVisible();
  });

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
    const learning = page.getByTestId('chapter-row').filter({ hasText: 'Learning' });
    await expect(learning).toContainText(/\d+\.\d % known/);            // coverage in the line, bar + number = way to the target
    await expect(learning.getByTestId('chapter-to-target')).toHaveText(/^\d+ % to target$/);
    await expect(page.getByTestId('bars-note')).toContainText('full = ready to read');
    // E7: time to ready, for the book and the learning chapter
    await expect(page.getByTestId('book-eta')).toContainText(/≈ \d+ (min|h).* of practice until ready to read/);
    await expect(learning.getByTestId('chapter-eta')).toHaveText(/^≈ \d+/);
    // the button names the learning chapter and its time, not the whole book's
    const eta = await learning.getByTestId('chapter-eta').innerText();
    await expect(page.getByTestId('study-now-eta')).toHaveText(`One · ${eta}`);
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
    await expect.poll(cards).toBeLessThan(before);   // the count updates after the toast
  });
});
