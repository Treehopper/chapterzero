/** Tokenising (README §7.1 step 5). */
import { languageRules, type LanguageRules } from './language.ts';

export interface RawWord { raw: string; index: number }
export interface Sentence { text: string; words: RawWord[] }

/** Word = letters/marks/digits, joined by inner apostrophes or hyphens; a trailing
 *  apostrophe only after "s" (plural possessive). Leading apostrophes are not part of a
 *  word because British dialogue uses single quotes. */
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’‐-][\p{L}\p{M}\p{N}]+)*(?:(?<=[sS])['’](?![\p{L}\p{N}]))?/gu;

const segmenters = new Map<string, Intl.Segmenter>();
const segmenter = (lang: string, granularity: 'sentence' | 'word') => {
  const k = `${lang}/${granularity}`;
  let s = segmenters.get(k);
  if (!s) segmenters.set(k, (s = new Intl.Segmenter(lang, { granularity })));
  return s;
};
const EN = languageRules('en');

export function splitSentences(text: string, lang: LanguageRules = EN): string[] {
  const out: string[] = [];
  for (const s of segmenter(lang.code, 'sentence').segment(text)) {
    const t = s.segment.trim();
    if (t) out.push(t);
  }
  return out;
}

/** languages written without spaces between words get them from Intl.Segmenter */
export function words(text: string, lang: LanguageRules = EN): RawWord[] {
  const out: RawWord[] = [];
  if (lang.segmented) {
    for (const s of segmenter(lang.code, 'word').segment(text)) if (s.isWordLike) out.push({ raw: s.segment, index: s.index });
    return out;
  }
  for (const m of text.matchAll(WORD)) out.push({ raw: m[0], index: m.index! });
  return out;
}

export function tokenizeBlock(text: string, lang: LanguageRules = EN): Sentence[] {
  return splitSentences(text, lang).map((s) => ({ text: s, words: words(s, lang) }));
}

export type TokenKind = 'word' | 'digit' | 'contraction';

export interface NormalizedToken {
  kind: TokenKind;
  norm: string;
  /** written in capitals only, length ≥ 2 */
  allCaps: boolean;
  capitalized: boolean;
}

export function normalizeToken(raw: string, lang: LanguageRules = EN): NormalizedToken {
  const nfc = raw.normalize('NFC').replace(/[’]/g, "'").replace(/‐/g, '-');
  const capitalized = /^\p{Lu}/u.test(nfc);
  const letters = nfc.replace(/[^\p{L}]/gu, '');
  const allCaps = letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  if (/\p{N}/u.test(nfc)) return { kind: 'digit', norm: nfc.toLowerCase(), allCaps, capitalized };
  let norm = nfc.toLowerCase();
  // elsewhere an apostrophe elides a short word in front ("l'homme", "dell'anno"): the word is what follows
  if (lang.code !== 'en') return { kind: 'word', norm: norm.slice(norm.lastIndexOf("'") + 1), allCaps, capitalized };
  if (norm.endsWith("'s")) norm = norm.slice(0, -2);
  else if (norm.endsWith("s'")) norm = norm.slice(0, -1);
  if (norm.includes("'")) return { kind: 'contraction', norm, allCaps, capitalized };
  return { kind: 'word', norm, allCaps, capitalized };
}

export const wordCount = (text: string, lang: LanguageRules = EN) => words(text, lang).length;

/** Cut a sentence to at most `max` words around the word at char index `at`. */
export function cutAround(text: string, at: number, lang: LanguageRules = EN, max = 25): string {
  const ws = words(text, lang);
  if (ws.length <= max) return text;
  let i = ws.findIndex((w) => w.index >= at);
  if (i < 0) i = ws.length - 1;
  const start = Math.max(0, Math.min(i - Math.floor(max / 2), ws.length - max));
  const end = start + max - 1;
  const from = ws[start].index;
  const to = ws[end].index + ws[end].raw.length;
  return (start > 0 ? '…' : '') + text.slice(from, to) + (end < ws.length - 1 ? '…' : '');
}
