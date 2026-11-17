import { describe, expect, it } from 'vitest';
import { analyseContent } from '../domain/analysis.ts';
import { buildStructure, chapterKind, removeRepeatedBlocks } from '../domain/structure.ts';
import { americanVariants, normalizeToken, cutAround, words } from '../domain/text.ts';
import { buildContent } from '../testing/content.ts';
import { fixtureWordList } from '../testing/fixture.ts';
import { MemoryWordList } from '../testing/memory.ts';
import { buf, filler, setup } from './helpers.ts';

describe('tokens (§7.1 step 5)', () => {
  it('normalises possessives, contractions, digits and capitals', () => {
    expect(normalizeToken('Harbour’s')).toMatchObject({ kind: 'word', norm: 'harbour', capitalized: true });
    expect(normalizeToken("dogs'")).toMatchObject({ kind: 'word', norm: 'dogs' });
    expect(normalizeToken('didn’t').kind).toBe('contraction');
    expect(normalizeToken('they’d').kind).toBe('contraction');
    expect(normalizeToken('1984').kind).toBe('digit');
    expect(normalizeToken('B52').kind).toBe('digit');
    expect(normalizeToken('PDF').allCaps).toBe(true);
    expect(normalizeToken('I').allCaps).toBe(false);
  });
  it('keeps hyphenated compounds and drops leading quote apostrophes', () => {
    expect(words("'Hello,' said the well-known man; lantern‐light").map((w) => w.raw)).toEqual(['Hello', 'said', 'the', 'well-known', 'man', 'lantern‐light']);
    expect(words("the dogs' bowls").map((w) => w.raw)).toEqual(['the', "dogs'", 'bowls']);
  });
  it('cuts long sentences around the word', () => {
    const s = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
    const cut = cutAround(s, s.indexOf('w30'));
    expect(words(cut.replace(/…/g, '')).length).toBe(25);
    expect(cut).toContain('w30');
  });
});

