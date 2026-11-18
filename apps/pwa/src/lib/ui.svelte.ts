/** Toasts, banners and achievement pop-ups (G4): app-wide, queued. */
import type { AchievementUnlock } from '@vocabfirst/core';

export interface Toast { id: number; text: string; action?: { label: string; run: () => void }; ms: number }
export interface Banner { id: number; kind: 'achievement' | 'chapter'; title: string; subtitle?: string; tier?: string }

let nextId = 1;
/** achievements: Settings › Achievements and streaks (loaded at boot, kept in step by the Settings screen) */
export const ui = $state<{ toast?: Toast; banners: Banner[]; banner?: Banner; online: boolean; achievements: boolean }>({ banners: [], online: navigator.onLine, achievements: true });

window.addEventListener('online', () => (ui.online = true));
window.addEventListener('offline', () => (ui.online = false));

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, action?: Toast['action'], ms = 3000) {
  clearTimeout(toastTimer);
  const t = { id: nextId++, text, action, ms };
  ui.toast = t;
  toastTimer = setTimeout(() => { if (ui.toast?.id === t.id) ui.toast = undefined; }, ms);
}
export const hideToast = () => { ui.toast = undefined; };

export const BANNER_MS = 5000;
let showing = false;
let bannerTimer: ReturnType<typeof setTimeout> | undefined;
function pump() {
  if (showing) return;
  const b = ui.banners.shift();
  if (!b) return;
  showing = true;
  ui.banner = b;
  bannerTimer = setTimeout(dismissBanner, BANNER_MS);
}

/** ends the current pop-up early (tap) or on time; the next one follows */
export function dismissBanner() {
  clearTimeout(bannerTimer);
  ui.banner = undefined;
  showing = false;
  setTimeout(pump, 250);
}

export function banner(b: Omit<Banner, 'id'>) {
  ui.banners.push({ ...b, id: nextId++ });
  pump();
}

const TIER: Record<string, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
export function announceUnlocks(unlocks: AchievementUnlock[], enabled: boolean) {
  if (!enabled) return;
  for (const u of unlocks) {
    banner({ kind: 'achievement', title: `${u.name ?? u.achievementId}${u.tier && !u.achievementId.startsWith('ready:') ? ' · ' + TIER[u.tier] : ''}`,
      subtitle: u.description, tier: u.tier });
  }
}

/** "≈ 25 min", "≈ 1 h 20 min" */
export const duration = (min: number) => (min < 60 ? `≈ ${Math.max(1, min)} min` : `≈ ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`);
/** compact, for buttons: "14 min", "1 h 20" */
export const shortDuration = (min: number) => (min < 60 ? `${Math.max(1, min)} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ''}`);
export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)} %`;
export const fmt = (n: number) => n.toLocaleString('en-US');
