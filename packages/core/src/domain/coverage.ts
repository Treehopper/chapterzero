/** Coverage and chapter states (README §7.5). */
import type { Book, BookLemma, Card, Chapter, ChapterProgress } from './types.ts';

export const isUnknown = (c: Card) => c.status === 'active' && c.level < 2;

export function chapterCoverage(ch: Pick<Chapter, 'index' | 'wordTokens'>, cards: Card[]): number {
  const unknown = cards.filter(isUnknown).reduce((n, c) => n + (c.occurrencesByChapter[ch.index] ?? 0), 0);
  return ch.wordTokens === 0 ? 1 : Math.max(0, 1 - unknown / ch.wordTokens);
}

export function bookCoverage(chapters: Chapter[], cards: Card[]): number {
  const inc = chapters.filter((c) => c.included);
  const tokens = inc.reduce((n, c) => n + c.wordTokens, 0);
  if (tokens === 0) return 1;
  const idx = new Set(inc.map((c) => c.index));
  let unknown = 0;
  for (const c of cards) {
    if (!isUnknown(c)) continue;
    for (const [k, v] of Object.entries(c.occurrencesByChapter)) if (idx.has(Number(k))) unknown += v;
  }
  return Math.max(0, 1 - unknown / tokens);
}

/**
 * A chapter's bar (I2), in words: `toGo` unknown cards must still be learned to reach the target, taken in the order
 * study brings them (cards in learning first, then new ones by first occurrence); `done` of its cards are known.
 * `share` = done / (done + toGo), 1 when nothing is left.
 */
export function chapterWords(ch: Pick<Chapter, 'index' | 'wordTokens'>, cards: Card[], target: number): { done: number; toGo: number; share: number } {
  const occ = (c: Card) => c.occurrencesByChapter[ch.index] ?? 0;
  const done = cards.filter((c) => occ(c) > 0 && (c.status === 'known' || (c.status === 'active' && c.level >= 2))).length;
  const isNew = (c: Card) => c.stats.correct + c.stats.wrong === 0;
  const unknown = cards.filter((c) => isUnknown(c) && occ(c) > 0)
    .sort((a, b) => Number(isNew(a)) - Number(isNew(b)) || a.firstPosition - b.firstPosition);
  const allowed = (1 - target) * ch.wordTokens;
  let left = unknown.reduce((n, c) => n + occ(c), 0);
  let toGo = 0;
  for (const c of unknown) {
    if (left <= allowed + 1e-9) break;
    toGo++;
    left -= occ(c);
  }
  return { done, toGo, share: toGo === 0 ? 1 : done / (done + toGo) };
}

export const unknownEvery = (coverage: number): number | null => (coverage >= 1 ? null : Math.round(1 / (1 - coverage)));

export function displayTitle(book: Pick<Book, 'works'>, ch: Pick<Chapter, 'workIndex' | 'title'>): string {
  if (book.works.length <= 1) return ch.title;
  const w = book.works.find((x) => x.index === ch.workIndex);
  return w && w.title !== ch.title ? `${w.title} · ${ch.title}` : ch.title;
}

const isUnseen = (c: Card) => c.status === 'active' && c.stats.correct === 0 && c.stats.wrong === 0;

export function chapterProgress(book: Book, cards: Card[], lemmas: BookLemma[], target: number): ChapterProgress[] {
  let learningFound = false;
  return book.chapters.map((ch) => {
    const coverage = chapterCoverage(ch, cards);
    const mine = cards.filter((c) => c.status === 'active' && ((c.occurrencesByChapter[ch.index] ?? 0) > 0 || c.chapterIndex === ch.index));
    const unl = lemmas.filter((l) => l.kind === 'unlisted' && !l.ignored && (l.occurrencesByChapter[ch.index] ?? 0) > 0);
    let state: ChapterProgress['state'];
    if (!ch.included) state = 'excluded';
    else if (coverage >= target - 1e-12) state = 'ready';
    else if (!learningFound) { state = 'learning'; learningFound = true; }
    else state = 'upcoming';
    const words = chapterWords(ch, cards, target);
    return {
      index: ch.index, workIndex: ch.workIndex, title: ch.title, displayTitle: displayTitle(book, ch),
      included: ch.included, wordTokens: ch.wordTokens, coverage, unknownEvery: unknownEvery(coverage), state,
      toTarget: state === 'ready' ? 1 : words.share, wordsToGo: state === 'ready' ? 0 : words.toGo,
      cards: {
        unseen: mine.filter(isUnseen).length,
        learning: mine.filter((c) => !isUnseen(c) && c.level < 2).length,
        learned: mine.filter((c) => c.level >= 2).length,
      },
      unlisted: { words: unl.length, occurrences: unl.reduce((n, l) => n + (l.occurrencesByChapter[ch.index] ?? 0), 0) },
    };
  });
}
