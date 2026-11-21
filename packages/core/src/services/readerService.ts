/** Reader (Epic R): the book's text per chapter, with the words that are (or were) cards marked. */
import { displayTitle } from '../domain/coverage.ts';
import { normalizeToken, splitSentences, words } from '../domain/text.ts';
import { languageRules, type LanguageRules } from '../domain/language.ts';
import type { BookLemma, BookText, Card } from '../domain/types.ts';
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

/** a paragraph as plain runs, card words (`c` = card id) and names (`n` = the name's lemma) */
export type ReaderSegment = string | { t: string; c: string } | { t: string; n: string };

/** a name of the story: where it first appears in the book */
export interface ReaderName { lemma: string; name: string; occurrences: number; first: string[] }

export interface ReaderChapter {
  index: number; title: string;
  blocks: { segs: ReaderSegment[]; note?: boolean }[];
  /** the cards appearing in this chapter */
  cards: Record<string, ReaderCard>;
  /** the names appearing in this chapter, by lemma */
  names: Record<string, ReaderName>;
}

/** how many sentences a name's pop-up shows */
const FIRST_SENTENCES = 3;

/** a name written as a name: capitalized, or in a script without capitals ("hope" is no Hope) */
const asName = (raw: string, tok: { capitalized: boolean }) => tok.capitalized || raw.toLowerCase() === raw.toUpperCase();

/**
 * Card words and names of a paragraph: every token that is one of a card's forms or its lemma, or, written as a name,
 * one of a name's forms. `usedNames` collects the names found, with their first spelling here.
 */
export function segment(text: string, byForm: Map<string, Card>, used: Set<Card>, lang: LanguageRules,
  names: Map<string, BookLemma> = new Map(), usedNames: Map<string, string> = new Map()): ReaderSegment[] {
  const out: ReaderSegment[] = [];
  let at = 0;
  for (const w of words(text, lang)) {
    const tok = normalizeToken(w.raw, lang);
    const card = byForm.get(tok.norm);
    const name = card ? undefined : asName(w.raw, tok) ? names.get(tok.norm) : undefined;
    if (!card && !name) continue;
    if (w.index > at) out.push(text.slice(at, w.index));
    if (card) { out.push({ t: w.raw, c: card.id }); used.add(card); }
    else { out.push({ t: w.raw, n: name!.lemma }); if (!usedNames.has(name!.lemma)) usedNames.set(name!.lemma, w.raw); }
    at = w.index + w.raw.length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** the first sentences of the book, in reading order, in which one of the names appears (written as a name) */
export function firstSentences(order: number[], text: BookText, wanted: Map<string, BookLemma>, lang: LanguageRules, max = FIRST_SENTENCES): Map<string, string[]> {
  const out = new Map<string, string[]>([...wanted.values()].map((n) => [n.lemma, []]));
  const open = new Set(out.keys());
  const forms = [...wanted.keys()];
  for (const i of order) {
    for (const b of text.chapters[i]?.blocks ?? []) {
      if (!open.size) return out;
      const lower = b.text.toLowerCase();
      if (!forms.some((f) => open.has(wanted.get(f)!.lemma) && lower.includes(f))) continue;
      for (const s of splitSentences(b.text, lang)) {
        const here = new Set<string>();
        for (const w of words(s, lang)) {
          const tok = normalizeToken(w.raw, lang);
          const n = wanted.get(tok.norm);
          if (n && open.has(n.lemma) && asName(w.raw, tok)) here.add(n.lemma);
        }
        for (const l of here) {
          const list = out.get(l)!;
          list.push(s);
          if (list.length >= max) open.delete(l);
        }
      }
    }
  }
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
        const [book, text, cards, settings, nameRows] = await Promise.all([tx.books.get(bookId), tx.bookTexts.get(bookId), tx.cards.listByBook(bookId),
          tx.settings.get(), tx.bookLemmas.listByBook(bookId, 'name')]);
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
        const byName = new Map<string, BookLemma>();
        for (const n of nameRows) if (!n.ignored) for (const f of [n.lemma, ...n.forms]) if (!byForm.has(f)) byName.set(f, n);
        const usedNames = new Map<string, string>();
        const blocks = (text.chapters[index]?.blocks ?? []).map((b) => ({ segs: segment(b.text, byForm, used, lang, byName, usedNames), ...(b.note ? { note: true } : {}) }));
        const out: Record<string, ReaderCard> = {};
        for (const c of used) {
          out[c.id] = { id: c.id, lemma: c.lemma, pos: c.pos, translations: c.translations, definition: c.definition,
            status: c.status, box: c.level, links: links(c.lemma, settings, bookPair(book)) };
        }
        const wanted = new Map([...byName].filter(([, n]) => usedNames.has(n.lemma)));
        const first = firstSentences(book.chapters.map((c) => c.index), text, wanted, lang);
        const names: Record<string, ReaderName> = {};
        for (const n of nameRows) {
          const spelled = usedNames.get(n.lemma);
          if (spelled) names[n.lemma] = { lemma: n.lemma, name: spelled, occurrences: n.occurrences, first: first.get(n.lemma) ?? [] };
        }
        return { index, title: displayTitle(book, ch), blocks, cards: out, names };
      }),

    savePosition: (bookId: string, chapter: number, block: number) =>
      ctx.uow.run((tx) => tx.bookTexts.savePosition({ bookId, chapter, block, at: ctx.clock.now().toISOString() })),
  };
}
