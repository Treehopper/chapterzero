import { createApp } from '../app.ts';
import { buildContent, type FixtureBook } from '../testing/content.ts';
import { fixtureWordList } from '../testing/fixture.ts';
import { MemoryEpubReader, memoryPorts } from '../testing/memory.ts';

const COMMON = 'the man was in the house and he said that it was a good day'.split(' ');

/** `n` word tokens of common words, as sentences of 8–16 words. */
export function filler(n: number): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(COMMON[i % COMMON.length]);
  const sentences: string[] = [];
  for (let i = 0; i < out.length; i += 14) {
    const s = out.slice(i, i + 14).join(' ');
    sentences.push(s.charAt(0).toUpperCase() + s.slice(1) + '.');
  }
  return sentences.join(' ');
}

export function setup(book?: FixtureBook, opts: { now?: Date } = {}) {
  const ports = memoryPorts({ wordList: fixtureWordList(), epub: new MemoryEpubReader(book ? buildContent(book) : buildContent({ sections: [] })), now: opts.now });
  const app = createApp(ports);
  return { ports, app };
}

export const buf = new ArrayBuffer(1);

/** A two-chapter novel: chapter words are known exactly. */
export function twoChapterBook(): FixtureBook {
  return {
    title: 'Two Chapters',
    toc: [
      { title: 'Contents', depth: 0, section: 0 },
      { title: 'One', depth: 0, section: 1 },
      { title: 'Two', depth: 0, section: 2 },
    ],
    sections: [
      ['Contents One Two'],
      [`The man would relinquish the lantern near the scythe. The gaunt man with the lantern and the scythe would relinquish the quill, the parchment and the dagger by the hearth. ${filler(300)} He would relinquish it again, the gaunt man said in the house.`],
      [`The tempest came and the ravine was dark at dusk; the rampart and the thicket and the bough were ashen in the gale. ${filler(300)} The tempest and the ravine were in the dusk when he said it was good.`],
    ],
  };
}
