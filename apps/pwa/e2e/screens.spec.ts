/** Captures screens for visual review (test-results/shots). Run: npx playwright test screens */
import { test } from '@playwright/test';
import { expectPhase, firstRun, importAndOpen, studyNow, swipeLeft, swipeRight, swipeUp, tap, tapCard } from './helpers';

for (const scheme of ['light', 'dark'] as const) {
  test(`screenshots ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const shot = (n: string) => page.screenshot({ path: `test-results/shots/${scheme}-${n}.png` });
    await firstRun(page);
    await importAndOpen(page);
    await shot('book');
    await tap(page.getByTestId('study-now'));
    await page.getByTestId('start-study').waitFor();
    await page.waitForTimeout(300);
    await shot('start-study');
    await tap(page.getByTestId('quick-start'));
    await expectPhase(page, 'front');
    await shot('study-front');
    await tapCard(page); await expectPhase(page, 'back');
    await page.waitForTimeout(400);
    await shot('study-back');
    await swipeLeft(page); await expectPhase(page, 'front');
    await tapCard(page); await expectPhase(page, 'back');
    await swipeRight(page);
    await page.waitForTimeout(300);
    await swipeUp(page);
    await page.waitForTimeout(300);
    await shot('study-panel');
    await tap(page.getByTestId('finish'));
    await page.getByTestId('statistics').waitFor();
    await page.waitForTimeout(1200);
    await shot('stats');
    await tap(page.getByTestId('done'));
    await tap(page.getByRole('button', { name: 'Words', exact: true }));
    await page.getByTestId('word-row').first().waitFor();
    await shot('words');
    await tap(page.getByRole('button', { name: 'Back to the book' }));
    await tap(page.getByRole('button', { name: 'Back to library' }));
    await shot('library');
    await tap(page.getByRole('button', { name: 'Achievements' }));
    await page.getByTestId('achievement').first().waitFor();
    await shot('achievements');
  });
}
