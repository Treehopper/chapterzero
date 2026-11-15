/** Session statistics (C14, README §8.1 "Statistics"). */
import { chapterCoverage, displayTitle } from '../domain/coverage.ts';
import { dayKey } from '../domain/dates.ts';
import type { SessionStatistics, StudySession } from '../domain/types.ts';
import type { Repositories } from '../ports/index.ts';
import { computeBookProgress, dailyStats, streaks } from './progressService.ts';

export async function buildStatistics(tx: Repositories, session: StudySession, now: Date): Promise<SessionStatistics> {
  const book = await tx.books.get(session.bookId);
  if (!book) throw new Error('Book not found');
  const [cards, lemmas, settings, allCards, log] = await Promise.all([
    tx.cards.listByBook(book.id), tx.bookLemmas.listByBook(book.id), tx.settings.get(), tx.cards.listAll(),
    tx.reviewLog.listSince(new Date(0)),
  ]);
  const progress = computeBookProgress(book, cards, lemmas, settings, now);
  const ch = book.chapters.find((c) => c.index === session.coverageAtStart.chapterIndex);
  const days = dailyStats(log);
  const s = streaks(new Set(days.keys()), now);
  const c = session.counters;
  const end = session.finishedAt ? new Date(session.finishedAt) : now;
  const accuracy = c.firstAttempts ? c.firstAttemptsCorrect / c.firstAttempts : 0;
  return {
    sessionId: session.id, bookId: book.id,
    session: {
      reviewed: c.reviewed, firstTryAccuracy: accuracy, promoted: c.promoted, demoted: c.demoted,
      alreadyKnown: c.alreadyKnown, removed: c.removed,
      durationSec: Math.max(0, Math.round((end.getTime() - new Date(session.startedAt).getTime()) / 1000)),
    },
    coverage: {
      chapter: ch && { index: ch.index, displayTitle: displayTitle(book, ch), before: session.coverageAtStart.chapter, after: chapterCoverage(ch, cards) },
      book: { before: session.coverageAtStart.book, after: progress.coverage },
    },
    book: progress,
    overall: {
      streakDays: s.current, longestStreak: s.longest, reviewsToday: days.get(dayKey(now))?.reviews ?? 0,
      dailyGoal: settings.dailyGoal,
      wordsLearnedAllBooks: allCards.filter((x) => (x.status === 'active' && x.level >= 2) || x.status === 'known').length,
    },
    achievements: session.unlocks,
    perfect: c.firstAttempts > 0 && accuracy === 1,
  };
}
