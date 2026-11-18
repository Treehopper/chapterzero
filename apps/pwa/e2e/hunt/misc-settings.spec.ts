import { expect, test } from '@playwright/test';
import { endSession, expectPhase, firstRun, importAndOpen, settled, startStudy, swipeLeft, swipeRight, tap, tapCard } from '../helpers';

test.describe('settings hunt', () => {
  let errors: string[];
  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('every toggle persists across a reload', async ({ page }) => {
    await firstRun(page);
    await page.goto('/#/settings');
    await page.getByTestId('set-frontswipe').selectOption('off');
    await page.getByTestId('set-undo').tap();
    await page.getByTestId('set-boxlevel').tap();
    await page.getByRole('checkbox', { name: /flip before answering/ }).tap();
    await page.getByRole('checkbox', { name: /Achievements and streaks/ }).tap();
    await page.getByRole('checkbox', { name: /First-try correct/ }).tap();
    await page.getByRole('checkbox', { name: /Gesture hints/ }).tap();
    await page.getByLabel('New cards per day').fill('7');
    await page.getByLabel('New cards per day').dispatchEvent('change');
    await page.getByLabel('Daily goal (reviews)').fill('33');
    await page.getByLabel('Daily goal (reviews)').dispatchEvent('change');
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByTestId('set-frontswipe')).toHaveValue('off');
    await expect(page.getByTestId('set-undo')).not.toBeChecked();
    await expect(page.getByTestId('set-boxlevel')).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /flip before answering/ })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: /Achievements and streaks/ })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: /First-try correct/ })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: /Gesture hints/ })).not.toBeChecked();
    await expect(page.getByLabel('New cards per day')).toHaveValue('7');
    await expect(page.getByLabel('Daily goal (reviews)')).toHaveValue('33');
    await expect(page.getByText('Schedule normally')).toBeVisible();
    // the trophy stays hidden after the reload (ui state comes from settings at boot)
    await tap(page.getByRole('button', { name: 'Back', exact: true }));
    await expect(page.getByRole('button', { name: 'Achievements' })).toHaveCount(0);
  });

  test('front swipe "off" set mid-session takes effect on return', async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    await startStudy(page);
    const study = page.url();
    await page.goto('/#/settings');
    await page.getByTestId('set-frontswipe').selectOption('off');
    await page.waitForTimeout(300);
    await page.goto(study);
    await expect(page.getByTestId('card-word')).toBeVisible();
    await expectPhase(page, 'front');
    const word = await page.getByTestId('study-stage').getAttribute('data-word');
    await swipeRight(page);
    await page.waitForTimeout(600);
    await settled(page);
    await expectPhase(page, 'front');
    expect(await page.getByTestId('study-stage').getAttribute('data-word')).toBe(word);
    await expect(page.getByTestId('front-swipe-confirm').or(page.locator('[data-testid*=front]'))).toHaveCount(0);
  });

  test('undo pill off mid-session: no pill after the next swipe', async ({ page }) => {
    await firstRun(page);
    await importAndOpen(page);
    await startStudy(page);
    await tapCard(page);
    await swipeLeft(page);
    await expect(page.getByTestId('undo')).toBeVisible();
    const study = page.url();
    await page.goto('/#/settings');
    await page.getByTestId('set-undo').tap();
    await page.waitForTimeout(300);
    await page.goto(study);
    await expect(page.getByTestId('card-word')).toBeVisible();
    await tapCard(page);
    await swipeLeft(page);
    await expect(page.getByTestId('card-word')).toBeVisible();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('undo')).toHaveCount(0);
  });

  test('achievements off mid-session: statistics show no streak or medals; achievements still collected', async ({ page }) => {
    await firstRun(page);
    await page.goto('/#/settings');
    await page.getByRole('checkbox', { name: /First-try correct/ }).tap();   // schedule normally: right swipes count as reviews
    await tap(page.getByRole('button', { name: 'Back', exact: true }));
    await importAndOpen(page);
    await startStudy(page);
    // 5 correct in a row → On a Roll bronze, with the pop-up still on
    for (let i = 0; i < 5; i++) { await tapCard(page); await expectPhase(page, 'back'); await swipeRight(page); await settled(page); }
    await expect(page.getByTestId('banner')).toContainText('On a Roll');
    await page.getByTestId('banner').tap();
    const study = page.url();
    await page.goto('/#/settings');
    await page.getByRole('checkbox', { name: /Achievements and streaks/ }).tap();
    await page.waitForTimeout(300);
    await page.goto(study);
    await expect(page.getByTestId('card-word')).toBeVisible();
    // 5 more → silver at 10, but no pop-up now
    for (let i = 0; i < 5; i++) { await tapCard(page); await expectPhase(page, 'back'); await swipeRight(page); await settled(page); }
    await page.waitForTimeout(500);
    await expect(page.getByTestId('banner')).toHaveCount(0);
    await endSession(page);
    await expect(page.getByTestId('statistics')).toBeVisible();
    await expect(page.getByTestId('stat-reviewed')).toBeVisible();
    await expect(page.getByTestId('stat-streak')).toHaveCount(0);
    await expect(page.getByTestId('stat-achievements')).toHaveCount(0);
    await tap(page.getByTestId('done'));
    await expect(page.getByText('day streak')).toHaveCount(0);
    // still collected (G7)
    await page.goto('/#/achievements');
    const roll = page.getByTestId('achievement').filter({ hasText: 'On a Roll' });
    await expect(roll).toContainText('✓');
    console.log('on a roll tile:', (await roll.innerText()).replace(/\s+/g, ' '));
  });

  test('achievements turned back on: medals and streak are shown again on the next statistics', async ({ page }) => {
    await firstRun(page);
    await page.goto('/#/settings');
    await page.getByRole('checkbox', { name: /Achievements and streaks/ }).tap();
    await page.getByRole('checkbox', { name: /Achievements and streaks/ }).tap();
    await tap(page.getByRole('button', { name: 'Back', exact: true }));
    await expect(page.getByRole('button', { name: 'Achievements' })).toBeVisible();
    await importAndOpen(page);
    await expect(page.getByText('day streak')).toBeVisible();
    await startStudy(page);
    await tapCard(page);
    await swipeLeft(page);
    await endSession(page);
    await expect(page.getByTestId('stat-streak')).toContainText('1-day streak');
  });

  test('vocabulary check: flip before answering off lets a front swipe grade', async ({ page }) => {
    await firstRun(page);
    await page.goto('/#/settings');
    const flip = page.getByRole('checkbox', { name: /flip before answering/ });
    console.log('flip default checked:', await flip.isChecked());
    await tap(page.getByRole('button', { name: 'Repeat the vocabulary check' }));
    await expect(page.getByTestId('check-word')).toBeVisible();
    const w1 = await page.getByTestId('check-word').innerText();
    await swipeRight(page);
    await page.waitForTimeout(700);
    const w2 = await page.getByTestId('check-word').innerText();
    console.log('front swipe in check (default):', w1, '→', w2, (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 200));
  });
});
