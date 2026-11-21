import { expect, test } from '@playwright/test';
import { expectPhase, firstRun, importAndOpen, startStudy, tap } from './helpers';

test.use({ serviceWorkers: 'allow' });

test('the installed app shell and data work offline; links are greyed out (A2, C16)', async ({ page, context }) => {
  await firstRun(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await importAndOpen(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('book-coverage')).toBeVisible();
  await startStudy(page);
  await expectPhase(page, 'front');
  await page.keyboard.press('Space');
  await expectPhase(page, 'back');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('offline — lookup links need a connection')).toBeVisible();
  // without a connection the anchors lose their href (and with it the link role)
  await expect(page.getByRole('link', { name: 'Wiktionary ↗' })).toHaveCount(0);
  await expect(page.getByText('Wiktionary ↗')).toHaveAttribute('aria-disabled', 'true');
  await context.setOffline(false);
  await tap(page.getByTestId('study-stage'));
});
