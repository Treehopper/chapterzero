import { expect, test } from '@playwright/test';
import { firstRun, importAndOpen, importBook, swipeRight, tap, tapCard } from '../helpers';

/** deleting a book (with an open session) and importing the same book twice */

test.describe('delete and re-import', () => {
  let errors: string[];
  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    await firstRun(page);
  });
  test.afterEach(() => { expect(errors).toEqual([]); });

  test('deleting a book with an open session leaves a clean library; a new import starts fresh', async ({ page }) => {
    await importAndOpen(page);
    await tap(page.getByTestId('study-now'));
    await tap(page.getByTestId('start-cards-10'));
    await expect(page.getByTestId('progress')).toHaveText(/^\s*0 \/ 10$/);
    await tapCard(page);
    await swipeRight(page);
    await expect(page.getByTestId('progress')).toHaveText(/^\s*1 \/ 10$/);
    await page.goBack();
    await expect(page.getByTestId('study-now')).toHaveText('Continue · 1 / 10');
    const bookId = decodeURIComponent(page.url().split('/').pop()!);
    await tap(page.getByRole('button', { name: 'Book options' }));
    await tap(page.getByRole('button', { name: 'Delete book' }));
    await expect(page.getByTestId('toast')).toContainText('Book deleted');
    await expect(page.getByRole('heading', { name: 'Import your first book' })).toBeVisible();
    await expect(page.getByTestId('book-tile')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    await expect(page.getByTestId('book-tile')).toHaveCount(0);
    // the old routes of the deleted book fail gracefully
    await page.goBack();
    await expect(page.locator('.error')).toContainText('Book not found');
    await page.goto(`/#/study/${bookId}`);
    await expect(page.locator('.error')).toContainText('Book not found');
    await page.goto('/#/library');
    await importAndOpen(page);
    await expect(page.getByTestId('study-now')).toHaveText('Get ready for reading');
    // 34: the one card answered right at first sight in the deleted book is a known word now (C18, B8)
    await expect(page.getByText(/rare words\./)).toHaveText("You know 0 of this book's 34 rare words.");
  });

  test('the Words screen of a deleted book (history back) fails gracefully, without an uncaught error', async ({ page }) => {
    await importAndOpen(page);
    const bookId = decodeURIComponent(page.url().split('/').pop()!);
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await expect(page.getByTestId('word-row').first()).toBeVisible();
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await tap(page.getByRole('button', { name: 'Book options' }));
    await tap(page.getByRole('button', { name: 'Delete book' }));
    await expect(page.getByTestId('toast')).toContainText('Book deleted');
    await page.goto(`/#/words/${bookId}`);
    await expect(page.getByRole('heading', { name: 'Words' })).toBeVisible();
    await page.waitForTimeout(800);
    // like the overview and the study screen do for a missing book
    await expect(page.locator('.error, [role=alert]').first()).toContainText('Book not found');
  });

  test('the same book imported twice: independent decks; deleting one keeps the other', async ({ page }) => {
    await importAndOpen(page);
    await tap(page.getByRole('button', { name: 'Back to library' }));
    await importAndOpen(page);
    await tap(page.getByRole('button', { name: 'Back to library' }));
    const tiles = page.getByTestId('book-tile');
    await expect(tiles).toHaveCount(2);
    await expect(tiles.nth(0)).toContainText('35 cards');
    await expect(tiles.nth(1)).toContainText('35 cards');
    // remove a card in the first book
    await tap(tiles.nth(0).getByRole('button', { name: /Open/ }));
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await tap(page.getByTestId('word-row').first());
    await tap(page.getByRole('button', { name: 'Remove card' }));
    await expect(page.getByRole('tab', { name: /Active/ })).toContainText('34');
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await expect(page.getByText(/rare words\./)).toHaveText("You know 0 of this book's 34 rare words.");
    await tap(page.getByRole('button', { name: 'Back to library' }));
    await expect(tiles.nth(0)).toContainText('34 cards');
    await expect(tiles.nth(1)).toContainText('35 cards');
    // delete the first; the second is untouched
    await tap(tiles.nth(0).getByRole('button', { name: /Open/ }));
    await tap(page.getByRole('button', { name: 'Book options' }));
    await tap(page.getByRole('button', { name: 'Delete book' }));
    await expect(page.getByTestId('toast')).toContainText('Book deleted');
    await expect(tiles).toHaveCount(1);
    await expect(tiles).toContainText('35 cards');
    await tap(tiles.getByRole('button', { name: /Open/ }));
    await expect(page.getByText(/rare words\./)).toHaveText("You know 0 of this book's 35 rare words.");
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await expect(page.getByTestId('word-row')).toHaveCount(35);
    await expect(page.getByRole('tab', { name: /Removed/ })).toContainText('0');
  });

  test('a word marked known in one book is skipped when the book is imported again (B8)', async ({ page }) => {
    await importAndOpen(page);
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await tap(page.locator('[data-word="moor"]'));
    await tap(page.getByRole('button', { name: 'Mark as known' }));
    await expect(page.getByTestId('toast')).toContainText('“moor” marked as known');
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await tap(page.getByRole('button', { name: 'Back to library' }));
    await importBook(page);
    const counts = page.getByTestId('preview-counts');
    await expect(counts.getByText('Already known').locator('..')).toContainText('1');
    await expect(page.getByTestId('preview-cards')).toContainText('34 cards');
    await tap(page.getByTestId('create-cards'));
    await expect(page.getByText(/rare words\./)).toHaveText("You know 0 of this book's 34 rare words.");
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await expect(page.getByRole('tab', { name: /Active/ })).toContainText('34');
    await expect(page.getByRole('tab', { name: /Known/ })).toContainText('1');
    await tap(page.getByRole('tab', { name: /Known/ }));
    await expect(page.getByTestId('word-row')).toHaveAttribute('data-word', 'moor');
    // the second book's study has no leftover session from the first
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await expect(page.getByTestId('study-now')).toHaveText('Get ready for reading');
  });
});
