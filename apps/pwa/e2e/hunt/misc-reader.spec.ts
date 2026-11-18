import { expect, test, type Page } from '@playwright/test';
import { firstRun, importAndOpen, tap } from '../helpers';

/** the first paragraph still on screen, as the app defines it (bottom > 60) */
const firstVisible = (page: Page) =>
  page.evaluate(() => {
    const ps = [...document.querySelectorAll<HTMLElement>('[data-b]')];
    const p = ps.find((x) => x.getBoundingClientRect().bottom > 60);
    const bar = document.querySelector<HTMLElement>('header.bar')!.getBoundingClientRect();
    return { b: Number(p?.dataset.b), top: Math.round(p!.getBoundingClientRect().top), barBottom: Math.round(bar.bottom), scrollY: Math.round(scrollY) };
  });

const scrollToBlock = (page: Page, b: number) =>
  page.evaluate((b) => { document.querySelector<HTMLElement>(`[data-b="${b}"]`)!.scrollIntoView({ block: 'start' }); }, b);

test.describe('reader hunt', () => {
  let errors: string[];
  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await firstRun(page);
    await importAndOpen(page);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('saved position comes back at the same paragraph, readable below the bar, and does not drift on repeated reopen', async ({ page }) => {
    await tap(page.getByTestId('read'));
    await expect(page.getByTestId('reader-text')).toBeVisible();
    // read on until a long paragraph (block 3) is the first one on screen
    await scrollToBlock(page, 3);
    await page.waitForTimeout(700);                       // 0.4 s after scrolling stops
    const before = await firstVisible(page);
    console.log('before reload', before);
    await page.reload();
    await expect(page.getByTestId('reader-text')).toBeVisible();
    await page.waitForTimeout(700);
    const after1 = await firstVisible(page);
    console.log('after reload 1', after1);
    expect(after1.b).toBe(before.b);
    // the paragraph we were at should not be hidden behind the sticky bar
    expect(after1.top).toBeGreaterThanOrEqual(after1.barBottom - 2);
    await page.reload();
    await expect(page.getByTestId('reader-text')).toBeVisible();
    await page.waitForTimeout(700);
    const after2 = await firstVisible(page);
    console.log('after reload 2', after2);
    expect(after2.b).toBe(before.b);
  });

  test('position at a short paragraph survives reopening (no drift)', async ({ page }) => {
    await tap(page.getByTestId('read'));
    await expect(page.getByTestId('reader-text')).toBeVisible();
    // block 1 is a one-line paragraph; put it fully on screen just below the bar (top ≈ 60)
    await page.evaluate(() => { const el = document.querySelector<HTMLElement>('[data-b="1"]')!; scrollTo(0, el.getBoundingClientRect().top + scrollY - 60); });
    await page.waitForTimeout(700);
    const before = await firstVisible(page);
    console.log('before', before);
    expect(before.b).toBe(1);
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await tap(page.getByTestId('read'));
    await expect(page.getByTestId('reader-text')).toBeVisible();
    await page.waitForTimeout(700);
    const a1 = await firstVisible(page);
    console.log('reopen 1', a1);
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await tap(page.getByTestId('read'));
    await expect(page.getByTestId('reader-text')).toBeVisible();
    await page.waitForTimeout(700);
    const a2 = await firstVisible(page);
    console.log('reopen 2', a2);
    expect(a1.b).toBe(before.b);
    expect(a2.b).toBe(before.b);
  });

  test('tapping next quickly several times: header, URL and saved chapter agree', async ({ page }) => {
    await tap(page.getByTestId('read'));
    await expect(page.getByTestId('reader-text')).toBeVisible();
    const next = page.getByTestId('next-chapter');
    // chapters 2 → 3 → 4 → 5 as fast as the button renders
    for (let i = 0; i < 3; i++) await next.click({ force: true, noWaitAfter: true });
    await page.waitForTimeout(800);
    const title = await page.locator('header h1').innerText();
    const url = page.url();
    console.log('title', title, 'url', url);
    await page.reload();
    await expect(page.getByTestId('reader-text')).toBeVisible();
    await expect(page.locator('header h1')).toHaveText(title);
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await tap(page.getByTestId('read'));
    await expect(page.locator('header h1')).toHaveText(title);
  });

  test('next then prev lands at the top of the chapter; previous chapter keeps no stale scroll', async ({ page }) => {
    await tap(page.getByTestId('read'));
    await expect(page.getByTestId('reader-text')).toBeVisible();
    await scrollToBlock(page, 6);
    await page.waitForTimeout(600);
    await tap(page.getByTestId('next-chapter'));
    await expect(page.locator('header h1')).toHaveText('The Moor · Two');
    expect((await firstVisible(page)).b).toBe(0);
    await tap(page.getByRole('button', { name: /‹ The Moor · One/ }));
    await expect(page.locator('header h1')).toHaveText('The Moor · One');
    await page.waitForTimeout(600);
    const pos = await firstVisible(page);
    console.log('after prev', pos);
    expect(pos.b).toBe(0);
  });

  test('deep link to a chapter: #/read/<id>/<n> opens that chapter; reload keeps it; back goes to the book', async ({ page }) => {
    const id = page.url().split('#/book/')[1];
    await page.goto(`/#/read/${id}/4`);
    await expect(page.locator('header h1')).toHaveText('The Harbour · One');
    await page.reload();
    await expect(page.locator('header h1')).toHaveText('The Harbour · One');
    await page.goBack();
    await expect(page.getByTestId('book-coverage')).toBeVisible();
    // and the reader remembers that chapter
    await tap(page.getByTestId('read'));
    await expect(page.locator('header h1')).toHaveText('The Harbour · One');
  });

  test('deep link with a chapter that does not exist shows an error and a way out', async ({ page }) => {
    const id = page.url().split('#/book/')[1];
    await page.goto(`/#/read/${id}/999`);
    await expect(page.locator('.error')).toBeVisible();
    console.log('error text:', await page.locator('.error').innerText());
    // contents still lets you pick a chapter
    await tap(page.getByTestId('contents'));
    await tap(page.getByTestId('toc-row').nth(2));
    await expect(page.locator('header h1')).toHaveText('The Moor · One');
    await expect(page.getByTestId('reader-text')).toBeVisible();
  });

  test('deep link with an excluded chapter (cover) and a non-numeric chapter', async ({ page }) => {
    const id = page.url().split('#/book/')[1];
    await page.goto(`/#/read/${id}/0`);
    await expect(page.locator('header h1')).toHaveText('Cover');
    await page.goto(`/#/read/${id}/abc`);
    await page.reload();
    await expect(page.getByTestId('reader-text')).toBeVisible();
    console.log('abc →', await page.locator('header h1').innerText(), page.url());
  });

  test('reader for an unknown book id: error, no crash, back works', async ({ page }) => {
    await page.goto('/#/read/not-a-book/1');
    await expect(page.locator('.error')).toBeVisible();
    console.log('error text:', await page.locator('.error').innerText());
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await page.waitForTimeout(500);
    console.log('after back:', page.url(), (await page.locator('main').innerText()).slice(0, 200));
  });

  test('browser back from the reader after chapter changes returns to the book, not an earlier chapter', async ({ page }) => {
    await tap(page.getByTestId('read'));
    await expect(page.getByTestId('reader-text')).toBeVisible();
    await tap(page.getByTestId('next-chapter'));
    await expect(page.locator('header h1')).toHaveText('The Moor · Two');
    await tap(page.getByTestId('next-chapter'));
    await expect(page.locator('header h1')).toHaveText('The Harbour · One');
    await page.goBack();
    await expect(page.getByTestId('book-coverage')).toBeVisible();
    await page.goForward();
    await expect(page.locator('header h1')).toHaveText('The Harbour · One');
  });

  test('changing the chapter in the URL while in the reader shows that chapter', async ({ page }) => {
    await tap(page.getByTestId('read'));
    await expect(page.locator('header h1')).toHaveText('The Moor · One');
    const id = page.url().split('#/read/')[1].split('/')[0];
    await page.evaluate((id) => { location.hash = `#/read/${id}/5`; }, id);
    await page.waitForTimeout(600);
    await expect(page.locator('header h1')).toHaveText('The Harbour · Two');
  });

  test('relaunch without a hash resumes in the reader (last route)', async ({ page }) => {
    await tap(page.getByTestId('read'));
    await tap(page.getByTestId('next-chapter'));
    await expect(page.locator('header h1')).toHaveText('The Moor · Two');
    await page.waitForTimeout(300);
    await page.goto('/');
    await expect(page.locator('header h1')).toHaveText('The Moor · Two');
  });

  test('a known word in the reader shows its state; reader after marking all words known', async ({ page }) => {
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    const row = page.getByTestId('word-row').first();
    const lemma = await row.getAttribute('data-word');
    await row.tap();
    console.log('sheet:', (await page.locator('.sheet, [role=dialog]').first().innerText().catch(() => '')).slice(0, 300));
    const known = page.getByRole('button', { name: /known/i }).first();
    if (await known.isVisible()) await known.tap();
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await tap(page.getByTestId('read'));
    await expect(page.getByTestId('reader-text')).toBeVisible();
    const w = page.getByTestId('reader-text').locator(`[data-c]`).filter({ hasText: new RegExp(`^${lemma}`, 'i') }).first();
    if (await w.count()) {
      await w.tap();
      console.log('card:', await page.getByTestId('reader-card').innerText());
    } else console.log('lemma not in chapter 2:', lemma);
  });
});
