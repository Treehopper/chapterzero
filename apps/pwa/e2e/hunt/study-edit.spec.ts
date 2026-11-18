import { expect, test, type Page } from '@playwright/test';
import { cardWord, expectCard, expectPhase, firstRun, importAndOpen, settled, startStudy, swipeUp, tap, tapCard } from '../helpers';

const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  await firstRun(page);
  await importAndOpen(page);
  await startStudy(page);
});
test.afterEach(() => { expect(errors, 'console errors').toEqual([]); });

const back = (page: Page) => page.getByTestId('card-back');

async function openEdit(page: Page) {
  await swipeUp(page);
  await tap(page.getByRole('button', { name: 'Edit card' }));
  await expect(page.getByTestId('save-edit')).toBeVisible();
}

test('save with no translation and no definition: the sheet stays open with an error, edits are not lost', async ({ page }) => {
  const w = await cardWord(page);
  await openEdit(page);
  const removes = page.getByRole('button', { name: 'Remove translation' });
  while (await removes.count()) await tap(removes.first());
  await page.getByTestId('edit-definition').fill('');
  await tap(page.getByTestId('save-edit'));
  await expect(page.getByTestId('toast')).toContainText('needs a translation or a definition');
  await expect(page.getByTestId('save-edit')).toBeVisible();     // still editing
  await expectCard(page, w);
});

test('save with blank translations but a definition: the back shows the definition', async ({ page }) => {
  const w = await cardWord(page);
  await openEdit(page);
  const removes = page.getByRole('button', { name: 'Remove translation' });
  while (await removes.count()) await tap(removes.first());
  await page.getByTestId('edit-definition').fill('My own definition.');
  await tap(page.getByTestId('save-edit'));
  await settled(page);
  await expectCard(page, w, 'front');
  await tapCard(page);
  await expect(back(page)).toContainText('My own definition.');
  await expect(back(page)).toContainText('EN');
});

test('whitespace-only translations are dropped; a duplicate is dropped', async ({ page }) => {
  await openEdit(page);
  const removes = page.getByRole('button', { name: 'Remove translation' });
  while ((await removes.count()) > 1) await tap(removes.first());
  await page.getByLabel('Translation 1', { exact: true }).fill('  eins ');
  await tap(page.getByRole('button', { name: '＋ Add translation' }));
  await page.getByLabel('Translation 2', { exact: true }).fill('   ');
  await tap(page.getByRole('button', { name: '＋ Add translation' }));
  await page.getByLabel('Translation 3', { exact: true }).fill('eins');
  await tap(page.getByTestId('save-edit'));
  await settled(page);
  await tapCard(page);
  await expect(back(page)).toHaveText('eins');
});

test('Cancel discards edits; reopening shows the saved values', async ({ page }) => {
  await openEdit(page);
  const t1 = page.getByLabel('Translation 1', { exact: true });
  const before = await t1.inputValue();
  await t1.fill('verworfen');
  await tap(page.getByRole('button', { name: 'Cancel', exact: true }));
  await expect(page.getByTestId('save-edit')).toHaveCount(0);
  await openEdit(page);
  await expect(page.getByLabel('Translation 1', { exact: true })).toHaveValue(before);
  await tap(page.getByRole('button', { name: 'Cancel', exact: true }));
});

test('edit keeps the side: on the back, saving keeps the back; the edit sheet blocks study keys', async ({ page }) => {
  const w = await cardWord(page);
  await tapCard(page);
  await expectPhase(page, 'back');
  await openEdit(page);
  await page.keyboard.press('ArrowRight');       // must not grade
  await page.keyboard.press('Space');            // must not flip
  await page.getByLabel('Translation 1', { exact: true }).fill('bleibt');
  await tap(page.getByTestId('save-edit'));
  await settled(page);
  await expectCard(page, w, 'back');
  await expect(back(page)).toContainText('bleibt');
});

test('part of speech chips: switching twice and back keeps the original translations', async ({ page }) => {
  expect(await cardWord(page)).toBe('moor');
  await openEdit(page);
  await expect(page.getByTestId('sense-noun')).toHaveAttribute('aria-checked', 'true');
  const orig = await page.getByLabel('Translation 1', { exact: true }).inputValue();
  await tap(page.getByTestId('sense-verb'));
  await tap(page.getByTestId('sense-noun'));
  await expect(page.getByLabel('Translation 1', { exact: true })).toHaveValue(orig);
  await tap(page.getByTestId('save-edit'));
  await settled(page);
  await expect(page.getByTestId('card-word')).toHaveText('moor');
});

test('reorder then remove the moved translation: the right one is removed', async ({ page }) => {
  expect(await cardWord(page)).toBe('moor');
  await openEdit(page);
  await tap(page.getByTestId('sense-verb'));       // the verb sense has four translations
  const vals = async () => {
    const n = await page.getByRole('textbox', { name: /^Translation \d$/ }).count();
    const out: string[] = [];
    for (let i = 1; i <= n; i++) out.push(await page.getByLabel(`Translation ${i}`, { exact: true }).inputValue());
    return out;
  };
  const v0 = await vals();
  expect(v0.length).toBeGreaterThanOrEqual(3);
  await tap(page.getByRole('button', { name: 'Move translation 3 up' }));
  const v1 = await vals();
  expect(v1[1]).toBe(v0[2]);
  expect(v1[2]).toBe(v0[1]);
  await tap(page.getByRole('button', { name: 'Remove translation' }).nth(1));
  const v2 = await vals();
  expect(v2).toEqual([v0[0], v0[1], ...v0.slice(3)]);
  await tap(page.getByTestId('save-edit'));
  await settled(page);
  await tapCard(page);
  await expect(back(page)).toHaveText(v2.join(', '));
});
