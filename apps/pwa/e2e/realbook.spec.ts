/** Real word packs + real books (README §13 "To verify while building"). Needs the built packs
 *  and fixtures/epub/downloaded (see fixtures/README.md). */
import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { realEpub, tap } from './helpers';

const books = [
  { file: 'pg2701.epub', title: 'Moby Dick' },
  { file: 'se-sherlock-holmes-adventures.epub', title: 'The Adventures of Sherlock Holmes' },
  { file: 'se-gullivers-travels.epub', title: 'Gulliver’s Travels' },
].filter((b) => existsSync(realEpub(b.file)));

test.describe('real packs and books', () => {
  test.skip(books.length === 0, 'no downloaded EPUBs');
  test.setTimeout(240_000);

  test('install real packs, import real books, study @real', async ({ page }) => {
    const t0 = Date.now();
    await page.goto('/?packs=real');
    await tap(page.getByRole('button', { name: 'Continue in the browser' }));
    await tap(page.getByTestId('download-start'));
    await expect(page.getByTestId('check-word')).toBeVisible({ timeout: 120_000 });
    const tInstall = Date.now() - t0;
    await tap(page.getByRole('button', { name: 'Skip' }));
    const report: string[] = [`packs installed in ${(tInstall / 1000).toFixed(1)} s`];
    for (const b of books) {
      const t1 = Date.now();
      await page.getByTestId('file-input').setInputFiles(realEpub(b.file));
      await expect(page.getByTestId('preview-title')).toContainText(b.title.split(' ')[0], { timeout: 120_000 });
      const tAnalyse = Date.now() - t1;
      const counts = await page.getByTestId('preview-counts').innerText();
      const n = (label: string) => Number(counts.match(new RegExp(`${label}\\s+([\\d,]+)`))![1].replace(/,/g, ''));
      const parts = ['Cards', 'Common words', 'Below your level', 'Already known', 'Nearly the same in German', 'Names skipped', 'Not in the lists'].map(n);
      expect(parts.reduce((a, c) => a + c, 0)).toBe(n('Distinct words'));
      expect(n('Cards')).toBeGreaterThan(200);
      report.push(`${b.file}: analysed in ${(tAnalyse / 1000).toFixed(1)} s; ${counts.replace(/\n/g, ' ')}`);
      await tap(page.getByTestId('create-cards'));
      await expect(page.getByTestId('book-coverage')).toBeVisible({ timeout: 60_000 });
      report.push(`  chapters: ${await page.getByTestId('chapter-row').count()}, ${await page.getByTestId('book-coverage').innerText()}`);
      await tap(page.getByTestId('study-now'));
      await expect(page.getByTestId('card-word')).toBeVisible();
      report.push(`  first card: ${await page.getByTestId('study-stage').getAttribute('data-word')}`);
      await page.goto('/#/library');
      await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    }
    console.log('REPORT\n' + report.join('\n'));
  });
});
