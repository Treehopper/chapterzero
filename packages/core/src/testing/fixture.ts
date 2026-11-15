import data from '../../../../fixtures/mini-wordlist.json' with { type: 'json' };
import type { WordEntry } from '../domain/types.ts';
import { MemoryWordList } from './memory.ts';

type WordRow = [string, number, string[], string[], string | null, number];

export function rowsToEntries(words: WordRow[], freedict: [string, string[]][]): WordEntry[] {
  const fd = new Map(freedict);
  return words.map(([lemma, rank, pos, de, def, flags]) => ({
    lemma, rank, pos, de, deFreedict: fd.get(lemma) ?? [], def: def ?? undefined, cognate: (flags & 1) === 1,
  }));
}

export function fixtureWordList(): MemoryWordList {
  const d = data as unknown as { words: WordRow[]; freedict: [string, string[]][]; forms: [string, string][] };
  return new MemoryWordList(rowsToEntries(d.words, d.freedict), d.forms);
}
