import { expect, test } from '@playwright/test';
import { expectPhase, firstRun, importAndOpen, swipeLeft, swipeRight, swipeUp, tap, tapCard } from './helpers';

test('study a chosen chapter (I4); a relaunch resumes that session', async ({ page }) => {
  await firstRun(page);
  await importAndOpen(page);
  const harbourOne = page.getByTestId('chapter-row').filter({ hasText: 'One' }).nth(1);
  await tap(harbourOne);
  await expect(page.getByRole('dialog')).toContainText('The Harbour · One');
  await tap(page.getByTestId('study-chapter'));
  await expect(page.getByTestId('card-word')).toBeVisible();
  const w = await page.getByTestId('study-stage').getAttribute('data-word');
  // a word of that chapter (§7.3: words first seen earlier but still unlearned count too, e.g. "tempest")
  const harbourWords = `harbour harbor sailor coil rope gull whisper ephemeral glory youth scythe reaper loom brooding kindle courage
    voyage shelf cabin mouse goose encyclopedia captain ox melancholy navigation saunter deck wistful gaze horizon crew dwindle
    silence lurk shadow tempest gallant master ominous`.split(/\s+/);
  expect(harbourWords).toContain(w);
  expect(page.url()).toMatch(/#\/study\/[^/]+$/);
  await page.reload();
  await expect(page.getByTestId('study-stage')).toHaveAttribute('data-word', w!);
});

test('nothing due → study ahead (C9)', async ({ page }) => {
  await firstRun(page);
  await tap(page.getByRole('button', { name: 'Settings' }));
  await page.getByLabel('New cards per day').fill('1');
  await page.getByLabel('New cards per day').press('Tab');
  await tap(page.getByRole('button', { name: 'Back', exact: true }));
  await importAndOpen(page);
  await tap(page.getByTestId('study-now'));
  await expectPhase(page, 'front');
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeLeft(page);
  await expectPhase(page, 'front');   // the only card comes back at once (queue is empty)
  await tapCard(page);
  await expectPhase(page, 'back');
  await swipeRight(page);
  await expect(page.getByTestId('statistics')).toBeVisible();
  await tap(page.getByTestId('study-more'));
  await expect(page.getByTestId('nothing-due')).toBeVisible();
  await tap(page.getByRole('button', { name: 'Study ahead' }));
  await expect(page.getByTestId('card-word')).toBeVisible();
  await swipeUp(page);
  await tap(page.getByTestId('finish'));
  await expect(page.getByTestId('statistics')).toBeVisible();
});

test('changing the level offers to re-filter existing books (H4)', async ({ page }) => {
  await firstRun(page);
  await importAndOpen(page);
  await tap(page.getByRole('button', { name: 'Back to library' }));
  await expect(page.getByTestId('refilter-offer')).toHaveCount(0);
  await tap(page.getByRole('button', { name: 'Settings' }));
  await tap(page.getByRole('button', { name: 'Repeat the vocabulary check' }));
  await expect(page.getByTestId('check-counter')).toHaveText('1 / 60');
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    if (i < 59) await expect(page.getByTestId('check-counter')).toHaveText(`${i + 2} / 60`);
  }
  await expect(page.getByTestId('check-result')).toBeVisible();
  await tap(page.getByRole('button', { name: 'Use this' }));
  const offer = page.getByTestId('refilter-offer');
  await expect(offer).toContainText('The Lantern Omnibus');
  await tap(offer.getByRole('button', { name: 'Re-filter' }));
  await expect(page.getByTestId('toast')).toContainText('The Lantern Omnibus');
  await expect(offer).toHaveCount(0);
});
