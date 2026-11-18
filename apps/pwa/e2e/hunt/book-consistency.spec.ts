import { expect, test, type Page } from '@playwright/test';
import { expectPhase, firstRun, importBook, importAndOpen, settled, swipeRight, tap, tapCard } from '../helpers';

/** numbers that must agree between the import preview, the book overview, the chapter sheet and the Words screen */

const num = (s: string, re: RegExp) => Number(s.match(re)![1].replace(/,/g, ''));
const minutes = (s: string) => {
  const h = s.match(/≈ (\d+) h/);
  const m = s.match(/(\d+) min/);
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
};
async function closeSheet(page: Page) {
  await page.locator('.sheet-backdrop').tap({ position: { x: 8, y: 8 } });
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
const ringLabel = (page: Page) => page.locator('.hero .ring strong');
const tabCount = async (page: Page, name: RegExp) => Number((await page.getByRole('tab', { name }).innerText()).replace(/\D+/g, ' ').trim());

test.describe('numbers agree across screens', () => {
  let errors: string[];
  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await firstRun(page);
  });
  test.afterEach(() => { expect(errors).toEqual([]); });

  test('preview coverage and card count match the book overview and the Active tab', async ({ page }) => {
    await importBook(page);
    const cov = (await page.getByText(/estimated coverage now/).innerText()).match(/([\d.]+ %)/)![1];
    const cards = num(await page.getByTestId('preview-cards').innerText(), /([\d,]+) cards/);
    await tap(page.getByTestId('create-cards'));
    await expect(page.getByTestId('book-coverage')).toBeVisible();
    await expect(ringLabel(page)).toHaveText(cov);
    await expect(page.getByText(/rare words\./)).toContainText(`of this book's ${cards} rare words`);
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await expect(page.getByRole('tab', { name: /Active/ })).toContainText(String(cards));
    await expect(page.getByTestId('word-row')).toHaveCount(cards);
  });

  test('"not in the lists" on the preview equals the Not in lists tab', async ({ page }) => {
    await importBook(page);
    const counts = page.getByTestId('preview-counts');
    const unlisted = Number((await counts.getByText('Not in the lists').locator('..').innerText()).replace(/\D+/g, ' ').trim().split(' ').pop());
    await tap(page.getByTestId('create-cards'));
    await expect(page.getByTestId('book-coverage')).toBeVisible();
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await expect(page.getByRole('tab', { name: /Not in lists/ })).toHaveText(/\d/);
    // B7: the preview counts words of the included chapters; the Words screen lists the same book
    expect(await tabCount(page, /Not in lists/)).toBe(unlisted);
  });

  test('chapter sheet card totals equal the Words rows filtered by that chapter', async ({ page }) => {
    await importAndOpen(page);
    const rows = page.getByTestId('chapter-row').filter({ hasText: 'to target' });
    const n = await rows.count();
    expect(n).toBe(4);
    const totals: { title: string; cards: number }[] = [];
    for (let i = 0; i < n; i++) {
      await tap(rows.nth(i));
      const text = await page.getByRole('dialog').innerText();
      totals.push({ title: (await page.getByRole('dialog').getByRole('heading').innerText()).trim(), cards: num(text, /100 % = all (\d+) cards/) });
      await closeSheet(page);
    }
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await expect(page.getByTestId('word-row').first()).toBeVisible();
    for (const t of totals) {
      await page.getByLabel('Chapter').selectOption({ label: t.title });
      await expect(page.getByTestId('word-row'), t.title).toHaveCount(t.cards);
    }
  });

  test('book time-to-ready is the sum of the chapter rows and sheets', async ({ page }) => {
    await importAndOpen(page);
    const eta = await page.getByTestId('book-eta').innerText();
    const bookMin = minutes(eta);
    const bookWords = num(eta, /([\d,]+) words/);
    const rowMin = (await page.getByTestId('chapter-eta').allInnerTexts()).reduce((n, t) => n + minutes(t), 0);
    expect(rowMin).toBe(bookMin);
    const rows = page.getByTestId('chapter-row').filter({ hasText: 'to target' });
    let sheetWords = 0, sheetMin = 0;
    for (let i = 0; i < await rows.count(); i++) {
      await tap(rows.nth(i));
      const s = page.getByTestId('sheet-eta');
      if (await s.count()) { const t = await s.innerText(); sheetWords += num(t, /\((\d+) words\)/); sheetMin += minutes(t); }
      await closeSheet(page);
    }
    expect(sheetWords).toBe(bookWords);
    expect(sheetMin).toBe(bookMin);
  });

  test('after a 10-card session: sheet counts, "new" count, Words tabs and the estimates still add up', async ({ page }) => {
    await importAndOpen(page);
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
    await expect(page.getByTestId('book-coverage')).toBeVisible();
    await expect(page.getByTestId('study-now')).toHaveText('Get ready for reading');
    // by default a never-seen card answered right is retired as known (C18): 10 known words now
    const hero = await page.getByText(/rare words\./).innerText();
    const known = num(hero, /You know (\d+) of/);
    const total = num(hero, /of this book's (\d+) rare/);
    expect(known).toBe(10);
    expect(total).toBe(35);
    expect(Number((await ringLabel(page).innerText()).replace(' %', ''))).toBeGreaterThan(88.8);
    const learning = page.getByTestId('chapter-row').filter({ hasText: 'Learning' });
    const newCount = num(await learning.innerText(), /(\d+) new/);
    await tap(learning);
    const sheet = await page.getByRole('dialog').innerText();
    expect(num(sheet, /(\d+)\s+unseen/)).toBe(newCount);
    const sheetTotal = num(sheet, /100 % = all (\d+) cards/);
    expect(sheetTotal).toBe(num(sheet, /(\d+)\s+unseen/) + num(sheet, /(\d+)\s+learning/) + num(sheet, /(\d+)\s+learned/));
    const title = (await page.getByRole('dialog').getByRole('heading').innerText()).trim();
    await closeSheet(page);
    const eta = await page.getByTestId('book-eta').innerText();
    const rowMin = (await page.getByTestId('chapter-eta').allInnerTexts()).reduce((n, t) => n + minutes(t), 0);
    expect(rowMin).toBe(minutes(eta));
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await expect(page.getByRole('tab', { name: /Active/ })).toContainText(String(total - known));
    await expect(page.getByRole('tab', { name: /Known/ })).toContainText(String(known));
    await page.getByLabel('Chapter').selectOption({ label: title });
    await expect(page.getByTestId('word-row')).toHaveCount(sheetTotal);
  });

  test('the sheet of an excluded chapter does not say "not included" twice', async ({ page }) => {
    await importAndOpen(page);
    await tap(page.getByTestId('chapter-row').filter({ hasText: 'Not included' }).first());
    const text = await page.getByRole('dialog').innerText();
    expect(text).not.toMatch(/not included · not included/i);
  });
});
