import { expect, test } from '@playwright/test';
import { firstRun, importAndOpen, tap, tapCard, expectPhase } from './helpers';

/** The app speaks English or German (README §8.4); hard settings have an (i) with details. */

test('Settings › App language switches the app to German and back, and it stays after a reload', async ({ page }) => {
  await firstRun(page);
  await page.goto('/#/settings');
  await page.getByTestId('set-language').selectOption('de');
  await expect(page.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();
  await page.goto('/#/library');
  await expect(page.getByRole('heading', { name: 'Bibliothek' })).toBeVisible();
  await page.goto('/#/settings');
  await page.getByTestId('set-language').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test.describe('on a German device', () => {
  test.use({ locale: 'de-DE' });
  test('starts in German: first run, book, card and panel', async ({ page }) => {
    await page.goto('/?packs=test');
    await tap(page.getByRole('button', { name: 'Im Browser fortfahren' }));
    await tap(page.getByTestId('download-start'));
    await expect(page.getByTestId('check-intro')).toContainText('60 Wörter');
    await tap(page.getByRole('button', { name: 'Stufe selbst wählen' }));
    await tap(page.getByRole('button', { name: 'Stufe 5 übernehmen' }));
    await expect(page.getByRole('heading', { name: 'Bibliothek' })).toBeVisible();
    await importAndOpen(page);
    await expect(page.getByTestId('study-now')).toHaveText('Fürs Lesen vorbereiten');
    await tap(page.getByTestId('study-now'));
    await tap(page.getByTestId('quick-start'));
    await expect(page.getByTestId('card-word')).toBeVisible();
    await tapCard(page);
    await expectPhase(page, 'back');
    await expect(page.getByTestId('hint-right')).toContainText('gewusst');
    await page.getByTestId('grab').tap();
    await expect(page.getByTestId('panel').getByRole('button')).toHaveText(['Karte bearbeiten', 'Als bekannt markieren', 'Einstellungen', 'Sitzung abbrechen']);
  });
});

test('(i) on a hard setting shows its details and hides them again; the switch is not toggled', async ({ page }) => {
  await firstRun(page);
  await page.goto('/#/settings');
  const row = page.locator('label', { hasText: 'First-try correct' });
  const box = row.getByRole('checkbox');
  const before = await box.isChecked();
  await row.getByTestId('info').tap();
  await expect(row.getByTestId('info-text')).toContainText('you probably knew the word before');
  expect(await box.isChecked()).toBe(before);
  await row.getByTestId('info').tap();
  await expect(row.getByTestId('info-text')).toHaveCount(0);
  expect(await page.getByTestId('info').count()).toBeGreaterThanOrEqual(8);
  // the language names follow the word lists
  await expect(page.getByText('Use English definitions when no German translation exists')).toBeVisible();
});
