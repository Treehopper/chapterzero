import { describe, expect, it } from 'vitest';
import { buf, filler, setup, twoChapterBook } from './helpers.ts';

async function imported() {
  const s = setup(twoChapterBook());
  const p = await s.app.books.analyse(buf);
  const b = await s.app.books.confirm(p.draftId, { includedChapters: p.includedChapters, cutoffRank: 2000 });
  return { ...s, book: b };
}

describe('reader (Epic R)', () => {
  it('stores the text at import and opens at the first included chapter', async () => {
    const { app, book } = await imported();
    expect(await app.reader.available(book.id)).toBe(true);
    const r = await app.reader.open(book.id);
    expect(r.chapters.map((c) => c.title)).toEqual(['Contents', 'One', 'Two']);
    expect(r.position).toEqual({ chapter: 1, block: 0 });
  });

  it('marks card words; plain runs and words put back together give the paragraph', async () => {
    const { app, book } = await imported();
    const ch = await app.reader.chapter(book.id, 1);
    const first = ch.blocks[0].segs;
    expect(first.map((s) => (typeof s === 'string' ? s : s.t)).join('')).toMatch(/^The man would relinquish the lantern/);
    const words = first.filter((s): s is { t: string; c: string } => typeof s !== 'string');
    expect(words.map((w) => w.t)).toContain('relinquish');
    const card = ch.cards[words.find((w) => w.t === 'relinquish')!.c];
    expect(card).toMatchObject({ lemma: 'relinquish', status: 'active' });
    expect(card.translations.length).toBeGreaterThan(0);
    expect(card.links.map((l) => l.name)).toContain('Wiktionary');
  });

  it('remembers the position; deleting the book removes text and position', async () => {
    const { app, book, ports } = await imported();
    await app.reader.savePosition(book.id, 2, 0);
    expect((await app.reader.open(book.id)).position).toEqual({ chapter: 2, block: 0 });
    await app.books.delete(book.id);
    expect(await ports.uow.run((tx) => tx.bookTexts.get(book.id))).toBeUndefined();
    expect(await ports.uow.run((tx) => tx.bookTexts.getPosition(book.id))).toBeUndefined();
  });

  it('marks names; their pop-up has the first sentences of the book they appear in', async () => {
    const s = setup({ sections: [
      [`Gandor saw the lantern. ${filler(200)} The hope of Gandor was small. The man spoke.`],
      [`Gandor rode on. Then Gandor slept. ${filler(200)} There was hope.`],
    ] });
    const p = await s.app.books.analyse(buf);
    const b = await s.app.books.confirm(p.draftId, { includedChapters: p.includedChapters, cutoffRank: 2000 });
    const r = await s.app.reader.open(b.id);
    const ch = await s.app.reader.chapter(b.id, r.chapters[0].index);
    const names = ch.blocks.flatMap((x) => x.segs).filter((x): x is { t: string; n: string } => typeof x !== 'string' && 'n' in x);
    expect(names.map((x) => x.t)).toEqual(['Gandor', 'Gandor', 'Gandor', 'Gandor']);
    expect(Object.keys(ch.names)).toEqual(['gandor']);
    expect(ch.names.gandor).toMatchObject({ name: 'Gandor', first: ['Gandor saw the lantern.', 'The hope of Gandor was small.', 'Gandor rode on.'] });
  });
});
