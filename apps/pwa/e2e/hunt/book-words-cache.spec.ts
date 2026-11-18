import { expect, test, type Locator, type Page } from '@playwright/test';
import { firstRun, importAndOpen, swipe, tap } from '../helpers';

/** the Words screen keeps lists per tab (D6); after a change no tab may show stale rows, and counts must follow */

const tabCount = async (page: Page, name: RegExp) => Number((await page.getByRole('tab', { name }).innerText()).replace(/\D+/g, ' ').trim());
const words = (page: Page) => page.getByTestId('word-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-word')));
async function swipeRowLeft(page: Page, row: Locator) {
  const b = (await row.boundingBox())!;
  await swipe(page, -160, 0, { from: { x: b.x + b.width / 2, y: b.y + b.height / 2 } });
}

test.describe('Words screen cache', () => {
  let errors: string[];
  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await firstRun(page);
    await importAndOpen(page);
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await expect(page.getByTestId('word-row').first()).toBeVisible();
  });
  test.afterEach(() => { expect(errors).toEqual([]); });

  test('swipe left removes a card: Active, Removed and counts update; undo brings it back', async ({ page }) => {
    // warm the cache of the other tabs first, so stale lists would show if they were kept
    await tap(page.getByRole('tab', { name: /Removed/ }));
    await expect(page.getByTestId('word-list')).toContainText('Nothing here.');
    await tap(page.getByRole('tab', { name: /Active/ }));
    const row = page.getByTestId('word-row').first();
    const word = (await row.getAttribute('data-word'))!;
    await swipeRowLeft(page, row);
    await expect(page.getByTestId('toast')).toContainText(`“${word}” removed`);
    await expect(page.getByTestId('word-row')).toHaveCount(34);
    expect(await words(page)).not.toContain(word);
    expect(await tabCount(page, /Active/)).toBe(34);
    expect(await tabCount(page, /Removed/)).toBe(1);
    await tap(page.getByRole('tab', { name: /Removed/ }));
    await expect(page.getByTestId('word-row')).toHaveCount(1);
    await expect(page.getByTestId('word-row')).toHaveAttribute('data-word', word);
    await tap(page.getByTestId('toast').getByRole('button', { name: 'Undo' }));
    await expect(page.getByTestId('word-list')).toContainText('Nothing here.');
    expect(await tabCount(page, /Removed/)).toBe(0);
    await tap(page.getByRole('tab', { name: /Active/ }));
    await expect(page.getByTestId('word-row')).toHaveCount(35);
    expect(await words(page)).toContain(word);
  });

  test('mark as known from the sheet, then restore from Known: lists, counts and the overview agree', async ({ page }) => {
    await tap(page.getByRole('tab', { name: /Known/ }));
    await expect(page.getByTestId('word-list')).toContainText('Nothing here.');
    await tap(page.getByRole('tab', { name: /Active/ }));
    const row = page.getByTestId('word-row').first();
    const word = (await row.getAttribute('data-word'))!;
    await tap(row);
    await tap(page.getByRole('button', { name: 'Mark as known' }));
    await expect(page.getByTestId('toast')).toContainText(`“${word}” marked as known`);
    await expect(page.getByTestId('word-row')).toHaveCount(34);
    expect(await tabCount(page, /Known/)).toBe(1);
    await tap(page.getByRole('tab', { name: /Known/ }));
    await expect(page.getByTestId('word-row')).toHaveCount(1);
    await expect(page.getByTestId('word-row')).toHaveAttribute('data-word', word);
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await expect(page.getByText(/rare words\./)).toHaveText("You know 1 of this book's 35 rare words.");
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await expect(page.getByRole('tab', { name: /Active/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('word-row')).toHaveCount(34);
    await tap(page.getByRole('tab', { name: /Known/ }));
    await tap(page.getByTestId('word-row').first());
    await tap(page.getByRole('button', { name: 'Restore card' }));
    await expect(page.getByTestId('toast')).toContainText(`“${word}” restored`);
    await expect(page.getByTestId('word-list')).toContainText('Nothing here.');
    expect(await tabCount(page, /Known/)).toBe(0);
    expect(await tabCount(page, /Active/)).toBe(35);
    await tap(page.getByRole('tab', { name: /Active/ }));
    await expect(page.getByTestId('word-row')).toHaveCount(35);
  });

  test('ignore a word not in the lists: other tabs are not stale; hidden stays hidden after a reload', async ({ page }) => {
    await tap(page.getByRole('tab', { name: /Not in lists/ }));
    const row = page.getByTestId('word-row').first();
    const word = (await row.getAttribute('data-word'))!;
    await swipeRowLeft(page, row);
    await expect(page.getByTestId('toast')).toContainText(`“${word}” hidden`);
    await expect(page.getByTestId('word-row')).toHaveCount(73);
    await expect.poll(() => tabCount(page, /Not in lists/)).toBe(73);
    await tap(page.getByRole('tab', { name: /Active/ }));
    await tap(page.getByRole('tab', { name: /Not in lists/ }));
    expect(await words(page)).not.toContain(word);
    await page.reload();
    await expect(page.getByTestId('word-row').first()).toBeVisible();
    expect(await words(page)).not.toContain(word);
    await expect.poll(() => tabCount(page, /Not in lists/)).toBe(73);
  });

  test('rapid tab switches end on the right list', async ({ page }) => {
    await page.getByRole('tab', { name: /Known/ }).tap();
    await page.getByRole('tab', { name: /Skipped/ }).tap();
    await page.getByRole('tab', { name: /Not in lists/ }).tap();
    await page.getByRole('tab', { name: /Active/ }).tap();
    await expect(page.getByTestId('word-row')).toHaveCount(35);
    expect(await words(page)).toContain('moor');
    await page.getByRole('tab', { name: /Not in lists/ }).tap();
    await page.getByRole('tab', { name: /Skipped/ }).tap();
    await expect(page.getByTestId('word-row')).toHaveCount(18);
    expect(await words(page)).toContain('lantern');
  });

  test('undo from the toast after leaving Words: the book overview must not keep the undone figure', async ({ page }) => {
    const row = page.getByTestId('word-row').first();
    const word = (await row.getAttribute('data-word'))!;
    await tap(row);
    await tap(page.getByRole('button', { name: 'Mark as known' }));
    await expect(page.getByTestId('toast')).toContainText(`“${word}” marked as known`);
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await expect(page.getByText(/rare words\./)).toHaveText("You know 1 of this book's 35 rare words.");
    await tap(page.getByTestId('toast').getByRole('button', { name: 'Undo' }));
    await expect(page.getByTestId('toast')).toHaveCount(0);
    // the overview on screen while Undo was tapped should show the undone figure
    await expect.soft(page.getByText(/rare words\./)).toHaveText("You know 0 of this book's 35 rare words.", { timeout: 3000 });
    // the undo took effect …
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await expect(page.getByRole('tab', { name: /Known/ })).toContainText('0');
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    // … and the overview shows it
    await expect(page.getByText(/rare words\./)).toHaveText("You know 0 of this book's 35 rare words.");
    await page.goBack(); await page.goBack();
    // the overview that was on screen when Undo was tapped (reached by history) is stale until re-created
    await expect(page.getByText(/rare words\./)).toHaveText("You know 0 of this book's 35 rare words.");
  });

  test('a card added from Not in lists moves to Active and counts for the book', async ({ page }) => {
    await tap(page.getByRole('tab', { name: /Not in lists/ }));
    const row = page.getByTestId('word-row').first();
    const word = (await row.getAttribute('data-word'))!;
    await tap(row);
    await page.getByLabel('Translation').fill('Kapitän');
    await tap(page.getByTestId('add-card'));
    await expect(page.getByTestId('toast')).toContainText(`“${word}” added`);
    await expect(page.getByTestId('word-row')).toHaveCount(73);
    expect(await tabCount(page, /Active/)).toBe(36);
    await tap(page.getByRole('tab', { name: /Active/ }));
    expect(await words(page)).toContain(word);
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await expect(page.getByText(/rare words\./)).toHaveText("You know 0 of this book's 36 rare words.");
  });
});
