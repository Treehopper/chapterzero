/** StudyService (README §7.2–§7.4, Epic C). Every call is one UnitOfWork. */
import { ACHIEVEMENTS, bookAchievement, newUnlocks, onGrade } from '../domain/achievements.ts';
import { bookCoverage, chapterCoverage, chapterProgress, displayTitle } from '../domain/coverage.ts';
import { addDays, isSameDay, startOfDay } from '../domain/dates.ts';
import { deepClone } from '../domain/clone.ts';
import { grade as schedule, intervalDays } from '../domain/scheduler.ts';
import type {
  AchievementUnlock, Book, Card, CardId, Grade, LearnerStats, Settings, StudySession,
} from '../domain/types.ts';
import type { Repositories } from '../ports/index.ts';
import { cardView, cleanTranslations, links, type CardView, type Ctx } from './context.ts';
import { buildStatistics } from './statistics.ts';

export interface SessionOptions { chapterIndex?: number; studyAhead?: boolean }

export interface SessionView {
  sessionId: string;
  bookId: string;
  bookTitle: string;
  state: StudySession['state'];
  card?: CardView;
  phase?: 'front' | 'back' | 'wrongReview';
  done: boolean;
  nothingDue: boolean;
  counters: StudySession['counters'];
  progress: { done: number; total: number };
  firstCard: boolean;
  canUndo: boolean;
  undoKind?: 'grade' | 'retire' | 'remove';
  requireFlip: boolean;
  newAchievements: AchievementUnlock[];
  lookupLinks: { name: string; url: string }[];
  chapter?: { index: number; title: string; coverage: number };
  chapterReady?: { index: number; title: string; coverage: number };
  retired: boolean;
  bookFinished?: boolean;
}

const unseen = (c: Card) => c.status === 'active' && c.stats.correct === 0 && c.stats.wrong === 0;

/** §7.3 step 2: candidates for new cards, starting at chapter `start`. */
function newCandidates(book: Book, cards: Card[], start: number | undefined, exclude: Set<CardId>, limit: number): Card[] {
  if (limit <= 0 || start === undefined) return [];
  const included = book.chapters.filter((c) => c.included).map((c) => c.index);
  const out: Card[] = [];
  const taken = new Set(exclude);
  const from = included.indexOf(start);
  const order = from >= 0 ? included.slice(from) : [start, ...included.filter((c) => c > start)];
  for (const ch of order) {
    const cands = cards
      .filter((c) => unseen(c) && !taken.has(c.id) && ((c.occurrencesByChapter[ch] ?? 0) > 0 || c.chapterIndex === ch))
      .sort((a, b) => a.firstPosition - b.firstPosition);
    for (const c of cands) {
      if (out.length >= limit) return out;
      out.push(c);
      taken.add(c.id);
    }
  }
  return out;
}

function targetChapter(book: Book, cards: Card[], settings: Settings): number | undefined {
  for (const ch of book.chapters) {
    if (!ch.included) continue;
    if (chapterCoverage(ch, cards) >= settings.coverageTarget) continue;
    if (cards.some((c) => unseen(c) && ((c.occurrencesByChapter[ch.index] ?? 0) > 0 || c.chapterIndex === ch.index))) return ch.index;
  }
  return undefined;
}

const introducedToday = (cards: Card[], now: Date) => cards.filter((c) => isSameDay(c.stats.firstReviewedAt, now)).length;

function pendingNew(session: StudySession, byId: Map<string, Card>): number {
  const ids = [...session.queue, ...(session.current ? [session.current.cardId] : [])];
  return new Set(ids.filter((id) => { const c = byId.get(id); return c && unseen(c); })).size;
}

