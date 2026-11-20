import { expect, test } from '@playwright/test';
import { firstRun, tap } from '../helpers';

const theme = (page: import('@playwright/test').Page) => page.locator('html');

test('a theme applies at once, survives a reload and "Like the device" follows the device', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await firstRun(page);
  await expect(theme(page)).toHaveAttribute('data-theme', 'light');
  await tap(page.getByRole('button', { name: 'Settings' }));
  await page.getByTestId('set-theme').selectOption('paper');
  await expect(theme(page)).toHaveAttribute('data-theme', 'paper');
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#f1e7d0');
  await page.reload();
  await expect(theme(page)).toHaveAttribute('data-theme', 'paper');
  await page.getByTestId('set-theme').selectOption('auto');
  await expect(theme(page)).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await page.getByTestId('set-theme').selectOption('black');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(theme(page)).toHaveAttribute('data-theme', 'black');
});
