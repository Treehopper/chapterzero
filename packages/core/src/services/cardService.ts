/** CardService (Epic D): words screen, suggest, adding by hand, remove/restore/known. */
import { resolveCardContent, senseOptions, type SenseOption } from '../domain/cardContent.ts';
import { chapterProgress, displayTitle } from '../domain/coverage.ts';
import { levelOfRank } from '../domain/levels.ts';
import { normalizeToken } from '../domain/text.ts';
import type { Book, BookLemma, Card, LemmaKind } from '../domain/types.ts';
import type { Repositories, WordList } from '../ports/index.ts';
import { cardView, cleanTranslations, links, type CardView, type Ctx } from './context.ts';

export type WordsTab = 'unlisted' | 'active' | 'known' | 'removed' | 'skipped';

export interface WordRow {
  lemma: string;
  kind: LemmaKind | 'cardOnly';
  occurrences: number;
  example?: string;
  chapterIndex?: number;
  chapterTitle?: string;
  card?: CardView;
  translations?: string[];
  definition?: string;
  pos?: string[];
  listLevel?: number;
  name?: boolean;
}

export interface WordSuggestion {
  lemma: string;
  listed?: { level: number; rank: number; translations: string[]; definition?: string };
  inBook?: { occurrences: number; chapterIndex: number; chapterTitle: string; example?: string; kind: LemmaKind };
  existingCardId?: string;
  existingStatus?: Card['status'];
  lookupLinks: { name: string; url: string }[];
}

const firstChapter = (byChapter: Record<number, number>) => {
  const cs = Object.entries(byChapter).filter(([, n]) => n > 0).map(([c]) => Number(c));
  return cs.length ? Math.min(...cs) : 0;
};

/** Typed text is matched like a book token (D8, §7.1 steps 5–6). */
export async function matchTyped(wordList: WordList, typed: string): Promise<{ lemma: string; listed: boolean }> {
  const first = typed.trim().split(/\s+/)[0] ?? '';
  const t = normalizeToken(first);
  const norm = t.norm.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  if (!norm) return { lemma: '', listed: false };
  const r = await wordList.resolve([norm]);
  const lemma = r.get(norm);
  if (lemma) return { lemma, listed: true };
  if (lemma === '') {
    // a common form: still a list word if its own spelling is in the word table
    const e = await wordList.entries([norm]);
    return { lemma: norm, listed: e.has(norm) };
  }
  return { lemma: norm, listed: false };
}

