/** ProgressService (README §7.5): coverage, chapter states, boxes, streaks. */
import { bookCoverage, chapterProgress, unknownEvery } from '../domain/coverage.ts';
import { dayKey, startOfDay, addDays } from '../domain/dates.ts';
import { DEFAULT_PACE, estimateToReady, paceFrom, type Pace } from '../domain/estimate.ts';
import type { Book, BookLemma, BookProgress, Card, ReviewLogEntry, Settings } from '../domain/types.ts';
import type { Repositories } from '../ports/index.ts';

/** `lemmas`: only the book's unlisted ones are used (read them with listByBook(id, 'unlisted'): a book has thousands of others) */
export function computeBookProgress(book: Book, cards: Card[], lemmas: BookLemma[], settings: Settings, now: Date, pace: Pace = DEFAULT_PACE): BookProgress {
  const est = new Map(estimateToReady(book, cards, settings.coverageTarget, pace).map((e) => [e.index, e]));
  const chapters = chapterProgress(book, cards, lemmas, settings.coverageTarget).map((c) => {
    const e = est.get(c.index);
    return e && e.cards && c.state !== 'ready' ? { ...c, toReady: { minutes: e.minutes, cards: e.cards, newCards: e.newCards } } : c;
  });
  const sum = (k: 'minutes' | 'cards' | 'newCards') => chapters.reduce((n, c) => n + (c.toReady?.[k] ?? 0), 0);
  const toReady = { minutes: sum('minutes'), cards: sum('cards'), newCards: sum('newCards') };
  const days = toReady.cards ? Math.ceil(toReady.newCards / settings.dailyNewLimit) + 1 : 0;
  const coverage = bookCoverage(book.chapters, cards);
  const learning = chapters.find((c) => c.state === 'learning');
  const boxes = new Array<number>(settings.scheduler.maxLevel + 1).fill(0);
  const active = cards.filter((c) => c.status === 'active');
  for (const c of active) boxes[Math.min(c.level, settings.scheduler.maxLevel)]++;
  const seen = (c: Card) => c.stats.correct + c.stats.wrong > 0;
  const included = new Set(book.chapters.filter((c) => c.included).map((c) => c.index));
  const unl = lemmas.filter((l) => l.kind === 'unlisted' && !l.ignored
    && Object.entries(l.occurrencesByChapter).some(([c, n]) => n > 0 && included.has(Number(c))));
  const known = cards.filter((c) => c.status === 'known').length;
  return {
    bookId: book.id, title: book.title, coverage, unknownEvery: unknownEvery(coverage), coverageTarget: settings.coverageTarget,
    works: book.works.map((w) => ({ index: w.index, title: w.title })), chapters,
    learningChapter: learning && { index: learning.index, displayTitle: learning.displayTitle, coverage: learning.coverage },
    boxes,
    cards: {
      active: active.length, unseen: active.filter((c) => !seen(c)).length,
      learning: active.filter((c) => seen(c) && c.level < 2).length, learned: active.filter((c) => c.level >= 2).length,
      known, removed: cards.filter((c) => c.status === 'removed').length, total: cards.length,
    },
    rareWordsKnown: active.filter((c) => c.level >= 2).length + known,
    rareWordsTotal: cards.filter((c) => c.status !== 'removed').length,
    unlisted: { words: unl.length, occurrences: unl.reduce((n, l) => n + l.occurrences, 0) },
    due: active.filter((c) => c.level > 0 && c.dueAt && new Date(c.dueAt) <= now).length,
    finishedAt: book.finishedAt,
    ready: chapters.some((c) => c.included) && chapters.every((c) => !c.included || c.state === 'ready'),
    toReady: { ...toReady, days },
  };
}

export async function loadBookProgress(tx: Repositories, bookId: string, now: Date): Promise<BookProgress> {
  const book = await tx.books.get(bookId);
  if (!book) throw new Error('Book not found');
  const [cards, lemmas, settings, log] = await Promise.all([
    tx.cards.listByBook(bookId), tx.bookLemmas.listByBook(bookId, 'unlisted'), tx.settings.get(), tx.reviewLog.listSince(addDays(startOfDay(now), -30)),
  ]);
  return computeBookProgress(book, cards, lemmas, settings, now, paceFrom(log));
}

export interface DailyStats { day: string; reviews: number; correct: number }

export function dailyStats(log: ReviewLogEntry[]): Map<string, DailyStats> {
  const m = new Map<string, DailyStats>();
  for (const e of log) {
    const day = dayKey(new Date(e.at));
    const d = m.get(day) ?? { day, reviews: 0, correct: 0 };
    d.reviews++;
    if (e.result === 'known') d.correct++;
    m.set(day, d);
  }
  return m;
}

/** Consecutive local days with ≥ 1 review, ending today (or yesterday if today is still open). */
export function streaks(days: Set<string>, now: Date): { current: number; longest: number } {
  let current = 0;
  let d = startOfDay(now);
  if (!days.has(dayKey(d))) d = addDays(d, -1);
  while (days.has(dayKey(d))) { current++; d = addDays(d, -1); }
  const sorted = [...days].sort();
  let longest = 0, run = 0, prev: string | undefined;
  for (const k of sorted) {
    if (prev) {
      const [y, m, dd] = prev.split('-').map(Number);
      run = dayKey(addDays(new Date(y, m - 1, dd), 1)) === k ? run + 1 : 1;
    } else run = 1;
    longest = Math.max(longest, run);
    prev = k;
  }
  return { current, longest: Math.max(longest, current) };
}
