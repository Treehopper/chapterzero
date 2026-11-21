import { expect, test } from '@playwright/test';
import { expectPhase, firstRun, importAndOpen, startStudy, swipeLeft, swipeUp, tap, tapCard } from '../helpers';

test('"Update with the current word lists" keeps practised cards; with unchanged lists nothing changes', async ({ page }) => {
  await firstRun(page);
  await importAndOpen(page);
  await expect(page.getByTestId('lists-changed')).toHaveCount(0);       // just imported with these lists
  await startStudy(page);
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeLeft(page);                                                 // one practised card
  await swipeUp(page);
  await tap(page.getByTestId('finish'));
  await tap(page.getByTestId('done'));
  const before = await page.getByTestId('book-eta').innerText();
  await tap(page.getByRole('button', { name: 'Book options' }));
  await tap(page.getByTestId('menu-update-book'));
  await expect(page.getByTestId('toast')).toHaveText('Book updated: 0 new, 0 removed, 0 with new translations');
  await expect(page.getByTestId('book-eta')).toHaveText(before);
});
