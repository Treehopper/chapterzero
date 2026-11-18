/** Time to ready (E7): how much practice until a chapter, and the book, reach the coverage target. */
import { isUnknown } from './coverage.ts';
import type { Book, Card, ReviewLogEntry } from './types.ts';

export interface Pace {
  /** seconds per review */
  secondsPerReview: number;
  /** share of "didn't know" answers */
  wrongRate: number;
}

export const DEFAULT_PACE: Pace = { secondsPerReview: 8, wrongRate: 0.25 };

/** From recent reviews: median gap between reviews of one sitting (< 90 s), share of wrong answers. */
export function paceFrom(log: ReviewLogEntry[]): Pace {
  if (log.length < 20) return DEFAULT_PACE;
  const times = log.map((e) => new Date(e.at).getTime()).sort((a, b) => a - b);
  const gaps = times.slice(1).map((t, i) => (t - times[i]) / 1000).filter((g) => g > 0.5 && g < 90).sort((a, b) => a - b);
  const secondsPerReview = gaps.length >= 10 ? gaps[Math.floor(gaps.length / 2)] : DEFAULT_PACE.secondsPerReview;
  const wrong = log.filter((e) => e.result === 'unknown').length / log.length;
  return { secondsPerReview, wrongRate: Math.min(0.6, Math.max(0.05, wrong)) };
}

const isNew = (c: Card) => c.stats.correct + c.stats.wrong === 0;

/** a card counts as known from level 2 on; every wrong answer costs one more review */
const reviewsLeft = (c: Card, pace: Pace) => Math.max(0, 2 - c.level) / (1 - pace.wrongRate);

export interface ChapterEstimate { index: number; cards: number; newCards: number; reviews: number; minutes: number }

/**
 * In reading order, each included chapter not yet at the target takes unknown cards until it gets there, in the order
 * study brings them (§7.3): cards already in learning first, then new ones by first occurrence. Cards taken for an
 * earlier chapter count as known for the later ones, so a chapter's figures are what it adds once the chapters
 * before it are ready.
 */
export function estimateToReady(book: Book, cards: Card[], target: number, pace: Pace): ChapterEstimate[] {
  const planned = new Set<string>();
  const out: ChapterEstimate[] = [];
  const unknown = cards.filter(isUnknown);
  for (const ch of book.chapters) {
    if (!ch.included || ch.wordTokens === 0) continue;
    const allowed = (1 - target) * ch.wordTokens;
    const mine = unknown.filter((c) => !planned.has(c.id) && (c.occurrencesByChapter[ch.index] ?? 0) > 0)
      .sort((a, b) => Number(isNew(a)) - Number(isNew(b)) || a.firstPosition - b.firstPosition);
    let left = mine.reduce((n, c) => n + (c.occurrencesByChapter[ch.index] ?? 0), 0);
    const take: Card[] = [];
    for (const c of mine) {
      if (left <= allowed + 1e-9) break;
      take.push(c);
      left -= c.occurrencesByChapter[ch.index] ?? 0;
    }
    for (const c of take) planned.add(c.id);
    const reviews = take.reduce((n, c) => n + reviewsLeft(c, pace), 0);
    out.push({
      index: ch.index, cards: take.length, newCards: take.filter(isNew).length,
      reviews: Math.round(reviews), minutes: Math.ceil((reviews * pace.secondsPerReview) / 60),
    });
  }
  return out;
}
