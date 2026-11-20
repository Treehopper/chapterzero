import { expect, test, type Page } from '@playwright/test';
import { firstRun, importAndOpen, tap } from '../helpers';

/** a book or chapter that becomes ready outside a study session: every screen must agree */

const ringLabel = (page: Page) => page.locator('.hero .ring strong');
const harbourOne = (page: Page) => page.getByTestId('chapter-row').filter({ hasText: 'One' }).nth(1);

test.describe('ready state outside a session', () => {
  let errors: string[];
  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await firstRun(page);
    await importAndOpen(page);
  });
  test.afterEach(() => { expect(errors).toEqual([]); });

  test('a book with nothing left to learn after a re-filter: overview, ready pill and library tile agree', async ({ page }) => {
    await tap(page.getByRole('button', { name: 'Book options' }));
    await tap(page.getByRole('button', { name: 'Change level for this book…' }));
    await page.getByLabel('Cutoff rank').fill('60000');
    await tap(page.getByRole('button', { name: 'Re-filter' }));
    await expect(page.getByTestId('toast')).toContainText(/^0 cards/);
    await expect(page.getByTestId('book-coverage')).toHaveText('no unknown words left');
    await expect(page.getByTestId('chapter-row').filter({ hasText: '% known' })).toHaveCount(4);
    for (const r of await page.getByTestId('chapter-row').filter({ hasText: '% known' }).all()) await expect(r).toContainText('Ready to read');
    // the overview offers a review because nothing is left to learn …
    await expect(page.getByTestId('study-now')).toHaveText(/^Review/);
    // … so the book is ready (README §7.5: finishedAt the first time all included chapters are ready) and the tile says so too
    await expect.soft(page.locator('.hero').getByText('Ready to read')).toBeVisible();
    await tap(page.getByRole('button', { name: 'Back to library' }));
    await expect(page.getByTestId('book-tile')).toBeVisible();
    await expect.soft(page.getByTestId('book-tile').getByRole('button', { name: /Review|Get ready/ })).toHaveText('Review');
    await expect.soft(page.getByTestId('book-tile')).toContainText('Ready to read');
  });

  test('coverage target 95 %: a chapter at 95 % becomes ready on the overview, in its sheet and on the tile', async ({ page }) => {
    await expect(harbourOne(page)).toContainText('Upcoming · 95.0 % known');
    await tap(page.getByRole('button', { name: 'Back to library' }));
    await tap(page.getByRole('button', { name: 'Settings' }));
    await page.getByLabel('Coverage target').fill('0.95');
    await expect(page.getByText('Coverage target').locator('..')).toContainText('95.0 %');
    await tap(page.getByRole('button', { name: 'Back', exact: true }));
    await tap(page.getByTestId('book-tile').getByRole('button', { name: /Open/ }));
    await expect(page.getByTestId('bars-note')).toContainText('ready to read at 95.0 %');
    await expect(harbourOne(page)).toContainText('Ready to read · 95.0 % known');
    await expect(harbourOne(page).getByTestId('chapter-to-target')).toHaveText('');
    await expect(harbourOne(page).getByTestId('chapter-eta')).toHaveCount(0);
    await tap(harbourOne(page));
    await expect(page.getByTestId('study-chapter')).toHaveText('Review this chapter');
    await expect(page.getByTestId('sheet-eta')).toHaveCount(0);
    await page.locator('.sheet-backdrop').tap({ position: { x: 8, y: 8 } });
    // the ring's target marker follows the setting, on the overview and on the library tile
    const angle = async (scope: ReturnType<Page['locator']>) => (await scope.locator('.ring line').getAttribute('transform'))!.match(/rotate\(([\d.]+)/)![1];
    const overviewMark = await angle(page.locator('.hero'));
    expect(Number(overviewMark)).toBeCloseTo(0.95 * 360, 1);
    await tap(page.getByRole('button', { name: 'Back to library' }));
    await expect(page.getByTestId('book-tile')).toBeVisible();
    expect.soft(await angle(page.getByTestId('book-tile'))).toBe(overviewMark);
  });

  test('marking a chapter\'s cards known on the Words screen makes it ready everywhere', async ({ page }) => {
    const before = Number((await ringLabel(page).innerText()).replace(' %', ''));
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await expect(page.getByTestId('word-row').first()).toBeVisible();
    await page.getByLabel('Chapter').selectOption({ label: 'The Harbour · One' });
    await expect(page.getByTestId('word-row')).toHaveCount(9);
    for (let i = 9; i > 0; i--) {
      const row = page.getByTestId('word-row').first();
      const word = await row.getAttribute('data-word');
      await tap(row);
      await tap(page.getByRole('button', { name: 'Mark as known' }));
      await expect(page.getByTestId('toast')).toContainText(`“${word}” marked as known`);
      await expect(page.getByTestId('word-row')).toHaveCount(i - 1);
    }
    await expect(page.getByTestId('word-list')).toContainText('Nothing here.');
    await expect(page.getByRole('tab', { name: /Known/ })).toContainText('9');
    await expect(page.getByRole('tab', { name: /Active/ })).toContainText('26');
    await tap(page.getByRole('tab', { name: /Known/ }));
    await expect(page.getByTestId('word-row')).toHaveCount(9);
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await expect(page.getByTestId('book-coverage')).toBeVisible();
    await expect(harbourOne(page)).toContainText('Ready to read · 100.0 % known');
    await expect(harbourOne(page).getByTestId('chapter-to-target')).toHaveText('');
    await expect(page.getByText(/rare words\./)).toHaveText("You know 9 of this book's 35 rare words.");
    const after = Number((await ringLabel(page).innerText()).replace(' %', ''));
    expect(after).toBeGreaterThan(before);
    const learning = page.getByTestId('chapter-row').filter({ hasText: 'Learning' });
    const learningKnown = (await learning.innerText()).match(/([\d.]+ % known)/)![1];
    // the library tile shows the same coverage and learning chapter
    await tap(page.getByRole('button', { name: 'Back to library' }));
    const tile = page.getByTestId('book-tile');
    await expect(tile.locator('.ring strong')).toHaveText(String(after.toFixed(1)));
    await expect(tile).toContainText(`The Moor · One · ${learningKnown.replace(' known', '')}`);
    await expect(tile).toContainText('26 cards');
  });
});
