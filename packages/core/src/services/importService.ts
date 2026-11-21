/** ImportService (README §7.1): analyse → preview → confirm, reapplyFilter (B3, H4), and update after new word lists. */
import { analyseContent, reanalyseText } from '../domain/analysis.ts';
import { primary } from '../domain/language.ts';
import { cardFromLemma, classify, firstIncludedChapter, isProtectedCard, occursIn } from '../domain/classify.ts';
import { chapterCoverage } from '../domain/coverage.ts';
import { levelOfRank, startLevel } from '../domain/levels.ts';
import type {
  Book, BookLemma, Card, ImportDraft, ImportPreview, LemmaKind, PreviewCounts, Settings, WordEntry,
} from '../domain/types.ts';
import type { Repositories } from '../ports/index.ts';
import { bookOverview, cutoffOf, listsSignature, type BookOverview, type Ctx } from './context.ts';
import { computeBookProgress } from './progressService.ts';

export interface ConfirmOptions { includedChapters: number[]; cutoffRank?: number }

const COUNT_KEY: Record<LemmaKind, keyof PreviewCounts> = {
  card: 'cards', belowLevel: 'belowLevel', known: 'known', cognate: 'cognates', name: 'names', unlisted: 'unlisted',
};

interface Classified { row: ImportDraft['lemmas'][number]; kind: LemmaKind; entry?: WordEntry }

async function classifyAll(tx: Repositories, ctx: Ctx, rows: ImportDraft['lemmas'], cutoff: number, settings: Settings): Promise<Classified[]> {
  const listed = rows.filter((r) => r.listed).map((r) => r.lemma);
  const [entries, known] = await Promise.all([ctx.wordList.entries(listed), tx.knownWords.hasMany(listed)]);
  return rows.map((row) => {
    const entry = entries.get(row.lemma);
    return { row, entry, kind: classify(row, entry, cutoff, known, settings) };
  });
}

function buildPreview(draft: ImportDraft, classified: Classified[], included: Set<number>, cutoff: number): ImportPreview {
  const counts: PreviewCounts = { distinctWords: 0, common: 0, belowLevel: 0, known: 0, cognates: 0, names: 0, cards: 0, unlisted: 0 };
  const perLevel: Record<number, number> = {};
  let unknownOcc = 0;
  for (const c of classified) {
    if (!occursIn(c.row.occurrencesByChapter, included)) continue;
    counts[COUNT_KEY[c.kind]]++;
    if (c.kind === 'card' && c.entry) {
      const lv = levelOfRank(c.entry.rank);
      perLevel[lv] = (perLevel[lv] ?? 0) + 1;
      for (const [ch, n] of Object.entries(c.row.occurrencesByChapter)) if (included.has(Number(ch))) unknownOcc += n;
    }
  }
  counts.common = draft.common.filter((t) => t.chapters.some((ch) => included.has(ch))).length;
  counts.distinctWords = counts.common + counts.belowLevel + counts.known + counts.cognates + counts.names + counts.cards + counts.unlisted;
  const tokens = draft.book.chapters.filter((c) => included.has(c.index)).reduce((n, c) => n + c.wordTokens, 0);
  return {
    draftId: draft.id, title: draft.book.title, author: draft.book.author, coverDataUrl: draft.book.coverDataUrl,
    works: draft.book.works.map((w) => ({
      index: w.index, title: w.title,
      chapters: draft.book.chapters.filter((c) => c.workIndex === w.index)
        .map((c) => ({ index: c.index, title: c.title, kind: c.kind, included: included.has(c.index), wordTokens: c.wordTokens })),
    })),
    cutoffRank: cutoff, level: startLevel(cutoff), counts, cardsPerListLevel: perLevel,
    coverageBefore: tokens === 0 ? 1 : 1 - unknownOcc / tokens,
    includedChapters: [...included].sort((a, b) => a - b),
    language: draft.book.language,
    ...(draft.declaredLanguage && primary(draft.declaredLanguage) !== primary(draft.book.language) ? { otherLanguage: draft.declaredLanguage } : {}),
  };
}

const defaultIncluded = (draft: ImportDraft) => draft.book.chapters.filter((c) => c.included).map((c) => c.index);

/** Chapters that are ready right after import never get a banner (they never had to be learned). */
function silentlyAnnounceReady(book: Book, cards: Card[], target: number) {
  for (const ch of book.chapters) {
    if (ch.included && !book.chaptersAnnounced.includes(ch.index) && chapterCoverage(ch, cards) >= target) book.chaptersAnnounced.push(ch.index);
  }
}

