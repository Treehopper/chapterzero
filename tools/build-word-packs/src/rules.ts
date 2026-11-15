/** Pure build rules of README §6.3 / §6.4, unit-tested in rules.test.ts. */

export const ALLOWED_POS = new Set(['noun', 'verb', 'adj', 'adv', 'intj', 'prep', 'conj', 'pron', 'det', 'num']);

export const COMMON_MAX_RANK = 1000;
export const LIST_MAX_RANK = 100_000;

/** Headwords containing spaces, digits or apostrophes are dropped (rule 1). Uppercase
 *  headwords are proper-noun-like ("English", "Paris") and are dropped as well, because
 *  everything in the packs is lowercase and the book matcher treats capitalised words
 *  as names anyway. */
export function isUsableHeadword(word: string): boolean {
  if (!word || /[\s\d'’]/.test(word)) return false;
  if (word !== word.toLowerCase()) return false;
  if (!/^\p{L}[\p{L}\p{M}-]*$/u.test(word)) return false;
  if (word.startsWith('-') || word.endsWith('-')) return false;
  return true;
}

export function normWord(word: string): string {
  return word.normalize('NFC').toLowerCase();
}

/** A form string the phone could ever look up: a single word, letters and hyphens only. */
export function isUsableForm(form: string): boolean {
  return /^\p{L}[\p{L}\p{M}-]*$/u.test(form) && !form.endsWith('-');
}

const SPELLING_OF = /^(?:[\p{L} ,()-]{0,60}?\b)?(?:spelling|form) of ([\p{L}-]+)\.?$/u;

/** Some alternative-spelling senses carry no `alt_of` field ("Commonwealth standard
 *  spelling of color."). Returns the target if the gloss is just such a pointer. */
export function spellingOfTarget(gloss: string): string | undefined {
  const g = gloss.trim();
  if (g.split(/\s+/).length > 9) return undefined;
  const m = SPELLING_OF.exec(g);
  if (!m) return undefined;
  if (!/(standard|alternative|spelling|obsolete|archaic|dated|variant|rare|nonstandard|eye dialect)/i.test(g)) return undefined;
  return m[1];
}

/** Cut at `max` characters on a word boundary (rule 3). */
export function cutDefinition(def: string, max = 140): string {
  const d = def.replace(/\s+/g, ' ').trim();
  if (d.length <= max) return d;
  const cut = d.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[,;:\s]+$/, '') + '…';
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function normGerman(t: string): string {
  return t
    .toLowerCase()
    .trim()
    .replace(/^(der|die|das) /, '')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss');
}

export function similarity(a: string, b: string): number {
  const m = Math.max(a.length, b.length);
  return m === 0 ? 1 : 1 - levenshtein(a, b) / m;
}

/** Rule 7: nearly identical to one of the first three German translations. */
export function isCognate(lemma: string, de: string[]): boolean {
  return de.slice(0, 3).some((t) => similarity(lemma, normGerman(t)) >= 0.8);
}

const CONSONANT = /[bcdfghjklmnpqrstvwxz]/;

/** §6.4 fallback: regular forms by rule, no consonant doubling. */
export function regularForms(lemma: string, pos: string): string[] {
  const out: string[] = [];
  const last = lemma.slice(-1);
  const beforeLast = lemma.slice(-2, -1);
  const sibilant = /(s|x|z|ch|sh)$/.test(lemma);
  const yAfterConsonant = last === 'y' && CONSONANT.test(beforeLast);
  const plural = sibilant ? lemma + 'es' : yAfterConsonant ? lemma.slice(0, -1) + 'ies' : lemma + 's';
  if (pos === 'noun') out.push(plural);
  if (pos === 'verb') {
    out.push(plural);
    out.push(last === 'e' ? lemma + 'd' : yAfterConsonant ? lemma.slice(0, -1) + 'ied' : lemma + 'ed');
    out.push(last === 'e' && !/(ee|ye|oe)$/.test(lemma) ? lemma.slice(0, -1) + 'ing' : lemma + 'ing');
  }
  if (pos === 'adj') {
    out.push(last === 'e' ? lemma + 'r' : yAfterConsonant ? lemma.slice(0, -1) + 'ier' : lemma + 'er');
    out.push(last === 'e' ? lemma + 'st' : yAfterConsonant ? lemma.slice(0, -1) + 'iest' : lemma + 'est');
  }
  return out;
}

/** Inflection-table noise in Wiktextract `forms`. */
const BAD_FORM_TAGS = new Set(['table-tags', 'inflection-template', 'class', 'romanization', 'auxiliary', 'error-unknown-tag']);

export function usableFormEntry(f: { form?: string; tags?: string[] }): boolean {
  if (!f.form) return false;
  if (f.tags?.some((t) => BAD_FORM_TAGS.has(t))) return false;
  return isUsableForm(normWord(f.form));
}

export function levelOfRank(rank: number): number {
  const from = [1001, 2001, 3001, 5001, 7501, 10001, 15001, 20001, 30001, 45001];
  let level = 0;
  for (let i = 0; i < from.length; i++) if (rank >= from[i]) level = i + 1;
  return level;
}

/** Split sorted rows into chunks of at most `maxBytes` compressed. */
export function planChunks<T>(rows: T[], gzipSize: (rows: T[]) => number, maxBytes: number): T[][] {
  let n = Math.max(1, Math.ceil(gzipSize(rows) / (maxBytes * 0.9)));
  for (;;) {
    const size = Math.ceil(rows.length / n);
    const chunks: T[][] = [];
    for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
    if (chunks.every((c) => gzipSize(c) <= maxBytes)) return chunks;
    n++;
  }
}
