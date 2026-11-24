import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyseContent } from '@chapterzero/core';
import { fixtureWordList } from '@chapterzero/core/testing';
import { ZipEpubReader } from './index.ts';

const root = join(import.meta.dirname, '../../../fixtures/epub');
const load = (f: string) => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

describe('ZipEpubReader on the generated fixture', () => {
  it('reads nav TOC, works, footnote links and drops external link text', async () => {
    const c = await new ZipEpubReader().read(load(join(root, 'omnibus-fixture.epub')));
    expect(c.meta).toMatchObject({ title: 'The Lantern Omnibus', author: 'Fixture Author' });
    expect(c.toc.map((t) => `${t.depth}:${t.title}`)).toEqual([
      '0:Cover', '0:Contents', '0:The Moor', '1:One', '1:Two', '0:The Harbour', '1:One', '1:Two', '0:Footnotes', '0:About the Author']);
    const all = c.sections.flatMap((s) => s.blocks.map((b) => b.text)).join('\n');
    expect(all).not.toContain('free-ebooks.example');
    const linkBlocks = c.sections.flatMap((s) => s.blocks).filter((b) => b.links.length);
    expect(linkBlocks.some((b) => b.links.some((l) => l.anchorId === 'fn1'))).toBe(true);
    const notes = c.sections[c.toc.find((t) => t.title === 'Footnotes')!.section];
    expect(notes.blocks.find((b) => b.anchorIds.includes('fn1'))?.text).toMatch(/tempest/);
  });

  it('analyses into works and chapters with footnotes folded in', async () => {
    const c = await new ZipEpubReader().read(load(join(root, 'omnibus-fixture.epub')));
    const r = await analyseContent(c, fixtureWordList());
    expect(r.book.works.map((w) => w.title)).toEqual(['Cover', 'Contents', 'The Moor', 'The Harbour', 'About the Author']);
    expect(r.book.chapters.filter((ch) => ch.included).map((ch) => `${r.book.works[ch.workIndex].title} · ${ch.title}`))
      .toEqual(['The Moor · One', 'The Moor · Two', 'The Harbour · One', 'The Harbour · Two']);
    const tempest = r.lemmas.find((l) => l.lemma === 'tempest')!;
    expect(Object.keys(tempest.occurrencesByChapter).map(Number)).toContain(r.book.chapters.find((ch) => ch.title === 'One')!.index);
    expect(r.lemmas.some((l) => l.lemma.includes('ebooks'))).toBe(false);
  });
});

const dl = join(root, 'downloaded');
const real = existsSync(dl) ? readdirSync(dl).filter((f) => f.endsWith('.epub')) : [];
describe.skipIf(real.length === 0)('real EPUBs (fixtures/epub/downloaded)', () => {
  for (const f of real) {
    it(`reads ${f}`, async () => {
      const c = await new ZipEpubReader().read(load(join(dl, f)));
      expect(c.sections.length).toBeGreaterThan(2);
      expect(c.toc.length).toBeGreaterThan(2);
      const text = c.sections.flatMap((s) => s.blocks.map((b) => b.text)).join(' ');
      expect(text).not.toMatch(/START OF (THE|THIS) PROJECT GUTENBERG/);
      const r = await analyseContent(c, fixtureWordList());
      const inc = r.book.chapters.filter((ch) => ch.included);
      expect(inc.length).toBeGreaterThan(0);
      expect(inc.every((ch) => ch.wordTokens >= 300 || inc.filter((x) => x.workIndex === ch.workIndex).length === 1)).toBe(true);
    }, 30_000);
  }
});
