import { networkInterfaces } from 'node:os';
import { expect, test } from '@playwright/test';
import { firstRun, importAndOpen, settled, startStudy, swipeRight, tapCard } from './helpers';

/** A non-loopback IPv4 address of this machine: plain http there is not a secure context. */
const lan = Object.values(networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal)?.address;

// An iPhone on the LAN opens http://<mac>:4173, where Safari has neither crypto.subtle nor
// crypto.randomUUID. Pack checksums and ids must work without them.
test.use({ baseURL: lan ? `http://${lan}:4173` : undefined });

test('works over plain http on the LAN (no secure context) @android', async ({ page }) => {
  test.skip(!lan, 'no LAN address');
  await firstRun(page);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  await importAndOpen(page);
  await startStudy(page);
  await tapCard(page);
  await swipeRight(page);
  await settled(page);
});
