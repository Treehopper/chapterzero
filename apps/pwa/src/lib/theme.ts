/** Colour themes: `data-theme` on <html> picks the tokens in app.css. 'auto' follows the device (light or dark).
    The choice is mirrored to localStorage so index.html can set it before the first paint. */
import type { Settings } from '@chapterzero/core';

export type Theme = Settings['theme'];
const dark = () => matchMedia('(prefers-color-scheme: dark)');
let current: Theme = 'auto';
let listening = false;

export function applyTheme(theme: Theme | undefined) {
  current = theme ?? 'auto';
  const resolved = current === 'auto' ? (dark().matches ? 'dark' : 'light') : current;
  document.documentElement.dataset.theme = resolved;
  // Safari tints its bars from theme-color
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (bg) for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) m.content = bg;
  try { localStorage.setItem('c0:theme', current); } catch { /* private mode: the first paint follows the device */ }
  if (!listening) {
    listening = true;
    dark().addEventListener('change', () => { if (current === 'auto') applyTheme('auto'); });
  }
}
