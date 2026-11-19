import type { LanguagePair } from './language.ts';
import type { LookupProvider } from './types.ts';

export const DEFAULT_LOOKUP_PROVIDERS: LookupProvider[] = [
  { id: 'wiktionary', name: 'Wiktionary', enabled: true, order: 1, urlTemplate: 'https://en.wiktionary.org/wiki/{word}#{sourceName}' },
  { id: 'dictcc', name: 'dict.cc', enabled: true, order: 2, urlTemplate: 'https://www.dict.cc/?s={word}', pairs: ['en-de', 'de-en'] },
  { id: 'leo', name: 'LEO', enabled: true, order: 3, urlTemplate: 'https://dict.leo.org/englisch-deutsch/{word}', pairs: ['en-de', 'de-en'] },
  { id: 'linguee', name: 'Linguee', enabled: true, order: 4, urlTemplate: 'https://www.linguee.de/deutsch-englisch/search?query={word}', pairs: ['en-de', 'de-en'] },
  { id: 'cambridge', name: 'Cambridge', enabled: true, order: 5, urlTemplate: 'https://dictionary.cambridge.org/dictionary/english/{word}', pairs: ['en-*'] },
];
const DEFAULTS = new Map(DEFAULT_LOOKUP_PROVIDERS.map((p) => [p.id, p]));

/** Only https templates containing {word} are accepted (C17). */
export function isValidTemplate(t: string): boolean {
  return t.includes('{word}') && /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i.test(t);
}

const serves = (pairs: string[] | undefined, { source, target }: LanguagePair) =>
  !pairs || pairs.some((p) => p === `${source}-${target}` || p === `${source}-*` || p === `*-${target}`);

let names: Intl.DisplayNames | undefined;
const englishName = (code: string) => { try { return (names ??= new Intl.DisplayNames(['en'], { type: 'language' })).of(code) ?? code; } catch { return code; } };

export function lookupLinks(lemma: string, providers: LookupProvider[], pair: LanguagePair): { name: string; url: string }[] {
  const fill: Record<string, string> = { word: encodeURIComponent(lemma), source: pair.source, target: pair.target, sourceName: englishName(pair.source) };
  return providers
    // the built-in ones always use their current template and pairs (settings store only enabled and order)
    .map((p) => { const d = DEFAULTS.get(p.id); return d ? { ...p, urlTemplate: d.urlTemplate, pairs: d.pairs } : p; })
    .filter((p) => p.enabled && isValidTemplate(p.urlTemplate) && serves(p.pairs, pair))
    .sort((a, b) => a.order - b.order)
    .map((p) => ({ name: p.name, url: p.urlTemplate.replace(/\{(word|source|target|sourceName)\}/g, (_, k: string) => fill[k]) }));
}
