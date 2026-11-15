/** Hand-built EpubContent for tests. */
import type { EpubContent } from '../domain/types.ts';

export interface FixtureBook {
  title?: string;
  toc?: EpubContent['toc'];
  sections: (string | { text: string; anchorIds?: string[]; links?: { section: number; anchorId?: string }[] })[][];
}

export function buildContent(b: FixtureBook): EpubContent {
  return {
    meta: { title: b.title ?? 'Test Book', author: 'A. Author' },
    toc: b.toc ?? [],
    sections: b.sections.map((blocks) => ({
      blocks: blocks.map((x) => (typeof x === 'string' ? { text: x, anchorIds: [], links: [] } : { anchorIds: [], links: [], ...x })),
    })),
  };
}
