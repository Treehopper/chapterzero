/** What the analysis needs to know about the book's language (README §6.5). Everything
 *  language-specific lives here; the rest of the core works with any language pair. */

export interface LanguagePair {
  /** BCP 47 code of the books' language ("en") */
  source: string;
  /** BCP 47 code of the translations ("de") */
  target: string;
}

/** word lists built before language pairs were recorded are English → German */
export const LEGACY_PAIR: LanguagePair = { source: 'en', target: 'de' };

export interface LanguageRules {
  code: string;
  /** words are not separated by spaces (Chinese, Japanese, Thai…): Intl.Segmenter finds them */
  segmented: boolean;
  rtl: boolean;
  /** a capital letter marks a name; not in German, where every noun has one */
  capitalNames: boolean;
  /** other spellings to try for a word the list doesn't know */
  spellingVariants(token: string): string[];
  /** a word right before a verb / a noun (part-of-speech votes) */
  verbCues: Set<string>;
  nounCues: Set<string>;
}

const SEGMENTED = new Set(['zh', 'ja', 'th', 'lo', 'km', 'my', 'bo']);
const RTL = new Set(['ar', 'he', 'fa', 'ur', 'yi', 'ps', 'dv', 'ckb', 'sd', 'ug']);
const NO_CAPITAL_NAMES = new Set(['de', 'lb']);

export const primary = (code: string) => code.toLowerCase().split(/[-_]/)[0];
export const isRtl = (code: string) => RTL.has(primary(code));

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

/** the word before tells the part of speech of ambiguous words ("to moor" / "the moor") */
const EN_VERB_CUES = new Set(['to', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'did', 'does', 'do',
  "didn't", "don't", "doesn't", "won't", "wouldn't", "can't", "couldn't", "shouldn't", "mustn't", 'i', 'we', 'they']);
const EN_NOUN_CUES = new Set(['the', 'a', 'an', 'his', 'its', 'their', 'my', 'your', 'our', 'this', 'these', 'those', 'every', 'each']);
const none = new Set<string>();

const cache = new Map<string, LanguageRules>();
export function languageRules(code: string): LanguageRules {
  const p = primary(code);
  let r = cache.get(p);
  if (!r) {
    const en = p === 'en';
    r = {
      code: p,
      segmented: SEGMENTED.has(p),
      rtl: RTL.has(p),
      capitalNames: !NO_CAPITAL_NAMES.has(p),
      spellingVariants: en ? americanVariants : () => [],
      verbCues: en ? EN_VERB_CUES : none,
      nounCues: en ? EN_NOUN_CUES : none,
    };
    cache.set(p, r);
  }
  return r;
}
