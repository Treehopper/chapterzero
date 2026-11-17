/** Tokenising (README §7.1 step 5). */

export interface RawWord { raw: string; index: number }
export interface Sentence { text: string; words: RawWord[] }

/** Word = letters/marks/digits, joined by inner apostrophes or hyphens; a trailing
 *  apostrophe only after "s" (plural possessive). Leading apostrophes are not part of a
 *  word because British dialogue uses single quotes. */
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’‐-][\p{L}\p{M}\p{N}]+)*(?:(?<=[sS])['’](?![\p{L}\p{N}]))?/gu;

let sentenceSegmenter: Intl.Segmenter | undefined;

export function splitSentences(text: string): string[] {
  sentenceSegmenter ??= new Intl.Segmenter('en', { granularity: 'sentence' });
  const out: string[] = [];
  for (const s of sentenceSegmenter.segment(text)) {
    const t = s.segment.trim();
    if (t) out.push(t);
  }
  return out;
}

export function words(text: string): RawWord[] {
  const out: RawWord[] = [];
  for (const m of text.matchAll(WORD)) out.push({ raw: m[0], index: m.index! });
  return out;
}

export function tokenizeBlock(text: string): Sentence[] {
  return splitSentences(text).map((s) => ({ text: s, words: words(s) }));
}

export type TokenKind = 'word' | 'digit' | 'contraction';

export interface NormalizedToken {
  kind: TokenKind;
  norm: string;
  /** written in capitals only, length ≥ 2 */
  allCaps: boolean;
  capitalized: boolean;
}

export function normalizeToken(raw: string): NormalizedToken {
  const nfc = raw.normalize('NFC').replace(/[’]/g, "'").replace(/‐/g, '-');
  const capitalized = /^\p{Lu}/u.test(nfc);
  const letters = nfc.replace(/[^\p{L}]/gu, '');
  const allCaps = letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  if (/\p{N}/u.test(nfc)) return { kind: 'digit', norm: nfc.toLowerCase(), allCaps, capitalized };
  let norm = nfc.toLowerCase();
  if (norm.endsWith("'s")) norm = norm.slice(0, -2);
  else if (norm.endsWith("s'")) norm = norm.slice(0, -1);
  if (norm.includes("'")) return { kind: 'contraction', norm, allCaps, capitalized };
  return { kind: 'word', norm, allCaps, capitalized };
}

export const wordCount = (text: string) => words(text).length;

/** Cut a sentence to at most `max` words around the word at char index `at`. */
export function cutAround(text: string, at: number, max = 25): string {
  const ws = words(text);
  if (ws.length <= max) return text;
  let i = ws.findIndex((w) => w.index >= at);
  if (i < 0) i = ws.length - 1;
  const start = Math.max(0, Math.min(i - Math.floor(max / 2), ws.length - max));
  const end = start + max - 1;
  const from = ws[start].index;
  const to = ws[end].index + ws[end].raw.length;
  return (start > 0 ? '…' : '') + text.slice(from, to) + (end < ws.length - 1 ? '…' : '');
}

const AMERICAN: [RegExp, string][] = [
  [/([a-z]{2})is(e|es|ed|ing|er|ers|ation|ations|able)$/, '$1iz$2'],   // realise → realize
  [/([a-z]{2})ys(e|es|ed|ing|er|ers)$/, '$1yz$2'],                       // analyse → analyze
  [/([a-z]{2})our(s|ed|ing|ful|less|able|ite|ites)?$/, '$1or$2'],        // colour → color
  [/([a-z]{2}[^aeiou])re(s|d)?$/, '$1er$2'],                             // centre → center
  [/([aeiou])ll(ed|ing|er|ers)$/, '$1l$2'],                              // travelled → traveled
];

/** American spellings to try for a word the word list doesn't know (British -ise, -our, -re, -lled…). */
export function americanVariants(t: string): string[] {
  const out = new Set<string>();
  for (const [re, to] of AMERICAN) if (re.test(t)) out.add(t.replace(re, to));
  return [...out];
}
