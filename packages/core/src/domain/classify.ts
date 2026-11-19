/** Step 9 classification (README §7.1) and card construction. */
import { forPos, resolveCardContent } from './cardContent.ts';
import { levelOfRank } from './levels.ts';
import type { BookLemma, Card, LemmaKind, Settings, WordEntry } from './types.ts';

export interface ClassifyInput {
  lemma: string; listed: boolean; name: boolean;
}

export function classify(l: ClassifyInput, entry: WordEntry | undefined, cutoffRank: number,
  known: Set<string>, settings: Pick<Settings, 'useDefinitions' | 'skipCognates'>): LemmaKind {
  if (l.name) return 'name';
  if (!l.listed || !entry || !resolveCardContent(entry, settings.useDefinitions)) return 'unlisted';
  if (entry.rank <= cutoffRank) return 'belowLevel';
  if (known.has(l.lemma)) return 'known';
  if (entry.cognate && settings.skipCognates) return 'cognate';
  return 'card';
}

export const occursIn = (byChapter: Record<number, number>, included: Set<number>) =>
  Object.entries(byChapter).some(([c, n]) => n > 0 && included.has(Number(c)));

export function firstIncludedChapter(byChapter: Record<number, number>, included: Set<number>): number | undefined {
  const cs = Object.entries(byChapter).filter(([c, n]) => n > 0 && included.has(Number(c))).map(([c]) => Number(c));
  return cs.length ? Math.min(...cs) : undefined;
}

export function cardFromLemma(bookId: string, row: Omit<BookLemma, 'bookId' | 'kind'>, entry: WordEntry,
  settings: Pick<Settings, 'useDefinitions'>, chapterIndex: number): Card {
  // the part of speech the book uses picks the translations ("chafed": scheuern, not Schürfwunde)
  const e = forPos(entry, row.pos);
  const own = resolveCardContent(e, settings.useDefinitions);
  const content = own ?? resolveCardContent(entry, settings.useDefinitions)!;
  return {
    id: `${bookId}:${row.lemma}`, bookId, lemma: row.lemma, forms: row.forms, occurrences: row.occurrences,
    occurrencesByChapter: row.occurrencesByChapter, firstPosition: row.firstPosition, chapterIndex, example: row.example,
    listLevel: levelOfRank(entry.rank), ...content, pos: own ? e.pos : entry.pos, origin: 'import', status: 'active', level: 0,
    stats: { correct: 0, wrong: 0, failStreak: 0 },
  };
}

/** reapplyFilter never touches these (B3). */
export const isProtectedCard = (c: Card) =>
  c.stats.correct + c.stats.wrong > 0 || !!c.edited || c.origin === 'manual' || c.status !== 'active';
