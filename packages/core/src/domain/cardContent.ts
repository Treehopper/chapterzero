import { primary } from './language.ts';
import type { Card, WordEntry } from './types.ts';

export type CardContent = Pick<Card, 'translations' | 'definition' | 'translationSource'>;

/** The entry as seen for one part of speech: its translations, definition, and pos[0] (README §6.3). */
export function forPos(e: WordEntry, pos?: string): WordEntry {
  if (!pos || pos === e.pos[0]) return e;
  const s = e.senses?.find((x) => x.pos === pos);
  if (!s || (!s.tr.length && !s.def)) return e;
  return { ...e, pos: [pos, ...e.pos.filter((p) => p !== pos)], tr: s.tr, trExtra: [], def: s.def ?? e.def };
}

export interface SenseOption { pos: string; translations: string[]; definition?: string }

/** Each part of speech the lists know for a word, main one first, to pick from when editing a card (C13). */
export function senseOptions(e: WordEntry): SenseOption[] {
  const out: SenseOption[] = [];
  for (const pos of [e.pos[0], ...(e.senses ?? []).map((s) => s.pos)]) {
    if (!pos || out.some((o) => o.pos === pos)) continue;
    const s = pos === e.pos[0] ? undefined : e.senses?.find((x) => x.pos === pos);
    const tr = s ? s.tr : e.tr.length ? e.tr : e.trExtra;
    const def = s ? s.def : e.def;
    if (tr.length || def) out.push({ pos, translations: tr.slice(0, 4), definition: def });
  }
  return out;
}

/** README §6.3 "Card content from a WordEntry". undefined = treat as not in the lists. */
export function resolveCardContent(e: WordEntry, useDefinitions: boolean): CardContent | undefined {
  if (e.tr.length) return { translations: e.tr.slice(0, 4), definition: e.def, translationSource: 'list' };
  if (e.trExtra.length) return { translations: e.trExtra.slice(0, 4), definition: e.def, translationSource: 'list' };
  if (e.def && useDefinitions) return { translations: [], definition: e.def, translationSource: 'definition' };
  return undefined;
}

/** The word as shown to the learner: English verbs get "to" ("to brood"). pos[0] is the main part of speech (README §6.3). */
export const headword = (lemma: string, pos: readonly string[] = [], language = 'en') =>
  (pos[0] === 'verb' && primary(language) === 'en' ? `to ${lemma}` : lemma);
