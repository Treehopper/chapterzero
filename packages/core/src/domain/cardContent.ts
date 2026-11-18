import type { Card, WordEntry } from './types.ts';

export type CardContent = Pick<Card, 'translations' | 'definition' | 'translationSource'>;

/** The entry as seen for one part of speech: its translations, definition, and pos[0] (README §6.3). */
export function forPos(e: WordEntry, pos?: string): WordEntry {
  if (!pos || pos === e.pos[0]) return e;
  const s = e.senses?.find((x) => x.pos === pos);
  if (!s || (!s.de.length && !s.def)) return e;
  return { ...e, pos: [pos, ...e.pos.filter((p) => p !== pos)], de: s.de, deFreedict: [], def: s.def ?? e.def };
}

export interface SenseOption { pos: string; translations: string[]; definition?: string }

/** Each part of speech the lists know for a word, main one first, to pick from when editing a card (C13). */
export function senseOptions(e: WordEntry): SenseOption[] {
  const out: SenseOption[] = [];
  for (const pos of [e.pos[0], ...(e.senses ?? []).map((s) => s.pos)]) {
    if (!pos || out.some((o) => o.pos === pos)) continue;
    const s = pos === e.pos[0] ? undefined : e.senses?.find((x) => x.pos === pos);
    const de = s ? s.de : e.de.length ? e.de : e.deFreedict;
    const def = s ? s.def : e.def;
    if (de.length || def) out.push({ pos, translations: de.slice(0, 4), definition: def });
  }
  return out;
}

/** README §6.3 "Card content from a WordEntry". undefined = treat as not in the lists. */
export function resolveCardContent(e: WordEntry, useEnglishDefinitions: boolean): CardContent | undefined {
  if (e.de.length) return { translations: e.de.slice(0, 4), definition: e.def, translationSource: 'list' };
  if (e.deFreedict.length) return { translations: e.deFreedict.slice(0, 4), definition: e.def, translationSource: 'list' };
  if (e.def && useEnglishDefinitions) return { translations: [], definition: e.def, translationSource: 'definition' };
  return undefined;
}

/** The word as shown to the learner: verbs get "to" ("to brood"). pos[0] is the main part of speech (README §6.3). */
export const headword = (lemma: string, pos: readonly string[] = []) => (pos[0] === 'verb' ? `to ${lemma}` : lemma);
