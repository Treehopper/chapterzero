/** Reader (Epic R): the book's text per chapter, with the words that are (or were) cards marked. */
import { displayTitle } from '../domain/coverage.ts';
import { normalizeToken, words } from '../domain/text.ts';
import { languageRules, type LanguageRules } from '../domain/language.ts';
import type { Card } from '../domain/types.ts';
import { bookPair, links, type Ctx } from './context.ts';

export interface ReaderBook {
  bookId: string; title: string;
  /** the book's language (lang and dir of the text) */
  language: string;
  chapters: { index: number; title: string; included: boolean; blocks: number }[];
  /** where to open: the saved position, else the first included chapter */
  position: { chapter: number; block: number };
}

export interface ReaderCard {
  id: string; lemma: string; pos: string[]; translations: string[]; definition?: string;
  status: Card['status']; box: number; links: { name: string; url: string }[];
}

/** a paragraph as plain runs and card words (`c` = card id) */
export type ReaderSegment = string | { t: string; c: string };

export interface ReaderChapter {
  index: number; title: string;
  blocks: { segs: ReaderSegment[]; note?: boolean }[];
  /** the cards appearing in this chapter */
  cards: Record<string, ReaderCard>;
}

/** card words of a paragraph: every token that is one of a card's forms or its lemma */
export function segment(text: string, byForm: Map<string, Card>, used: Set<Card>, lang: LanguageRules): ReaderSegment[] {
  const out: ReaderSegment[] = [];
  let at = 0;
  for (const w of words(text, lang)) {
    const card = byForm.get(normalizeToken(w.raw, lang).norm);
    if (!card) continue;
    if (w.index > at) out.push(text.slice(at, w.index));
    out.push({ t: w.raw, c: card.id });
    used.add(card);
    at = w.index + w.raw.length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

export function readerService(ctx: Ctx) {
  return {
    /** books imported before Epic R have no stored text */
    available: (bookId: string) => ctx.uow.run((tx) => tx.bookTexts.has(bookId)),

    open: (bookId: string): Promise<ReaderBook> =>
      ctx.uow.run(async (tx) => {
        const [book, text, pos] = await Promise.all([tx.books.get(bookId), tx.bookTexts.get(bookId), tx.bookTexts.getPosition(bookId)]);
        if (!book) throw new Error('Book not found');
        if (!text) throw new Error('This book was imported before the reader existed; import it again to read it here');
        const chapters = book.chapters.map((c) => ({ index: c.index, title: displayTitle(book, c), included: c.included, blocks: text.chapters[c.index]?.blocks.length ?? 0 }));
        const first = chapters.find((c) => c.included && c.blocks) ?? chapters.find((c) => c.blocks) ?? chapters[0];
        return { bookId, title: book.title, language: book.language, chapters, position: pos ? { chapter: pos.chapter, block: pos.block } : { chapter: first?.index ?? 0, block: 0 } };
      }),

    chapter: (bookId: string, index: number): Promise<ReaderChapter> =>
      ctx.uow.run(async (tx) => {
        const [book, text, cards, settings] = await Promise.all([tx.books.get(bookId), tx.bookTexts.get(bookId), tx.cards.listByBook(bookId), tx.settings.get()]);
        if (!book || !text) throw new Error('Book not found');
        const ch = book.chapters.find((c) => c.index === index);
        if (!ch) throw new Error('Chapter not found');
        // active cards win over retired ones when two share a form
        const byForm = new Map<string, Card>();
        for (const c of [...cards].sort((a, b) => Number(a.status === 'active') - Number(b.status === 'active'))) {
          for (const f of [c.lemma, ...c.forms]) byForm.set(f, c);
        }
        const used = new Set<Card>();
        const lang = languageRules(book.language);
        const blocks = (text.chapters[index]?.blocks ?? []).map((b) => ({ segs: segment(b.text, byForm, used, lang), ...(b.note ? { note: true } : {}) }));
        const out: Record<string, ReaderCard> = {};
        for (const c of used) {
          out[c.id] = { id: c.id, lemma: c.lemma, pos: c.pos, translations: c.translations, definition: c.definition,
            status: c.status, box: c.level, links: links(c.lemma, settings, bookPair(book)) };
        }
        return { index, title: displayTitle(book, ch), blocks, cards: out };
      }),

    savePosition: (bookId: string, chapter: number, block: number) =>
      ctx.uow.run((tx) => tx.bookTexts.savePosition({ bookId, chapter, block, at: ctx.clock.now().toISOString() })),
  };
}
