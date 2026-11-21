import { expect, test } from '@playwright/test';
import { firstRun, importAndOpen, tap } from './helpers';

test.describe('reader (Epic R)', () => {
  test.beforeEach(async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
  });

  test('names: their own tab under Words; in the reader a tap shows where they first appear', async ({ page }) => {
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await tap(page.getByRole('tab', { name: /Names/ }));
    const first = page.getByTestId('word-row').first();
    await expect(first).toBeVisible();
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await tap(page.getByTestId('read'));
    const name = page.getByTestId('reader-text').locator('.nm').first();
    await expect(name).toBeVisible();
    const spelled = await name.innerText();
    await name.tap();
    const sheet = page.getByTestId('reader-name');
    await expect(sheet.getByRole('heading')).toHaveText(spelled);
    await expect(sheet.locator('.first').first().locator('b')).toHaveText(spelled);
  });

  test('read from the book page: card words underlined, tap one for its card, contents, position kept', async ({ page }) => {
    await tap(page.getByTestId('read'));
    await expect(page.getByTestId('reader')).toBeVisible();
    const text = page.getByTestId('reader-text');
    await expect(text).toContainText('moor');
    const word = text.locator('.w.active').first();
    await expect(word).toBeVisible();
    await word.tap();
    await expect(page.getByTestId('reader-card')).toContainText('learning');
    await expect(page.getByTestId('reader-card').getByRole('link', { name: 'Wiktionary ↗' })).toBeVisible();
    await page.touchscreen.tap(10, 10);   // tap outside closes the sheet
    await expect(page.getByTestId('reader-card')).toHaveCount(0);
    // another chapter from the contents; a reload comes back to it
    await tap(page.getByTestId('contents'));
    const rows = page.getByTestId('toc-row');
    const title = await rows.nth(2).innerText();
    await tap(rows.nth(2));
    await expect(page.locator('header h1')).toHaveText(title);
    await page.reload();
    await expect(page.locator('header h1')).toHaveText(title);
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await tap(page.getByTestId('read'));
    await expect(page.locator('header h1')).toHaveText(title);
  });

  test('achievements list the book first', async ({ page }) => {
    await tap(page.getByRole('button', { name: 'Back to library' }));
    await tap(page.getByRole('button', { name: 'Achievements' }));
    await expect(page.getByTestId('achievement').first()).toContainText('The Lantern Omnibus');
  });
});
