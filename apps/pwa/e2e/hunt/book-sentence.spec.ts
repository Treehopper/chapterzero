import { expect, test, type Page } from '@playwright/test';
import { firstRun, importAndOpen, startStudy, tap } from '../helpers';

test.beforeEach(async ({ page }) => {
  await firstRun(page);
  await importAndOpen(page);
});

// both sides of the card are in the page: the front's sentence is .ex, the back's .ex.small
const front = (page: Page) => page.getByTestId('study-stage').locator('.ex:not(.small)');
const back = (page: Page) => page.getByTestId('study-stage').locator('.ex.small');

test('the first "Get ready" warns about spoilers; turning the sentence off there hides it on cards and Words', async ({ page }) => {
  const bookId = page.url().split('#/book/')[1];
  await tap(page.getByTestId('study-now'));
  await expect(page.getByTestId('spoiler-warning')).toContainText('Spoiler alert');
  await page.getByTestId('spoiler-sentence').selectOption('off');
  await tap(page.getByTestId('quick-start'));
  await expect(page.getByTestId('card-word')).toBeVisible();
  await expect(front(page)).toHaveCount(0);
  await expect(back(page)).toHaveCount(0);
  // shown once only
  await page.goBack();
  await tap(page.getByTestId('study-now'));
  await expect(page.getByTestId('card-word').or(page.getByTestId('quick-start')).first()).toBeVisible();
  await expect(page.getByTestId('spoiler-warning')).toHaveCount(0);
  await page.goto(`/#/words/${bookId}`);
  await expect(page.getByTestId('word-row').first()).toBeVisible();
  await expect(page.getByTestId('word-row').locator('.ex')).toHaveCount(0);
});

test('"Back only" keeps the sentence off the front', async ({ page }) => {
  await startStudy(page);
  await expect(front(page)).toHaveCount(1);           // default: both sides
  await expect(back(page)).toHaveCount(1);
  await page.goto('/#/settings');
  await page.getByTestId('set-sentence').selectOption('back');
  await page.goBack();
  await page.goto('/#/library');
  await tap(page.getByTestId('book-tile').getByRole('button', { name: /Open/ }));
  await startStudy(page);
  await expect(page.getByTestId('spoiler-warning')).toHaveCount(0);
  await expect(front(page)).toHaveCount(0);
  await expect(back(page)).toHaveCount(1);
});