describe('structure (§7.1 steps 2–4)', () => {
  const tokens = (c: ReturnType<typeof buildContent>) => c.sections.map((s) => s.blocks.map((b) => words(b.text).length));

  it('two-level table of contents with repeated chapter names → works', () => {
    const c = buildContent({
      title: 'Omnibus',
      toc: [
        { title: 'Cover', depth: 0, section: 0 },
        { title: 'Death or Glory', depth: 0, section: 1 },
        { title: 'One', depth: 1, section: 2 },
        { title: 'Two', depth: 1, section: 4 },
        { title: 'Duty Calls', depth: 0, section: 5 },
        { title: 'One', depth: 1, section: 6 },
        { title: 'Two', depth: 1, section: 7 },
        { title: 'About the Author', depth: 0, section: 8 },
      ],
      sections: [['Cover'], ['Death or Glory'], [filler(300)], ['An untitled interlude ' + filler(200)], [filler(320)], [filler(500)], [filler(300)], [filler(300)], ['About the author ' + filler(50)]],
    });
    const s = buildStructure(c, tokens(c));
    expect(s.works.map((w) => w.title)).toEqual(['Cover', 'Death or Glory', 'Duty Calls', 'About the Author']);
    const chs = s.chapters.map((ch) => `${s.works[ch.workIndex].title}/${ch.title}/${ch.kind}/${ch.included}`);
    // short "Death or Glory" title page joins its first chapter; a long work intro is an "Opening"
    expect(chs).toEqual([
      'Cover/Cover/frontMatter/false', 'Death or Glory/One/story/true', 'Death or Glory/Two/story/true',
      'Duty Calls/Opening/story/true', 'Duty Calls/One/story/true', 'Duty Calls/Two/story/true', 'About the Author/About the Author/backMatter/false',
    ]);
    // the untitled section 3 joins chapter One of Death or Glory
    expect(s.order.filter((o) => o.section === 3).every((o) => o.chapter === 1)).toBe(true);
  });

  it('flat table of contents and short chapter merging', () => {
    const c = buildContent({
      toc: [{ title: 'Contents', depth: 0, section: 0 }, { title: 'Prologue', depth: 0, section: 1 }, { title: 'Chapter 1', depth: 0, section: 2 }, { title: 'Chapter 2', depth: 0, section: 3 }],
      sections: [['Contents'], [filler(50)], [filler(400)], [filler(100)]],
    });
    const s = buildStructure(c, tokens(c));
    expect(s.works).toHaveLength(1);
    expect(s.chapters.map((x) => x.title)).toEqual(['Contents', 'Chapter 1']);
    expect(s.chapters[0].included).toBe(false);
  });

  it('no usable table of contents → sections of ≥ 300 tokens', () => {
    const c = buildContent({ sections: [[filler(100)], [filler(250)], [filler(310)], [filler(20)], [filler(400)]] });
    const s = buildStructure(c, tokens(c));
    // 100+250 → S1; 310 → S2 (pending was ≥ 300); 20 starts S3, 400 is appended to it
    expect(s.chapters.map((x) => x.title)).toEqual(['Section 1', 'Section 2', 'Section 3']);
    expect(new Set(s.order.filter((o) => o.chapter === 0).map((o) => o.section))).toEqual(new Set([0, 1]));
    expect(new Set(s.order.filter((o) => o.chapter === 2).map((o) => o.section))).toEqual(new Set([3, 4]));
  });

  it('chapter kinds by title', () => {
    expect(chapterKind('Table of Contents')).toBe('frontMatter');
    expect(chapterKind('Copyright Page')).toBe('frontMatter');
    expect(chapterKind('An Extract from Baneblade')).toBe('backMatter');
    expect(chapterKind('Acknowledgments')).toBe('backMatter');
    expect(chapterKind('eBook license')).toBe('backMatter');
    expect(chapterKind('Endnotes')).toBe('notes');
    expect(chapterKind('Footnotes')).toBe('notes');
    expect(chapterKind('The Hound')).toBe('story');
  });

  it('footnotes are placed after the linking block; unlinked note text goes to the last chapter', () => {
    const c = buildContent({
      toc: [{ title: 'One', depth: 0, section: 0 }, { title: 'Two', depth: 0, section: 1 }, { title: 'Footnotes', depth: 0, section: 2 }],
      sections: [
        [filler(300), { text: 'He saw the scythe.', links: [{ section: 2, anchorId: 'n1' }] }, filler(20)],
        [filler(300)],
        ['Footnotes heading', { text: 'A note about the tempest.', anchorIds: ['n1'] }, 'More of the note.', { text: 'An orphan note on dusk.', anchorIds: ['n2'] }],
      ],
    });
    const s = buildStructure(c, tokens(c));
    expect(s.chapters.map((x) => x.title)).toEqual(['One', 'Two']);
    const ch0 = s.order.filter((o) => o.chapter === 0).map((o) => `${o.section}:${o.block}`);
    expect(ch0).toEqual(['0:0', '0:1', '2:1', '2:2', '0:2']);
    const ch1 = s.order.filter((o) => o.chapter === 1).map((o) => `${o.section}:${o.block}`);
    expect(ch1).toEqual(['1:0', '2:0', '2:3']);
  });

  it('removes watermarks repeated in more than half of the sections', () => {
    const sections = Array.from({ length: 12 }, (_, i) => [`Text ${i} of the book.`, 'Downloaded from www.free-ebooks.example']);
    const c = removeRepeatedBlocks(buildContent({ sections }));
    expect(c.sections.every((s) => s.blocks.length === 1)).toBe(true);
  });
});