export function studyService(ctx: Ctx) {
  async function load(tx: Repositories, sessionId: string) {
    const session = await tx.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    const book = await tx.books.get(session.bookId);
    if (!book) throw new Error('Book not found');
    const [cards, settings, stats] = await Promise.all([tx.cards.listByBook(book.id), tx.settings.get(), tx.achievements.getStats()]);
    const byId = new Map(cards.map((c) => [c.id, c]));
    // cards deleted or retired outside the session (re-filter, Words screen) drop out of it
    const ok = (id: string) => byId.get(id)?.status === 'active';
    if (session.state === 'active') {
      session.queue = session.queue.filter(ok);
      if (session.current && !ok(session.current.cardId)) advance(session);
    }
    return { session, book, cards, settings, stats, byId };
  }

  function view(session: StudySession, book: Book, byId: Map<string, Card>, settings: Settings,
    extra: Partial<SessionView> = {}): SessionView {
    const card = session.current ? byId.get(session.current.cardId) : undefined;
    const cards = [...byId.values()];
    const chIndex = session.targetChapter ?? session.coverageAtStart.chapterIndex;
    const ch = book.chapters.find((c) => c.index === chIndex);
    const doneCount = session.counters.reviewed + session.counters.alreadyKnown + session.counters.removed;
    const remaining = session.queue.length + (session.current && session.current.phase !== 'wrongReview' ? 1 : 0);
    return {
      sessionId: session.id, bookId: book.id, bookTitle: book.title, state: session.state,
      card: card && cardView(card), phase: session.current?.phase,
      done: !session.current, nothingDue: false, counters: session.counters,
      progress: { done: doneCount, total: doneCount + remaining },
      firstCard: session.graded.length === 0 && session.counters.alreadyKnown === 0 && session.counters.removed === 0,
      canUndo: !!session.undo, undoKind: session.undo?.kind, requireFlip: settings.requireFlipBeforeGrade,
      newAchievements: [], lookupLinks: session.current && session.current.phase !== 'front' && card ? links(card.lemma, settings) : [],
      chapter: ch && { index: ch.index, title: displayTitle(book, ch), coverage: chapterCoverage(ch, cards) },
      retired: false,
      ...extra,
    };
  }

  /** §7.3 step 3: append the next unseen card while the daily limit allows. */
  function refill(session: StudySession, book: Book, byId: Map<string, Card>, settings: Settings, now: Date) {
    const cards = [...byId.values()];
    const allowed = settings.dailyNewLimit - introducedToday(cards, now) - pendingNew(session, byId);
    if (allowed <= 0 && !session.studyAhead) return;
    const exclude = new Set([...session.queue, ...session.graded, ...(session.current ? [session.current.cardId] : [])]);
    const start = session.targetChapter ?? targetChapter(book, cards, settings);
    const next = newCandidates(book, cards, start, exclude, 1);
    session.queue.push(...next.map((c) => c.id));
  }

  /** §7.3 step 5 + §7.6: chapter banners, book finished, unlocks. */
  async function afterChange(tx: Repositories, session: StudySession, book: Book, byId: Map<string, Card>,
    settings: Settings, stats: LearnerStats, changed: Card, now: Date) {
    const cards = [...byId.values()];
    let chapterReady: SessionView['chapterReady'];
    let bookChanged = false;
    for (const key of Object.keys(changed.occurrencesByChapter).map(Number).sort((a, b) => a - b)) {
      const ch = book.chapters.find((c) => c.index === key);
      if (!ch || !ch.included || book.chaptersAnnounced.includes(ch.index)) continue;
      const cov = chapterCoverage(ch, cards);
      if (cov >= settings.coverageTarget) {
        book.chaptersAnnounced.push(ch.index);
        bookChanged = true;
        chapterReady ??= { index: ch.index, title: displayTitle(book, ch), coverage: cov };
      }
    }
    let bookFinished = false;
    if (!book.finishedAt) {
      const chs = chapterProgress(book, cards, [], settings.coverageTarget).filter((c) => c.included);
      if (chs.length && chs.every((c) => c.state === 'ready')) {
        book.finishedAt = now.toISOString();
        bookChanged = true;
        bookFinished = true;
        if (!stats.booksFinished.includes(book.id)) stats = { ...stats, booksFinished: [...stats.booksFinished, book.id] };
      }
    }
    const existing = await tx.achievements.listUnlocks();
    const unlocks = newUnlocks([...ACHIEVEMENTS, bookAchievement(book)], stats, existing, now.toISOString(), session.id);
    if (unlocks.length) {
      await tx.achievements.addUnlocks(unlocks);
      session.unlocks.push(...unlocks);
    }
    if (bookChanged) await tx.books.save(book);
    await tx.achievements.saveStats(stats);
    return { chapterReady, unlocks, stats, bookFinished };
  }

  function advance(session: StudySession) {
    const next = session.queue.shift();
    session.current = next ? { cardId: next, phase: 'front' } : undefined;
  }

  function snapshot(session: StudySession, card: Card, stats: LearnerStats, kind: NonNullable<StudySession['undo']>['kind']): NonNullable<StudySession['undo']> {
    return {
      kind, cardId: card.id, before: { card: deepClone(card) }, queueBefore: [...session.queue],
      currentBefore: session.current && { ...session.current }, countersBefore: { ...session.counters },
      gradedBefore: [...session.graded], statsBefore: deepClone(stats),
    };
  }

  async function startSession(tx: Repositories, bookId: string, opts: SessionOptions | undefined): Promise<SessionView> {
    const book = await tx.books.get(bookId);
    if (!book) throw new Error('Book not found');
    const [cards, settings] = await Promise.all([tx.cards.listByBook(bookId), tx.settings.get()]);
    const now = ctx.clock.now();
    const active = cards.filter((c) => c.status === 'active');
    let reviews = active.filter((c) => c.level > 0 && c.dueAt && new Date(c.dueAt) <= now)
      .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
    const start = opts?.chapterIndex ?? targetChapter(book, cards, settings);
    const limit = settings.dailyNewLimit - introducedToday(cards, now);
    let fresh = newCandidates(book, cards, start, new Set(reviews.map((c) => c.id)), limit);
    if (opts?.studyAhead) {
      const ahead = active.filter((c) => c.level > 0 && c.dueAt && new Date(c.dueAt) > now)
        .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!)).slice(0, 20);
      reviews = [...reviews, ...ahead];
      if (reviews.length + fresh.length === 0) {
        fresh = newCandidates(book, cards, start ?? book.chapters.find((c) => c.included)?.index, new Set(), 10);
      }
    }
    const queue = [...reviews, ...fresh].map((c) => c.id);
    const chIndex = start ?? book.chapters.find((c) => c.included)?.index ?? 0;
    const ch = book.chapters.find((c) => c.index === chIndex);
    const session: StudySession = {
      id: ctx.ids.next(), bookId, startedAt: now.toISOString(), queue, graded: [], unlocks: [],
      counters: { reviewed: 0, correct: 0, wrong: 0, promoted: 0, demoted: 0, alreadyKnown: 0, removed: 0, firstAttempts: 0, firstAttemptsCorrect: 0 },
      targetChapter: opts?.chapterIndex, studyAhead: opts?.studyAhead,
      coverageAtStart: { book: bookCoverage(book.chapters, cards), chapter: ch ? chapterCoverage(ch, cards) : 1, chapterIndex: chIndex },
      state: 'active',
    };
    const byId = new Map(cards.map((c) => [c.id, c]));
    const state = await tx.appState.get();
    await tx.appState.save({ ...state, lastBookId: bookId });
    if (!queue.length) return { ...view(session, book, byId, settings), sessionId: '', nothingDue: true, done: true };
    advance(session);
    await tx.sessions.save(session);
    return view(session, book, byId, settings);
  }

  return {
    resumeOrStart: (bookId: string, opts?: SessionOptions) =>
      ctx.uow.run(async (tx) => {
        const active = await tx.sessions.getActive(bookId);
        const explicit = opts?.chapterIndex !== undefined || opts?.studyAhead;
        if (active && !explicit) {
          const { session, book, byId, settings } = await load(tx, active.id);
          return view(session, book, byId, settings);
        }
        if (active) await tx.sessions.save({ ...active, state: 'finished', finishedAt: ctx.clock.now().toISOString() });
        return startSession(tx, bookId, opts);
      }),

    get: (sessionId: string) =>
      ctx.uow.run(async (tx) => {
        const { session, book, byId, settings } = await load(tx, sessionId);
        return view(session, book, byId, settings);
      }),

    flip: (sessionId: string) =>
      ctx.uow.run(async (tx) => {
        const { session, book, byId, settings } = await load(tx, sessionId);
        if (session.current && session.current.phase !== 'wrongReview') {
          session.current.phase = session.current.phase === 'front' ? 'back' : 'front';
          await tx.sessions.save(session);
        }
        return view(session, book, byId, settings);
      }),

    grade: (sessionId: string, result: Grade) =>
      ctx.uow.run(async (tx) => {
        const { session, book, byId, settings, stats } = await load(tx, sessionId);
        const now = ctx.clock.now();
        if (session.state !== 'active' || !session.current) return view(session, book, byId, settings);
        if (session.current.phase === 'wrongReview') {
          advance(session);
          await tx.sessions.save(session);
          return view(session, book, byId, settings);
        }
        if (session.current.phase === 'front' && settings.requireFlipBeforeGrade) throw new Error('Flip the card before grading');
        const card = byId.get(session.current.cardId);
        if (!card) throw new Error('Card not found');
        const undo = snapshot(session, card, stats, 'grade');
        const firstSight = card.stats.correct === 0 && card.stats.wrong === 0;

        if (result === 'known' && firstSight && settings.retireOnFirstTry) {
          // C18: retire for good
          const retired: Card = { ...card, status: 'known' };
          byId.set(card.id, retired);
          await tx.cards.saveMany([retired]);
          await tx.knownWords.addMany([card.lemma]);
          session.counters = { ...session.counters, alreadyKnown: session.counters.alreadyKnown + 1 };
          session.undo = { ...undo, kind: 'retire', addedKnownWord: card.lemma };
          session.current = undefined;
          refill(session, book, byId, settings, now);
          advance(session);
          const r = await afterChange(tx, session, book, byId, settings, stats, retired, now);
          await tx.sessions.save(session);
          return view(session, book, byId, settings,
            { retired: true, newAchievements: r.unlocks, chapterReady: r.chapterReady, bookFinished: r.bookFinished });
        }

        const levelBefore = card.level;
        let scheduled = schedule(card, result, now, settings.scheduler);
        if (session.studyAhead && result === 'known' && card.level > 0 && isSameDay(card.stats.lastReviewedAt, now)) {
          // §7.3 step 6: no second promotion on the same day
          scheduled = { ...card, dueAt: addDays(startOfDay(now), intervalDays(card.level, settings.scheduler)).toISOString() };
        }
        const g = onGrade(stats, scheduled, result);
        const iso = now.toISOString();
        const graded: Card = {
          ...g.card,
          stats: { ...g.card.stats, correct: g.card.stats.correct + (result === 'known' ? 1 : 0),
            wrong: g.card.stats.wrong + (result === 'unknown' ? 1 : 0), lastReviewedAt: iso,
            firstReviewedAt: card.stats.firstReviewedAt ?? iso },
        };
        byId.set(card.id, graded);
        await tx.cards.saveMany([graded]);
        const logSeq = await tx.reviewLog.append({ cardId: card.id, bookId: book.id, at: iso, result, levelBefore, levelAfter: graded.level });
        const c = session.counters;
        const firstAttempt = !session.graded.includes(card.id);
        session.counters = {
          ...c, reviewed: c.reviewed + 1,
          correct: c.correct + (result === 'known' ? 1 : 0), wrong: c.wrong + (result === 'unknown' ? 1 : 0),
          promoted: c.promoted + (graded.level > levelBefore ? 1 : 0),
          demoted: c.demoted + (result === 'unknown' && levelBefore > 0 ? 1 : 0),
          firstAttempts: c.firstAttempts + (firstAttempt ? 1 : 0),
          firstAttemptsCorrect: c.firstAttemptsCorrect + (firstAttempt && result === 'known' ? 1 : 0),
        };
        if (firstAttempt) session.graded.push(card.id);
        session.undo = { ...undo, logSeq };
        const fromFront = session.current.phase === 'front';
        if (result === 'unknown') session.queue.splice(Math.min(settings.scheduler.requeueGap, session.queue.length), 0, card.id);
        // C16: the back was already seen when graded after a flip; only a wrong swipe on the front shows it
        if (result === 'unknown' && fromFront) session.current = { cardId: card.id, phase: 'wrongReview' };
        else advance(session);
        const r = await afterChange(tx, session, book, byId, settings, g.stats, graded, now);
        await tx.sessions.save(session);
        return view(session, book, byId, settings, { newAchievements: r.unlocks, chapterReady: r.chapterReady, bookFinished: r.bookFinished });
      }),

    continueAfterReview: (sessionId: string) =>
      ctx.uow.run(async (tx) => {
        const { session, book, byId, settings } = await load(tx, sessionId);
        if (session.current?.phase === 'wrongReview') {
          advance(session);
          await tx.sessions.save(session);
        }
        return view(session, book, byId, settings);
      }),

    undo: (sessionId: string) =>
      ctx.uow.run(async (tx) => {
        const { session, book, byId, settings, stats } = await load(tx, sessionId);
        const u = session.undo;
        if (!u || session.state !== 'active') return view(session, book, byId, settings);
        byId.set(u.cardId, u.before.card);
        await tx.cards.saveMany([u.before.card]);
        if (u.addedKnownWord) await tx.knownWords.remove(u.addedKnownWord);
        if (u.logSeq !== undefined) await tx.reviewLog.remove(u.logSeq);
        // unlocks and finished books are never revoked
        await tx.achievements.saveStats({ ...u.statsBefore, booksFinished: stats.booksFinished });
        session.queue = u.queueBefore;
        session.current = u.currentBefore && { ...u.currentBefore, phase: u.currentBefore.phase === 'front' ? 'back' : u.currentBefore.phase };
        session.counters = u.countersBefore;
        session.graded = u.gradedBefore;
        session.undo = undefined;
        await tx.sessions.save(session);
        return view(session, book, byId, settings);
      }),

    editCurrent: (sessionId: string, translations: string[]) =>
      ctx.uow.run(async (tx) => {
        const { session, book, byId, settings } = await load(tx, sessionId);
        const card = session.current && byId.get(session.current.cardId);
        if (!card) throw new Error('No current card');
        const ts = cleanTranslations(translations);
        if (!ts.length && !card.definition) throw new Error('A card needs a translation');
        const edited: Card = { ...card, translations: ts, edited: true, translationSource: 'manual' };
        byId.set(card.id, edited);
        await tx.cards.saveMany([edited]);
        await tx.sessions.save(session);
        return view(session, book, byId, settings);
      }),

    removeCurrent: (sessionId: string, as: 'removed' | 'known') =>
      ctx.uow.run(async (tx) => {
        const { session, book, byId, settings, stats } = await load(tx, sessionId);
        const card = session.current && byId.get(session.current.cardId);
        if (!card) throw new Error('No current card');
        const now = ctx.clock.now();
        const undo = snapshot(session, card, stats, 'remove');
        const changed: Card = { ...card, status: as };
        byId.set(card.id, changed);
        await tx.cards.saveMany([changed]);
        let addedKnownWord: string | undefined;
        if (as === 'known') {
          const had = await tx.knownWords.hasMany([card.lemma]);
          if (!had.has(card.lemma)) { await tx.knownWords.addMany([card.lemma]); addedKnownWord = card.lemma; }
        }
        session.queue = session.queue.filter((id) => id !== card.id);
        session.counters = { ...session.counters, removed: session.counters.removed + 1 };
        session.undo = { ...undo, addedKnownWord };
        session.current = undefined;
        refill(session, book, byId, settings, now);
        advance(session);
        const r = await afterChange(tx, session, book, byId, settings, stats, changed, now);
        await tx.sessions.save(session);
        return view(session, book, byId, settings, { newAchievements: r.unlocks, chapterReady: r.chapterReady });
      }),

    finish: (sessionId: string) =>
      ctx.uow.run(async (tx) => {
        const session = await tx.sessions.get(sessionId);
        if (!session) throw new Error('Session not found');
        if (session.state === 'finished' && session.statistics) return session.statistics;
        const now = ctx.clock.now();
        session.state = 'finished';
        session.finishedAt = now.toISOString();
        session.undo = undefined;
        session.statistics = await buildStatistics(tx, session, now);
        await tx.sessions.save(session);
        return session.statistics;
      }),

    statistics: (sessionId: string) =>
      ctx.uow.run(async (tx) => {
        const session = await tx.sessions.get(sessionId);
        if (!session) throw new Error('Session not found');
        return session.statistics ?? buildStatistics(tx, session, ctx.clock.now());
      }),
  };
}

export { cleanTranslations };
