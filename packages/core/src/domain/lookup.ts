import type { LookupProvider } from './types.ts';

export const DEFAULT_LOOKUP_PROVIDERS: LookupProvider[] = [
  { id: 'wiktionary', name: 'Wiktionary', enabled: true, order: 1, urlTemplate: 'https://en.wiktionary.org/wiki/{word}#English' },
  { id: 'dictcc', name: 'dict.cc', enabled: true, order: 2, urlTemplate: 'https://www.dict.cc/?s={word}' },
  { id: 'leo', name: 'LEO', enabled: true, order: 3, urlTemplate: 'https://dict.leo.org/englisch-deutsch/{word}' },
  { id: 'linguee', name: 'Linguee', enabled: true, order: 4, urlTemplate: 'https://www.linguee.de/deutsch-englisch/search?query={word}' },
  { id: 'cambridge', name: 'Cambridge', enabled: true, order: 5, urlTemplate: 'https://dictionary.cambridge.org/dictionary/english/{word}' },
];

/** Only https templates containing {word} are accepted (C17). */
export function isValidTemplate(t: string): boolean {
  return t.includes('{word}') && /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i.test(t);
}

export function lookupLinks(lemma: string, providers: LookupProvider[]): { name: string; url: string }[] {
  return providers
    .filter((p) => p.enabled && isValidTemplate(p.urlTemplate))
    .sort((a, b) => a.order - b.order)
    .map((p) => ({ name: p.name, url: p.urlTemplate.split('{word}').join(encodeURIComponent(lemma)) }));
}