describe('analyse + classify (§7.1 steps 6–9)', () => {
  const book = {
    title: 'Matching',
    sections: [[
      `He strode to the tavern and was striding again; the geese and oxen saw the shelves. ${filler(100)}`,
      `Gandor said the PDF was in the house. ${filler(30)} The man said that Gandor was good. Gandor was in the house.`,
      `He didn't relinquish the lantern-light, nor the fooble-wock, nor the-man. The melancholy man saw the harbour's tempest.`,
      `The WHISPER was a whisper in the house, the man said.`,
    ]],
  };

  it('matches forms, hyphens, names and contractions', async () => {
    const r = await analyseContent(buildContent(book), fixtureWordList());
    const by = new Map(r.lemmas.map((l) => [l.lemma, l]));
    expect(by.get('stride')?.forms).toEqual(['striding', 'strode']);
    expect(by.get('stride')?.occurrences).toBe(2);
    expect(by.get('goose')?.listed).toBe(true);
    expect(by.get('ox')?.listed).toBe(true);
    expect(by.get('shelf')?.listed).toBe(true);
    expect(by.get('harbor')?.forms).toEqual(['harbour']);
    expect(by.get('lantern')?.forms).toEqual(['lantern-light']);
    expect(by.get('fooble-wock')?.listed).toBe(false);
    expect(by.has('the-man')).toBe(false);
    expect(by.get('gandor')?.name).toBe(true);
    expect(by.get('pdf')?.name).toBe(true);
    expect(by.get('whisper')?.name).toBe(false);
    expect(r.common.some((c) => c.token === "didn't")).toBe(true);
    expect(by.get('relinquish')?.example).toBe("He didn't relinquish the lantern-light, nor the fooble-wock, nor the-man.");
  });

  it('British spellings fall back to the American entry (-ise, -yse, -our, -re, -lled)', async () => {
    expect(americanVariants('realising')).toEqual(['realizing']);
    expect(americanVariants('materialisation')).toEqual(['materialization']);
    expect(americanVariants('analysed')).toEqual(['analyzed']);
    expect(americanVariants('colourful')).toEqual(['colorful']);
    expect(americanVariants('centres')).toEqual(['centers']);
    expect(americanVariants('travelled')).toEqual(['traveled']);
    expect(americanVariants('rise')).toEqual([]);
    const entry = (lemma: string, rank: number) => ({ lemma, rank, pos: ['verb'], de: ['x'] });
    const wl = new MemoryWordList([entry('realize', 3000), entry('materialize', 9000), entry('promise', 900)],
      [['realizing', 'realize'], ['realized', 'realize'], ['materialized', 'materialize']]);
    const r = await analyseContent(buildContent({ sections: [[
      `She was realising it, then realizing it, and the plan materialised. She promised nothing. ${filler(40)}`,
    ]] }), wl);
    const by = new Map(r.lemmas.map((l) => [l.lemma, l]));
    expect(by.get('realize')).toMatchObject({ listed: true, forms: ['realising', 'realizing'], occurrences: 2 });
    expect(by.get('materialize')).toMatchObject({ listed: true, forms: ['materialised'] });
    expect(by.has('realising')).toBe(false);
    expect(by.has('materialised')).toBe(false);
  });

  it('preview counts add up and follow the classification table', async () => {
    const { app, ports } = setup(book);
    await ports.uow.run((tx) => tx.knownWords.addMany(['tempest']));
    const p = await app.books.analyse(buf);
    const c = p.counts;
    expect(c.distinctWords).toBe(c.common + c.belowLevel + c.known + c.cognates + c.names + c.cards + c.unlisted);
    const conf = await app.books.confirm(p.draftId, { includedChapters: p.includedChapters });
    const rows = await ports.uow.run((tx) => tx.bookLemmas.listByBook(conf.id));
    const kind = (l: string) => rows.find((r) => r.lemma === l)?.kind;
    expect(kind('gandor')).toBe('name');            // rule 1
    expect(kind('fooble-wock')).toBe('unlisted');   // rule 2
    expect(kind('stride')).toBe('belowLevel');      // rule 3: 6,921 ≤ 8,000
    expect(kind('tempest')).toBe('known');          // rule 4
    expect(kind('melancholy')).toBe('cognate');     // rule 5
    expect(kind('relinquish')).toBe('card');        // rule 6
    const cards = await ports.uow.run((tx) => tx.cards.listByBook(conf.id));
    expect(cards.map((x) => x.lemma).sort()).toEqual(rows.filter((r) => r.kind === 'card').map((r) => r.lemma).sort());
    expect(cards.find((x) => x.lemma === 'relinquish')).toMatchObject({ status: 'active', level: 0, translationSource: 'list', listLevel: 6 });
  });

  it('cards follow first occurrence; unticking chapters changes the counts', async () => {
    const { app } = setup({
      toc: [{ title: 'One', depth: 0, section: 0 }, { title: 'Two', depth: 0, section: 1 }, { title: 'Three', depth: 0, section: 2 }],
      sections: [[`The scythe ${filler(300)}`], [`The rampart and the scythe ${filler(300)}`], [`The quill ${filler(300)}`]],
    });
    const p = await app.books.analyse(buf);
    expect(p.counts.cards).toBe(3);
    const p2 = await app.books.preview(p.draftId, { includedChapters: [0, 1] });
    expect(p2.counts.cards).toBe(2);
    expect(p2.counts.distinctWords).toBe(p2.counts.common + p2.counts.belowLevel + p2.counts.known + p2.counts.cognates + p2.counts.names + p2.counts.cards + p2.counts.unlisted);
    const tokens = p2.works[0].chapters.filter((c) => c.included).reduce((n, c) => n + c.wordTokens, 0);
    expect(tokens).toBe(302 + 305);
    expect(p2.coverageBefore).toBeCloseTo(1 - 3 / tokens, 9); // scythe ×2 + rampart
  });
});