export function importService(ctx: Ctx) {
  const preview = (draftId: string, opts?: Partial<ConfirmOptions>) =>
    ctx.uow.run(async (tx) => {
      const draft = await tx.drafts.get(draftId);
      if (!draft) throw new Error('Import draft not found');
      const cutoff = opts?.cutoffRank ?? (await cutoffOf(tx));
      const settings = await tx.settings.get();
      const included = new Set(opts?.includedChapters ?? defaultIncluded(draft));
      return buildPreview(draft, await classifyAll(tx, ctx, draft.lemmas, cutoff, settings), included, cutoff);
    });

  return {
    async analyse(file: ArrayBuffer, onProgress?: (p: { loaded: number; total: number; phase: string }) => void): Promise<ImportPreview> {
      onProgress?.({ loaded: 0, total: 1, phase: 'reading' });
      const content = await ctx.epub.read(file);
      const result = await analyseContent(content, ctx.wordList, (loaded, total, phase) => onProgress?.({ loaded, total, phase }));
      const draft: ImportDraft = { id: ctx.ids.next(), createdAt: ctx.clock.now().toISOString(), ...result };
      await ctx.uow.run((tx) => tx.drafts.save(draft));
      onProgress?.({ loaded: 1, total: 1, phase: 'done' });
      return preview(draft.id);
    },

    preview,

    discard: (draftId: string) => ctx.uow.run((tx) => tx.drafts.delete(draftId)),

    confirm: (draftId: string, opts: ConfirmOptions): Promise<BookOverview> =>
      ctx.uow.run(async (tx) => {
        const draft = await tx.drafts.get(draftId);
        if (!draft) throw new Error('Import draft not found');
        const cutoff = opts.cutoffRank ?? (await cutoffOf(tx));
        const settings = await tx.settings.get();
        const included = new Set(opts.includedChapters);
        const now = ctx.clock.now();
        const bookId = ctx.ids.next();
        const book: Book = {
          ...draft.book, id: bookId, importedAt: now.toISOString(), cutoffRank: cutoff, chaptersAnnounced: [], wordLists: listsSignature(await ctx.wordList.info()),
          chapters: draft.book.chapters.map((c) => ({ ...c, included: included.has(c.index) })),
        };
        const classified = await classifyAll(tx, ctx, draft.lemmas, cutoff, settings);
        const rows: BookLemma[] = [];
        const cards: Card[] = [];
        for (const c of classified) {
          rows.push({ ...c.row, bookId, kind: c.kind });
          if (c.kind !== 'card' || !c.entry) continue;
          const ch = firstIncludedChapter(c.row.occurrencesByChapter, included);
          if (ch === undefined) continue;
          cards.push(cardFromLemma(bookId, c.row, c.entry, settings, ch));
        }
        silentlyAnnounceReady(book, cards, settings.coverageTarget);
        await tx.books.save(book);
        await tx.bookLemmas.saveMany(rows);
        await tx.cards.saveMany(cards);
        if (draft.text) await tx.bookTexts.save({ bookId, chapters: draft.text });   // drafts from before Epic R have none
        await tx.drafts.delete(draftId);
        const state = await tx.appState.get();
        await tx.appState.save({ ...state, lastBookId: bookId });
        return bookOverview(book, computeBookProgress(book, cards, rows, settings, now));
      }),

    reapplyFilter: (bookId: string, opts: Partial<ConfirmOptions>): Promise<BookOverview> =>
      ctx.uow.run(async (tx) => {
        const book = await tx.books.get(bookId);
        if (!book) throw new Error('Book not found');
        const cutoff = opts.cutoffRank ?? (await cutoffOf(tx));
        const settings = await tx.settings.get();
        const included = new Set(opts.includedChapters ?? book.chapters.filter((c) => c.included).map((c) => c.index));
        const rows = await tx.bookLemmas.listByBook(bookId);
        const existing = new Map((await tx.cards.listByBook(bookId)).map((c) => [c.lemma, c]));
        const classified = await classifyAll(tx, ctx, rows, cutoff, settings);
        const save: Card[] = [];
        const del: string[] = [];
        const newRows: BookLemma[] = [];
        for (const c of classified) {
          const card = existing.get(c.row.lemma);
          const row = c.row as BookLemma;
          if (card && isProtectedCard(card)) { newRows.push({ ...row, kind: 'card' }); continue; }
          newRows.push({ ...row, kind: c.kind });
          const ch = firstIncludedChapter(row.occurrencesByChapter, included);
          if (c.kind === 'card' && c.entry && ch !== undefined) {
            if (!card) save.push(cardFromLemma(bookId, row, c.entry, settings, ch));
            else if (card.chapterIndex !== ch) save.push({ ...card, chapterIndex: ch });
          } else if (card) del.push(card.id);
        }
        const updated: Book = { ...book, cutoffRank: cutoff, chapters: book.chapters.map((c) => ({ ...c, included: included.has(c.index) })) };
        const finalCards = [...[...existing.values()].filter((c) => !del.includes(c.id) && !save.some((s) => s.id === c.id)), ...save];
        silentlyAnnounceReady(updated, finalCards, settings.coverageTarget);
        await tx.bookLemmas.saveMany(newRows);
        await tx.cards.deleteMany(del);
        await tx.cards.saveMany(save);
        await tx.books.save(updated);
        return bookOverview(updated, computeBookProgress(updated, finalCards, newRows, settings, ctx.clock.now()));
      }),

    /**
     * After a word-list update: the book's stored text read again with the current lists, the cards made anew where the
     * lists now say something else. Practised, known and removed cards keep their progress (with the lists' new
     * translations); edited and hand-made cards stay as they are; cards for words that are no longer cards go.
     */
    updateFromLists: (bookId: string): Promise<{ book: BookOverview; added: number; removed: number; updated: number }> =>
      ctx.uow.run(async (tx) => {
        const [book, text] = await Promise.all([tx.books.get(bookId), tx.bookTexts.get(bookId)]);
        if (!book) throw new Error('Book not found');
        if (!text) throw new Error('This book was imported before its text was kept; import it again to update it');
        const [a, settings, oldRows, oldCards, packs] = await Promise.all([reanalyseText(text.chapters, ctx.wordList), tx.settings.get(),
          tx.bookLemmas.listByBook(bookId), tx.cards.listByBook(bookId), ctx.wordList.info()]);
        const ignored = new Set(oldRows.filter((r) => r.ignored).map((r) => r.lemma));
        const included = new Set(book.chapters.filter((c) => c.included).map((c) => c.index));
        const left = new Map(oldCards.map((c) => [c.lemma, c]));
        const rows: BookLemma[] = [];
        const save: Card[] = [];
        let added = 0, updated = 0;
        for (const c of await classifyAll(tx, ctx, a.lemmas, book.cutoffRank, settings)) {
          const row: BookLemma = { ...c.row, bookId, kind: c.kind, ...(ignored.has(c.row.lemma) ? { ignored: true } : {}) };
          const card = left.get(row.lemma);
          left.delete(row.lemma);
          const ch = firstIncludedChapter(row.occurrencesByChapter, included);
          const where = { forms: row.forms, occurrences: row.occurrences, occurrencesByChapter: row.occurrencesByChapter, firstPosition: row.firstPosition, example: row.example };
          if (card && (card.origin === 'manual' || card.edited)) {
            save.push({ ...card, ...where, chapterIndex: ch ?? card.chapterIndex });
            rows.push({ ...row, kind: 'card' });
            continue;
          }
          rows.push(row);
          // a word marked as known stays a (known) card, as re-filtering keeps it
          const isCard = c.kind === 'card' || (c.kind === 'known' && !!card && isProtectedCard(card));
          if (!isCard || !c.entry || ch === undefined) { if (card) left.set(row.lemma, card); continue; }
          if (c.kind === 'known') rows[rows.length - 1] = { ...row, kind: 'card' };
          const fresh = cardFromLemma(bookId, row, c.entry, settings, ch);
          if (!card) { save.push(fresh); added++; continue; }
          if (!isProtectedCard(card)) { save.push(fresh); continue; }
          const content = { translations: fresh.translations, definition: fresh.definition, pos: fresh.pos, listLevel: fresh.listLevel };
          if (JSON.stringify(content) !== JSON.stringify({ translations: card.translations, definition: card.definition, pos: card.pos, listLevel: card.listLevel })) updated++;
          save.push({ ...card, ...where, chapterIndex: ch, ...content });
        }
        // hand-made cards for words not in the book stay; everything else left over is no card any more
        const keep = [...left.values()].filter((c) => c.origin === 'manual' || c.edited);
        const del = [...left.values()].filter((c) => !keep.includes(c)).map((c) => c.id);
        const lemmas = new Set(rows.map((r) => r.lemma));
        const chapters = book.chapters.map((c) => ({ ...c, wordTokens: a.chapterTokens[c.index] ?? c.wordTokens }));
        const fresh: Book = { ...book, chapters, stats: { wordTokens: a.wordTokens, distinctWords: a.lemmas.length + a.common.length }, wordLists: listsSignature(packs) };
        const finalCards = [...save, ...keep];
        silentlyAnnounceReady(fresh, finalCards, settings.coverageTarget);
        // an open session may hold cards that are gone
        const active = await tx.sessions.getActive(bookId);
        if (active) await tx.sessions.save({ ...active, state: 'finished', finishedAt: ctx.clock.now().toISOString() });
        await tx.bookLemmas.deleteMany(bookId, oldRows.filter((r) => !lemmas.has(r.lemma)).map((r) => r.lemma));
        await tx.bookLemmas.saveMany(rows);
        await tx.cards.deleteMany(del);
        await tx.cards.saveMany(save);
        await tx.books.save(fresh);
        return { book: bookOverview(fresh, computeBookProgress(fresh, finalCards, rows, settings, ctx.clock.now())), added, removed: del.length, updated };
      }),
  };
}
