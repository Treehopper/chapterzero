import { expect, test, type Page } from '@playwright/test';
import { expectPhase, firstRun, importBook, settled, swipeRight, tap, tapCard } from '../helpers';

/** import preview: toggles, counts, coverage, odd selections, cancel */

const num = async (page: Page, label: string) => {
  const counts = page.getByTestId('preview-counts');
  return Number((await counts.getByText(label, { exact: true }).locator('..').innerText()).replace(/\D+/g, ' ').trim().split(' ').pop());
};
const LABELS = ['Cards', 'Common words', 'Below your level', 'Already known', 'Nearly the same in German', 'Names skipped', 'Not in the lists'];
async function addsUp(page: Page) {
  const parts = await Promise.all(LABELS.map((l) => num(page, l)));
  expect(parts.reduce((a, b) => a + b, 0)).toBe(await num(page, 'Distinct words'));
}
const coverage = async (page: Page) => (await page.getByText(/estimated coverage now/).innerText()).match(/([\d.]+) %/)![1];
const cards = async (page: Page) => Number((await page.getByTestId('preview-cards').innerText()).match(/([\d,]+) cards/)![1].replace(',', ''));

test.describe('import preview', () => {
  let errors: string[];
  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await firstRun(page);
    await importBook(page);
  });
  test.afterEach(() => { expect(errors).toEqual([]); });

  test('toggling works and chapters: counts add up, coverage follows, nothing ticked disables create', async ({ page }) => {
    const list = page.getByTestId('chapter-list');
    await addsUp(page);
    const cov0 = await coverage(page);
    const cards0 = await cards(page);
    await list.getByLabel('Include The Moor').tap();
    await expect(page.getByTestId('preview-cards')).not.toContainText(`${cards0} cards`);
    await addsUp(page);
    expect(await coverage(page)).not.toBe(cov0);
    // a work with one chapter unticked shows an indeterminate box
    await tap(list.getByRole('button', { name: /The Harbour/ }));
    await list.locator('label.sub').filter({ hasText: 'Two' }).getByRole('checkbox').tap();
    await expect(list.getByLabel('Include The Harbour')).not.toBeChecked();
    expect(await list.getByLabel('Include The Harbour').evaluate((e: HTMLInputElement) => e.indeterminate)).toBe(true);
    await addsUp(page);
    const cardsHarbourOne = await cards(page);
    await list.locator('label.sub').filter({ hasText: 'One' }).getByRole('checkbox').tap();
    await expect(list.getByLabel('Include The Harbour')).not.toBeChecked();
    expect(await list.getByLabel('Include The Harbour').evaluate((e: HTMLInputElement) => e.indeterminate)).toBe(false);
    await expect(page.getByTestId('preview-cards')).toContainText('0 cards');
    await expect(page.getByTestId('create-cards')).toBeDisabled();
    expect(cardsHarbourOne).toBeGreaterThan(0);
    // ticking the work again includes both chapters
    await list.getByLabel('Include The Harbour').tap();
    await expect(list.getByLabel('Include The Harbour')).toBeChecked();
    await expect(page.getByTestId('create-cards')).toBeEnabled();
    await addsUp(page);
    // front matter can be included: it adds words
    const before = await num(page, 'Distinct words');
    await list.getByRole('checkbox', { name: /Cover/ }).tap();
    await expect.poll(() => num(page, 'Distinct words')).toBeGreaterThan(before);
    await addsUp(page);
  });

  test('a book with only its back matter included works end to end', async ({ page }) => {
    const list = page.getByTestId('chapter-list');
    await list.getByLabel('Include The Moor').tap();
    await list.getByLabel('Include The Harbour').tap();
    await list.getByRole('checkbox', { name: /About the Author/ }).tap();
    await expect(page.getByTestId('preview-cards')).toContainText('1 cards');
    await addsUp(page);
    const cov = await coverage(page);
    await tap(page.getByTestId('create-cards'));
    await expect(page.getByTestId('book-coverage')).toBeVisible();
    await expect(page.locator('.hero .ring strong')).toHaveText(`${cov} %`);
    await expect(page.getByTestId('chapter-row').filter({ hasText: '% known' })).toHaveCount(1);
    await expect(page.getByTestId('chapter-row').filter({ hasText: 'Not included' })).toHaveCount(6);
    await expect(page.getByTestId('chapter-row').filter({ hasText: 'Learning' })).toContainText('About the Author');
    await expect(page.getByTestId('book-eta')).toContainText('1 words');
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await expect(page.getByLabel('Chapter').locator('option')).toHaveText(['All chapters', 'About the Author']);
    await expect(page.getByTestId('word-row')).toHaveCount(1);
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await tap(page.getByRole('button', { name: 'Back to library' }));
    await expect(page.getByTestId('book-tile')).toContainText('About the Author');
    await expect(page.getByTestId('book-tile')).toContainText('1 cards');
  });

  test('cancel, then browser back to the discarded draft: an error, not a crash', async ({ page }) => {
    await tap(page.getByRole('button', { name: 'Cancel import' }));
    await expect(page.getByRole('heading', { name: 'Import your first book' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('alert')).toContainText('Import draft not found');
    await expect(page.getByTestId('create-cards')).toHaveCount(0);
    await tap(page.getByRole('button', { name: 'Cancel import' }));
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    await importBook(page);
    await tap(page.getByTestId('create-cards'));
    await expect(page.getByTestId('book-coverage')).toBeVisible();
    // the draft was consumed and its history entry replaced: back goes to the library, not a second copy of the book
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    await expect(page.getByTestId('book-tile')).toHaveCount(1);
    await page.goForward();
    await expect(page.getByTestId('book-coverage')).toBeVisible();
  });

  test('re-filter to the top cutoff after a session keeps the studied cards; counts agree', async ({ page }) => {
    await tap(page.getByTestId('create-cards'));
    await tap(page.getByTestId('study-now'));
    await tap(page.getByTestId('start-cards-10'));
    await expect(page.getByTestId('progress')).toHaveText(/^\s*0 \/ 10$/);
    for (let i = 0; i < 10; i++) {
      await settled(page);
      await tapCard(page);
      await expectPhase(page, 'back');
      await swipeRight(page);
    }
    await expect(page.getByTestId('statistics')).toBeVisible();
    await tap(page.getByTestId('done'));
    await tap(page.getByRole('button', { name: 'Book options' }));
    await tap(page.getByRole('button', { name: 'Change level for this book…' }));
    await page.getByLabel('Cutoff rank').fill('60000');
    await tap(page.getByRole('button', { name: 'Re-filter' }));
    // the 10 cards answered right at first sight were retired as known (C18): they are protected, the other 25 go
    await expect(page.getByTestId('toast')).toContainText('0 cards');
    await expect(page.getByText(/rare words\./)).toHaveText("You know 10 of this book's 10 rare words.");
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await expect(page.getByRole('tab', { name: /Known/ })).toContainText('10');
    await expect(page.getByRole('tab', { name: /Active/ })).toContainText(/Active 0$/);
    await expect(page.getByRole('tab', { name: /Skipped/ })).toContainText('43');   // 18 + the 25 dropped cards
    // the lemma rows of the dropped cards are "skipped" now and can be added back
    await tap(page.getByRole('tab', { name: /Skipped/ }));
    await expect(page.getByTestId('word-row')).toHaveCount(43);
  });

  test('re-filter after import at the same cutoff changes nothing; at a low cutoff adds cards consistently', async ({ page }) => {
    await tap(page.getByTestId('create-cards'));
    await expect(page.getByTestId('book-coverage')).toBeVisible();
    const hero = await page.locator('.hero').innerText();
    await tap(page.getByRole('button', { name: 'Book options' }));
    await tap(page.getByRole('button', { name: 'Change level for this book…' }));
    await tap(page.getByRole('button', { name: 'Re-filter' }));
    await expect(page.getByTestId('toast')).toContainText('35 cards');
    await expect(page.locator('.hero')).toHaveText(hero);
    await tap(page.getByRole('button', { name: 'Book options' }));
    await tap(page.getByRole('button', { name: 'Change level for this book…' }));
    await page.getByLabel('Cutoff rank').fill('2000');
    await tap(page.getByRole('button', { name: 'Re-filter' }));
    await expect(page.getByTestId('toast')).toContainText(/(\d+) cards at level/);
    const n = Number((await page.getByTestId('toast').innerText()).match(/(\d+) cards/)![1]);
    expect(n).toBeGreaterThan(35);
    await expect(page.getByText(/rare words\./)).toContainText(`of this book's ${n} rare words`);
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await expect(page.getByRole('tab', { name: /Active/ })).toContainText(String(n));
    await expect(page.getByTestId('word-row')).toHaveCount(n);
  });
});
