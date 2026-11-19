import { DEFAULT_CUTOFF, startLevel } from '../domain/levels.ts';
import { lookupLinks } from '../domain/lookup.ts';
import { LEGACY_PAIR, type LanguagePair } from '../domain/language.ts';
import type { Book, BookProgress, Card, Settings } from '../domain/types.ts';
import type { Ports, Repositories } from '../ports/index.ts';

export type Ctx = Ports;

export async function cutoffOf(tx: Repositories): Promise<number> {
  return (await tx.profile.getProfile())?.cutoffRank ?? DEFAULT_CUTOFF;
}

export interface CardView {
  id: string; bookId: string; lemma: string; forms: string[]; translations: string[]; definition?: string;
  example?: string; pos: string[]; box: number; listLevel?: number; translationSource: Card['translationSource'];
  origin: Card['origin']; status: Card['status']; occurrences: number; chapterIndex: number; dueAt?: string;
  seen: boolean;
}

export const cardView = (c: Card): CardView => ({
  id: c.id, bookId: c.bookId, lemma: c.lemma, forms: c.forms, translations: c.translations, definition: c.definition,
  example: c.example, pos: c.pos, box: c.level, listLevel: c.listLevel, translationSource: c.translationSource,
  origin: c.origin, status: c.status, occurrences: c.occurrences, chapterIndex: c.chapterIndex, dueAt: c.dueAt,
  seen: c.stats.correct + c.stats.wrong > 0,
});

export const links = (lemma: string, s: Settings, pair: LanguagePair) => lookupLinks(lemma, s.lookupProviders, pair);
/** the languages of a book's cards */
export const bookPair = (b: Book): LanguagePair => ({ source: b.language, target: b.translationLanguage ?? LEGACY_PAIR.target });

export interface BookOverview {
  id: string; title: string; author?: string; coverDataUrl?: string; importedAt: string; cutoffRank: number;
  level: number; coverage: number; learningChapter?: BookProgress['learningChapter']; due: number;
  cards: number; finishedAt?: string; ready: boolean; coverageTarget: number; worksCount: number; chaptersCount: number;
}

export function bookOverview(book: Book, p: BookProgress): BookOverview {
  return {
    id: book.id, title: book.title, author: book.author, coverDataUrl: book.coverDataUrl, importedAt: book.importedAt,
    cutoffRank: book.cutoffRank, level: startLevel(book.cutoffRank), coverage: p.coverage,
    learningChapter: p.learningChapter, due: p.due, cards: p.cards.active, finishedAt: book.finishedAt,
    ready: p.ready, coverageTarget: p.coverageTarget, worksCount: book.works.length, chaptersCount: book.chapters.filter((c) => c.included).length,
  };
}

export const cleanTranslations = (ts: string[]) =>
  [...new Set(ts.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 4);
