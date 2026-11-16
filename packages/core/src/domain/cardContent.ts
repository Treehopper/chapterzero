import type { Card, WordEntry } from './types.ts';

export type CardContent = Pick<Card, 'translations' | 'definition' | 'translationSource'>;

/** README §6.3 "Card content from a WordEntry". undefined = treat as not in the lists. */
export function resolveCardContent(e: WordEntry, useEnglishDefinitions: boolean): CardContent | undefined {
  if (e.de.length) return { translations: e.de.slice(0, 4), definition: e.def, translationSource: 'list' };
  if (e.deFreedict.length) return { translations: e.deFreedict.slice(0, 4), definition: e.def, translationSource: 'list' };
  if (e.def && useEnglishDefinitions) return { translations: [], definition: e.def, translationSource: 'definition' };
  return undefined;
}

/** The word as shown to the learner: verbs get "to" ("to brood"). pos[0] is the main part of speech (README §6.3). */
export const headword = (lemma: string, pos: readonly string[] = []) => (pos[0] === 'verb' ? `to ${lemma}` : lemma);
