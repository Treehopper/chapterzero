import { expect, test } from '@playwright/test';
import { firstRun, importAndOpen, tap } from './helpers';

test.describe('words (Epic D)', () => {
  test.beforeEach(async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await expect(page.getByRole('heading', { name: 'Words' })).toBeVisible();
  });

  test('not in the lists: sorted by frequency, names hidden, ignore with undo (D1)', async ({ page }) => {
    const rows = page.getByTestId('word-row');
    await expect(rows.first()).toBeVisible();
    const counts = (await rows.allInnerTexts()).map((t) => Number(t.match(/×(\d+)/)?.[1] ?? 0));
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    await expect(page.getByTestId('word-list')).not.toContainText('name');
    const first = (await rows.first().innerText()).split(/\s/)[0];
    // add sheet from a row; ignore hides it, undo brings it back
    await tap(rows.first());
    await expect(page.getByTestId('add-sheet')).toBeVisible();
    await expect(page.getByTestId('suggest-status')).toContainText('not in the lists');
    await tap(page.getByRole('button', { name: 'Ignore' }));
    await expect(page.getByTestId('toast')).toContainText(`“${first}” hidden`);
    await expect(rows.first()).not.toContainText(new RegExp(`^${first}\\b`));
    await tap(page.getByTestId('toast').getByRole('button', { name: 'Undo' }));
    await expect(rows.first()).toContainText(first);
  });

  test('add any word by hand; typed forms are matched (D8, D9)', async ({ page }) => {
    await tap(page.getByTestId('add-word'));
    await page.getByLabel('Word', { exact: true }).fill('strode');
    await expect(page.getByTestId('suggest-status')).toContainText('→ stride');
    await expect(page.getByTestId('suggest-status')).toContainText('in the lists, level 4');
    await expect(page.getByTestId('suggest-status')).toContainText('skipped as below your level · appears 5× in this book');
    await expect(page.getByLabel('Translation')).toHaveValue(/schreiten/);
    await expect(page.getByRole('link', { name: 'Wiktionary ↗' })).toHaveAttribute('href', /wiki\/stride/);
    await tap(page.getByTestId('add-card'));
    await expect(page.getByTestId('toast')).toContainText('“stride” added');
    await expect(page.getByRole('tab', { name: /Active/ })).toHaveText(/^Active \d/);  // label and count apart
    await tap(page.getByRole('tab', { name: /Active/ }));
    await page.getByLabel('Search words').fill('stri');
    await expect(page.getByTestId('word-row')).toHaveCount(1);
    await expect(page.getByTestId('word-row')).toContainText('stride');
  });

  test('a word that is not in the book needs a translation (D8)', async ({ page }) => {
    await tap(page.getByTestId('add-word'));
    await page.getByLabel('Word', { exact: true }).fill('zyzzyva');
    await expect(page.getByTestId('suggest-status')).toContainText('not in this book');
    await tap(page.getByTestId('add-card'));
    await expect(page.getByRole('alert')).toContainText('Add a translation');
    await page.getByLabel('Translation').fill('Rüsselkäfer');
    await tap(page.getByTestId('add-card'));
    await expect(page.getByTestId('toast')).toContainText('added');
  });

  test('remove an active card and restore it from Removed (D3, D4)', async ({ page }) => {
    await tap(page.getByRole('tab', { name: /Active/ }));
    const row = page.getByTestId('word-row').first();
    const word = (await row.getAttribute('data-word'))!;
    await tap(row);
    await tap(page.getByRole('button', { name: 'Remove card' }));
    await tap(page.getByRole('tab', { name: /Removed/ }));
    await expect(page.getByTestId('word-row')).toContainText(word);
    await tap(page.getByTestId('word-row').first());
    await tap(page.getByRole('button', { name: 'Restore card' }));
    await expect(page.getByTestId('word-list')).toContainText('Nothing here.');
  });

  test('verbs show with "to"', async ({ page }) => {
    await tap(page.getByRole('tab', { name: /Active/ }));
    await page.getByRole('searchbox').fill('ponder');
    await expect(page.locator('[data-word="ponder"]')).toContainText(/^to ponder/);
    await tap(page.locator('[data-word="ponder"]'));
    await expect(page.getByRole('heading', { name: 'to ponder' })).toBeVisible();
  });

  test('skipped words can be added as cards', async ({ page }) => {
    await tap(page.getByRole('tab', { name: /Skipped/ }));
    const row = page.getByTestId('word-row').first();
    await expect(row).toBeVisible();
    const word = (await row.innerText()).split(/\s/)[0];
    await tap(row);
    await expect(page.getByTestId('suggest-status')).toContainText(/skipped as (below your level|nearly the same)/);
    await tap(page.getByTestId('add-card'));
    await tap(page.getByRole('tab', { name: /Active/ }));
    await page.getByLabel('Search words').fill(word);
    await expect(page.getByTestId('word-row').first()).toContainText(word);
  });
});
