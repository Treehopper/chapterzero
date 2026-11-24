/**
 * The app's own language (README §8.4): English or German, following the device unless
 * Settings › Language says otherwise. Texts are keyed by their English wording, so a
 * missing translation shows the English text; messages from the core arrive in English
 * and go through `t` the same way.
 */
import { isRtl } from '@chapterzero/core';
import { de } from './de';

export type Locale = 'en' | 'de';
export type UiLanguage = 'auto' | Locale;

const deviceLocale = (): Locale => ((navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase().startsWith('de') ? 'de' : 'en');

export const i18n = $state<{ locale: Locale }>({ locale: deviceLocale() });

export function setUiLanguage(l: UiLanguage | undefined) {
  i18n.locale = !l || l === 'auto' ? deviceLocale() : l;
  document.documentElement.lang = i18n.locale;
}

type Params = Record<string, string | number>;
const fill = (s: string, p?: Params) => (p ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m)) : s);

/** `t('{n} cards at level {level}', { n, level })` */
export function t(en: string, params?: Params): string {
  return fill(i18n.locale === 'de' ? de[en] ?? en : en, params);
}

/** singular or plural by n; both forms are keys: `tn(n, '{n} day', '{n} days')` */
export function tn(n: number, one: string, other: string, params?: Params): string {
  return t(n === 1 ? one : other, { n: fmt(n), ...params });
}

/** "1,234" / "1.234" */
export const fmt = (n: number) => n.toLocaleString(i18n.locale === 'de' ? 'de-DE' : 'en-US');
/** "12.5 %" / "12,5 %" */
export const pct = (x: number, digits = 1) =>
  `${(x * 100).toLocaleString(i18n.locale === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;

/** a language's name in the app's language: "German" / "Deutsch" */
export function languageName(code: string | undefined): string {
  if (!code) return '';
  try { return new Intl.DisplayNames([i18n.locale], { type: 'language' }).of(code) ?? code; } catch { return code; }
}

/** lang and dir for text in a book's or a translation's language (right-to-left scripts mirror) */
export const textAttrs = (code: string) => ({ lang: code, dir: (isRtl(code) ? 'rtl' : 'ltr') as 'rtl' | 'ltr' });
