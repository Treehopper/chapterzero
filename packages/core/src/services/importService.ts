/** ImportService (README §7.1): analyse → preview → confirm, and reapplyFilter (B3, H4). */
import { analyseContent } from '../domain/analysis.ts';
import { cardFromLemma, classify, firstIncludedChapter, isProtectedCard, occursIn } from '../domain/classify.ts';
import { chapterCoverage } from '../domain/coverage.ts';
import { levelOfRank, startLevel } from '../domain/levels.ts';
import type {
  Book, BookLemma, Card, ImportDraft, ImportPreview, LemmaKind, PreviewCounts, Settings, WordEntry,
} from '../domain/types.ts';
import type { Repositories } from '../ports/index.ts';
import { bookOverview, cutoffOf, type BookOverview, type Ctx } from './context.ts';
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
          ...draft.book, id: bookId, importedAt: now.toISOString(), cutoffRank: cutoff, chaptersAnnounced: [],
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
  };
}
