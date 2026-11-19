import data from '../../../../fixtures/mini-wordlist.json' with { type: 'json' };
import type { WordEntry } from '../domain/types.ts';
import { MemoryWordList } from './memory.ts';

type WordRow = [string, number, string[], string[], string | null, number, [string, string[], string | null][]?];

export function rowsToEntries(words: WordRow[], freedict: [string, string[]][]): WordEntry[] {
  const fd = new Map(freedict);
  return words.map(([lemma, rank, pos, tr, def, flags, others]) => ({
    lemma, rank, pos, tr, trExtra: fd.get(lemma) ?? [], def: def ?? undefined, cognate: (flags & 1) === 1, number: (flags & 2) === 2,
    ...(others ? { senses: others.map(([p, d, df]) => ({ pos: p, tr: d, def: df ?? undefined })) } : {}),
  }));
}

export function fixtureWordList(): MemoryWordList {
  const d = data as unknown as { words: WordRow[]; freedict: [string, string[]][]; forms: [string, string, string?][] };
  return new MemoryWordList(rowsToEntries(d.words, d.freedict), d.forms);
}
