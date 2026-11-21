import { expect, test } from '@playwright/test';
import { expectPhase, firstRun, importAndOpen, settled, studyNow, swipeLeft, swipeRight, swipeUp, tap, tapCard } from './helpers';

test('study a chosen chapter (I4); a relaunch resumes that session', async ({ page }) => {
  await firstRun(page);
  await importAndOpen(page);
  const harbourOne = page.getByTestId('chapter-row').filter({ hasText: 'One' }).nth(1);
  await tap(harbourOne);
  await expect(page.getByRole('dialog')).toContainText('The Harbour · One');
  await expect(page.getByRole('dialog')).toContainText(/% of the words known/);
  await expect(page.getByRole('dialog')).toContainText(/100 % = all \d+ cards learned/);
  await tap(page.getByTestId('study-chapter'));
  await expect(page.getByTestId('start-chapter')).toHaveText('The Harbour · One');
  await tap(page.getByTestId('quick-start'));
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

test('chapter study takes the same start options; its open session is continued (I4, C19)', async ({ page }) => {
  await firstRun(page);
  await importAndOpen(page);
  const harbourOne = page.getByTestId('chapter-row').filter({ hasText: 'One' }).nth(1);
  await tap(harbourOne);
  await tap(page.getByTestId('study-chapter'));
  await expect(page.getByTestId('start-study')).toContainText('Get this chapter ready');
  await tap(page.getByTestId('start-cards-10'));
  await expect(page.getByTestId('progress')).toHaveText(/^\s*0 \/ 10$/);
  expect(page.url()).toMatch(/#\/study\/[^/]+$/);
  await page.goBack();
  await tap(harbourOne);
  await expect(page.getByTestId('study-chapter')).toHaveText('Continue · 0 / 10');
  await tap(page.getByTestId('study-chapter'));
  await expect(page.getByTestId('start-study')).toHaveCount(0);
  await expect(page.getByTestId('progress')).toHaveText(/^\s*0 \/ 10$/);
  // another chapter still asks
  await page.goBack();
  await tap(page.getByTestId('chapter-row').filter({ hasText: 'One' }).first());
  await tap(page.getByTestId('study-chapter'));
  await expect(page.getByTestId('start-study')).toBeVisible();
});

test('nothing due → study ahead (C9)', async ({ page }) => {
  test.setTimeout(120_000);
  await firstRun(page);
  await importAndOpen(page);
  await studyNow(page);
  // Quick start goes on until the book is ready: every card retired at first sight
  for (let i = 0; i < 60 && !(await page.getByTestId('statistics').count()); i++) {
    await expectPhase(page, 'front');
    await tapCard(page);
    await expectPhase(page, 'back');
    await swipeRight(page);
    await settled(page).catch(() => {});
    if (await page.getByTestId('banner').count()) await page.getByTestId('banner').tap().catch(() => {});
  }
  await expect(page.getByTestId('statistics')).toBeVisible();
  await studyNow(page, 'study-more');
  await expect(page.getByTestId('nothing-due')).toBeVisible();
  await tap(page.getByRole('button', { name: 'Get ahead' }));
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