describe('structure extensions', () => {
  it('splits sections at TOC fragments and remaps links', async () => {
    const { splitSectionsAtTocAnchors } = await import('../domain/structure.ts');
    const c = splitSectionsAtTocAnchors(buildContent({
      toc: [{ title: 'One', depth: 0, section: 0, anchorId: 'c1' }, { title: 'Two', depth: 0, section: 0, anchorId: 'c2' }],
      sections: [[{ text: 'Chapter one', anchorIds: ['c1'] }, 'a', { text: 'Chapter two', anchorIds: ['c2'] }, { text: 'b', links: [{ section: 0, anchorId: 'c2' }] }]],
    }));
    expect(c.sections.map((s) => s.blocks.map((b) => b.text))).toEqual([['Chapter one', 'a'], ['Chapter two', 'b']]);
    expect(c.toc.map((t) => t.section)).toEqual([0, 1]);
    expect(c.sections[1].blocks[1].links[0].section).toBe(1);
  });
  it('three-level TOC: leaves are chapters, prefixed by their part', () => {
    const c = buildContent({
      toc: [{ title: 'Travels', depth: 0, section: 0 }, { title: 'Part I: Lilliput', depth: 1, section: 1 },
        { title: 'Chapter I', depth: 2, section: 2 }, { title: 'Chapter II', depth: 2, section: 3 },
        { title: 'Part II: Brobdingnag', depth: 1, section: 4 }, { title: 'Chapter I', depth: 2, section: 5 },
        { title: 'Other Work', depth: 0, section: 6 }, { title: 'One', depth: 1, section: 7 }, { title: 'Two', depth: 1, section: 8 }],
      sections: [['Travels'], ['Part I'], [filler(300)], [filler(300)], ['Part II'], [filler(300)], ['Other'], [filler(300)], [filler(300)]],
    });
    const s = buildStructure(c, c.sections.map((x) => x.blocks.map((b) => words(b.text).length)));
    expect(s.chapters.map((x) => x.title)).toEqual(['Part I · Chapter I', 'Part I · Chapter II', 'Part II · Chapter I', 'One', 'Two']);
  });
});
