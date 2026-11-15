/** Renders the PWA icons from favicon.svg with Playwright's Chromium (no image libraries needed). */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pub = fileURLToPath(new URL('../../apps/pwa/public/', import.meta.url));
const svg = readFileSync(pub + 'favicon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
mkdirSync(pub + 'splash', { recursive: true });
for (const [name, size, pad, round] of [['icon-192.png', 192, 0, true], ['icon-512.png', 512, 0, true], ['icon-maskable-512.png', 512, 0.12, false], ['apple-touch-icon.png', 180, 0, false]] as const) {
  const inner = round ? svg : svg.replace('rx="112"', 'rx="0"');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:#4f46e5;display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${size * (1 - pad * 2)}px;height:${size * (1 - pad * 2)}px">${inner.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
  await page.screenshot({ path: `${pub}icons/${name}`, omitBackground: round });
}
// iOS splash screens (README §9): iPhone 15 / 15 Pro and 15 Plus / Pro Max, light and dark
const splash = await browser.newPage({ deviceScaleFactor: 3 });
for (const [w, h] of [[393, 852], [430, 932]]) {
  for (const [mode, bg] of [['light', '#f6f5f2'], ['dark', '#101014']]) {
    await splash.setViewportSize({ width: w, height: h });
    await splash.setContent(`<html><body style="margin:0;background:${bg};display:grid;place-items:center;width:${w}px;height:${h}px">
      <div style="width:96px;height:96px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
    await splash.screenshot({ path: `${pub}splash/splash-${w}x${h}-${mode}.png` });
  }
}
await browser.close();
console.log('icons written');