export function cardService(ctx: Ctx) {
  const chapterTitle = (book: Book, index: number) => {
    const ch = book.chapters.find((c) => c.index === index);
    return ch ? displayTitle(book, ch) : '';
  };

  /** words that only occur in excluded chapters are not the book's (same as the import preview, B7) */
  const inIncluded = (book: Book, byChapter: Record<number, number>) =>
    book.chapters.some((c) => c.included && (byChapter[c.index] ?? 0) > 0);

  async function getBook(tx: Repositories, id: string) {
    const b = await tx.books.get(id);
    if (!b) throw new Error('Book not found');
    return b;
  }

  async function suggestIn(tx: Repositories, bookId: string, typed: string): Promise<WordSuggestion> {
    const book = await getBook(tx, bookId);
    const settings = await tx.settings.get();
    const m = await matchTyped(ctx.wordList, typed);
    const out: WordSuggestion = { lemma: m.lemma, lookupLinks: m.lemma ? links(m.lemma, settings) : [] };
    if (!m.lemma) return out;
    const entry = m.listed ? (await ctx.wordList.entries([m.lemma])).get(m.lemma) : undefined;
    if (entry) {
      const content = resolveCardContent(entry, true);
      out.listed = { level: levelOfRank(entry.rank), rank: entry.rank, translations: content?.translations ?? [], definition: entry.def };
    }
    const row = await tx.bookLemmas.get(bookId, m.lemma);
    if (row) {
      const ch = firstChapter(row.occurrencesByChapter);
      out.inBook = { occurrences: row.occurrences, chapterIndex: ch, chapterTitle: chapterTitle(book, ch), example: row.example, kind: row.kind };
    }
    const card = await tx.cards.get(`${bookId}:${m.lemma}`);
    if (card) { out.existingCardId = card.id; out.existingStatus = card.status; }
    return out;
  }

  return {
    words: (bookId: string, opts: { tab: WordsTab; search?: string; chapterIndex?: number; includeNames?: boolean }) =>
      ctx.uow.run(async (tx): Promise<WordRow[]> => {
        const book = await getBook(tx, bookId);
        const [rows, cards] = await Promise.all([tx.bookLemmas.listByBook(bookId), tx.cards.listByBook(bookId)]);
        const q = opts.search?.trim().toLowerCase();
        const inChapter = (byChapter: Record<number, number>, chIndex?: number) =>
          opts.chapterIndex === undefined || (byChapter[opts.chapterIndex] ?? 0) > 0 || chIndex === opts.chapterIndex;
        const matches = (lemma: string, forms: string[] = []) => !q || lemma.includes(q) || forms.some((f) => f.includes(q));
        let out: WordRow[] = [];
        if (opts.tab === 'unlisted') {
          out = rows.filter((r) => (r.kind === 'unlisted' || (opts.includeNames && r.kind === 'name')) && !r.ignored && inIncluded(book, r.occurrencesByChapter))
            .filter((r) => inChapter(r.occurrencesByChapter) && matches(r.lemma, r.forms))
            .sort((a, b) => b.occurrences - a.occurrences || a.firstPosition - b.firstPosition)
            .map((r) => { const ch = firstChapter(r.occurrencesByChapter);
              return { lemma: r.lemma, kind: r.kind, occurrences: r.occurrences, example: r.example, chapterIndex: ch,
                chapterTitle: chapterTitle(book, ch), name: r.kind === 'name' }; });
        } else if (opts.tab === 'skipped') {
          const listed = rows.filter((r) => (r.kind === 'belowLevel' || r.kind === 'cognate') && inChapter(r.occurrencesByChapter) && matches(r.lemma, r.forms));
          const entries = await ctx.wordList.entries(listed.map((r) => r.lemma));
          out = listed.sort((a, b) => a.firstPosition - b.firstPosition).map((r) => {
            const e = entries.get(r.lemma);
            const ch = firstChapter(r.occurrencesByChapter);
            return { lemma: r.lemma, kind: r.kind, occurrences: r.occurrences, example: r.example, chapterIndex: ch, chapterTitle: chapterTitle(book, ch),
              translations: e ? resolveCardContent(e, true)?.translations : undefined, definition: e?.def, pos: e?.pos, listLevel: e ? levelOfRank(e.rank) : undefined };
          });
        } else {
          const status = opts.tab === 'active' ? 'active' : opts.tab === 'known' ? 'known' : 'removed';
          out = cards.filter((c) => c.status === status && inChapter(c.occurrencesByChapter, c.chapterIndex) && matches(c.lemma, c.forms))
            .sort((a, b) => a.firstPosition - b.firstPosition)
            .map((c) => ({ lemma: c.lemma, kind: 'card' as const, occurrences: c.occurrences, example: c.example, chapterIndex: c.chapterIndex,
              chapterTitle: chapterTitle(book, c.chapterIndex), card: cardView(c), translations: c.translations, definition: c.definition, pos: c.pos, listLevel: c.listLevel }));
          if (opts.tab === 'known') {
            const withCard = new Set(cards.map((c) => c.lemma));
            out.push(...rows.filter((r) => r.kind === 'known' && !withCard.has(r.lemma) && inChapter(r.occurrencesByChapter) && matches(r.lemma, r.forms))
              .map((r) => { const ch = firstChapter(r.occurrencesByChapter);
                return { lemma: r.lemma, kind: r.kind, occurrences: r.occurrences, example: r.example, chapterIndex: ch, chapterTitle: chapterTitle(book, ch) }; }));
          }
        }
        return out;
      }),

    counts: (bookId: string) =>
      ctx.uow.run(async (tx) => {
        const [book, rows, cards] = await Promise.all([getBook(tx, bookId), tx.bookLemmas.listByBook(bookId), tx.cards.listByBook(bookId)]);
        const withCard = new Set(cards.map((c) => c.lemma));
        return {
          unlisted: rows.filter((r) => r.kind === 'unlisted' && !r.ignored && inIncluded(book, r.occurrencesByChapter)).length,
          names: rows.filter((r) => r.kind === 'name' && inIncluded(book, r.occurrencesByChapter)).length,
          active: cards.filter((c) => c.status === 'active').length,
          known: cards.filter((c) => c.status === 'known').length + rows.filter((r) => r.kind === 'known' && !withCard.has(r.lemma)).length,
          removed: cards.filter((c) => c.status === 'removed').length,
          skipped: rows.filter((r) => r.kind === 'belowLevel' || r.kind === 'cognate').length,
        };
      }),

    suggest: (bookId: string, typed: string) => ctx.uow.run((tx) => suggestIn(tx, bookId, typed)),

    addWord: (bookId: string, typed: string, translations: string[]) =>
      ctx.uow.run(async (tx): Promise<CardView> => {
        const book = await getBook(tx, bookId);
        const settings = await tx.settings.get();
        const m = await matchTyped(ctx.wordList, typed);
        if (!m.lemma) throw new Error('Type a word');
        const ts = cleanTranslations(translations);
        const entry = m.listed ? (await ctx.wordList.entries([m.lemma])).get(m.lemma) : undefined;
        if (!ts.length && !entry?.def) throw new Error('Add a translation');
        const id = `${bookId}:${m.lemma}`;
        const existing = await tx.cards.get(id);
        if (existing) {
          const card: Card = { ...existing, status: 'active', translations: ts.length ? ts : existing.translations,
            translationSource: 'manual', origin: 'manual', edited: true };
          await tx.cards.saveMany([card]);
          return cardView(card);
        }
        const base = {
          id, bookId, lemma: m.lemma, translations: ts, definition: entry?.def, pos: entry?.pos ?? [],
          listLevel: entry ? levelOfRank(entry.rank) : undefined, translationSource: ts.length ? 'manual' : 'definition',
          origin: 'manual', status: 'active', level: 0, stats: { correct: 0, wrong: 0, failStreak: 0 },
        } as const;
        const row = await tx.bookLemmas.get(bookId, m.lemma);
        let card: Card;
        if (row) {
          const included = new Set(book.chapters.filter((c) => c.included).map((c) => c.index));
          const chs = Object.entries(row.occurrencesByChapter).filter(([, n]) => n > 0).map(([c]) => Number(c));
          const ch = chs.filter((c) => included.has(c)).sort((a, b) => a - b)[0] ?? Math.min(...chs);
          card = { ...base, forms: row.forms, occurrences: row.occurrences, occurrencesByChapter: row.occurrencesByChapter,
            firstPosition: row.firstPosition, chapterIndex: ch, example: row.example };
          await tx.bookLemmas.saveMany([{ ...row, kind: 'card', ignored: false }]);
        } else {
          const cards = await tx.cards.listByBook(bookId);
          const lemmas: BookLemma[] = [];
          const chapters = chapterProgress(book, cards, lemmas, settings.coverageTarget);
          const included = chapters.filter((c) => c.included);
          const ch = (included.find((c) => c.state === 'learning') ?? included[included.length - 1] ?? chapters[0])?.index ?? 0;
          const unseenHere = cards.filter((c) => c.status === 'active' && c.stats.correct + c.stats.wrong === 0
            && ((c.occurrencesByChapter[ch] ?? 0) > 0 || c.chapterIndex === ch));
          const minPos = unseenHere.length ? Math.min(...unseenHere.map((c) => c.firstPosition)) : 0;
          card = { ...base, forms: [m.lemma], occurrences: 0, occurrencesByChapter: {}, firstPosition: minPos - 1, chapterIndex: ch };
        }
        await tx.cards.saveMany([card]);
        return cardView(card);
      }),

    ignoreUnlisted: (bookId: string, lemma: string, ignored = true) =>
      ctx.uow.run(async (tx) => {
        const row = await tx.bookLemmas.get(bookId, lemma);
        if (row) await tx.bookLemmas.saveMany([{ ...row, ignored }]);
      }),

    /** what the lists offer per part of speech for this card's word (C13); empty when not in the lists */
    senses: async (cardId: string): Promise<SenseOption[]> => {
      const card = await ctx.uow.run((tx) => tx.cards.get(cardId));
      if (!card) throw new Error('Card not found');
      const e = (await ctx.wordList.entries([card.lemma])).get(card.lemma);
      return e ? senseOptions(e) : [];
    },

    editTranslation: (cardId: string, translations: string[]) =>
      ctx.uow.run(async (tx) => {
        const card = await tx.cards.get(cardId);
        if (!card) throw new Error('Card not found');
        const ts = cleanTranslations(translations);
        if (!ts.length && !card.definition) throw new Error('A card needs a translation');
        await tx.cards.saveMany([{ ...card, translations: ts, edited: true, translationSource: 'manual' }]);
      }),

    setStatus: (cardId: string, status: Card['status']) =>
      ctx.uow.run(async (tx) => {
        const card = await tx.cards.get(cardId);
        if (!card) throw new Error('Card not found');
        await tx.cards.saveMany([{ ...card, status }]);
        if (status === 'known') await tx.knownWords.addMany([card.lemma]);
        if (status === 'active' && card.status === 'known') await tx.knownWords.remove(card.lemma);
      }),
  };
}
