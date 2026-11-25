/** Colour themes: `data-theme` on <html> picks the tokens in app.css. 'auto' follows the device (light or dark).
    The choice is mirrored to localStorage so index.html can set it before the first paint. */
import type { Settings } from '@chapterzero/core';

export type Theme = Settings['theme'];
const dark = () => matchMedia('(prefers-color-scheme: dark)');
let current: Theme = 'auto';
let listening = false;

/** Safari tints its bars and the strip outside a home-screen app from theme-color: keep it on the page's background. */
function syncThemeColor() {
  const root = document.documentElement;
  const bg = getComputedStyle(root).getPropertyValue(root.classList.contains('on-stage') ? '--stage' : '--bg').trim();
  if (bg) for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) m.content = bg;
}

/** Action for a full-screen stage: while it is shown, the page background around it (html, body) is the stage colour. */
export function stage(_node: HTMLElement) {
  document.documentElement.classList.add('on-stage');
  syncThemeColor();
  return { destroy() { document.documentElement.classList.remove('on-stage'); syncThemeColor(); } };
}

export function applyTheme(theme: Theme | undefined) {
  current = theme ?? 'auto';
  const resolved = current === 'auto' ? (dark().matches ? 'dark' : 'light') : current;
  document.documentElement.dataset.theme = resolved;
  syncThemeColor();
  try { localStorage.setItem('c0:theme', current); } catch { /* private mode: the first paint follows the device */ }
  if (!listening) {
    listening = true;
    dark().addEventListener('change', () => { if (current === 'auto') applyTheme('auto'); });
  }
}
