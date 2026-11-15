/** Book structure: watermarks, works, chapters, kinds, footnotes (README §7.1 steps 2–4). */
import type { Chapter, EpubContent, Work } from './types.ts';

export const MIN_CHAPTER_TOKENS = 300;

type Block = EpubContent['sections'][number]['blocks'][number];

/** Step 2 (B14): drop blocks repeated in more than half of the sections. */
export function removeRepeatedBlocks(content: EpubContent): EpubContent {
  const n = content.sections.length;
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
  const sections = content.sections.map((s) => ({ blocks: s.blocks.filter((b) => norm(b.text) !== '' || b.anchorIds.length) }));
  if (n < 10) return { ...content, sections };
  const seen = new Map<string, number>();
  for (const s of sections) {
    for (const t of new Set(s.blocks.map((b) => norm(b.text)).filter(Boolean))) seen.set(t, (seen.get(t) ?? 0) + 1);
  }
  return {
    ...content,
    sections: sections.map((s) => ({ blocks: s.blocks.filter((b) => (seen.get(norm(b.text)) ?? 0) <= n / 2) })),
  };
}

const FRONT = /^(cover|title ?page|(table of )?contents|copyright.*|dedication|also by.*|imprint)$/i;
const BACK = /^(about the author.*|acknowledge?ments|(an )?(extract|excerpt|preview) from.*|.* publication|newsletter.*|e-?book licen[cs]e.*)$/i;
const NOTES = /^(foot|end)?notes$/i;

export function chapterKind(title: string): Chapter['kind'] | 'notes' {
  const t = title.trim().replace(/\s+/g, ' ');
  if (NOTES.test(t)) return 'notes';
  if (FRONT.test(t)) return 'frontMatter';
  if (BACK.test(t)) return 'backMatter';
  return 'story';
}

export interface PlacedBlock { section: number; block: number; chapter: number; note?: boolean }

export interface Structure {
  works: Work[];
  chapters: Omit<Chapter, 'wordTokens'>[];
  /** reading order of all blocks that are counted, with their chapter */
  order: PlacedBlock[];
}

interface Unit {
  start: number;
  title: string;
  workKey: number;
  kind: Chapter['kind'] | 'notes';
  intro?: boolean;
  sections: number[];
}

const truncate = (t: string) => {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > 60 ? s.slice(0, 59).trimEnd() + '…' : s;
};

/**
 * Steps 3–4. `blockTokens[s][b]` = word tokens of block b in section s.
 */
export function buildStructure(content: EpubContent, blockTokens: number[][]): Structure {
  const nSec = content.sections.length;
  const secTokens = blockTokens.map((bs) => bs.reduce((a, b) => a + b, 0));
  const workTitles: string[] = [];
  let units: Unit[] = [];

  const seenSections = new Set<number>();
  const toc = content.toc.filter((e) => {
    if (e.section < 0 || e.section >= nSec || seenSections.has(e.section)) return false;
    seenSections.add(e.section);
    return true;
  });

  if (toc.length >= 3) {
    const top = Math.min(...toc.map((e) => e.depth));
    const groups: { entry: (typeof toc)[number]; children: (typeof toc)[number][] }[] = [];
    for (const e of toc) {
      if (e.depth === top) groups.push({ entry: e, children: [] });
      else if (e.depth === top + 1 && groups.length) groups[groups.length - 1].children.push(e);
      // deeper entries: their sections join the chapter before them
    }
    const hasWorks = groups.some((g) => g.children.length > 0);
    if (!hasWorks) {
      workTitles.push(content.meta.title);
      for (const g of groups) units.push({ start: g.entry.section, title: g.entry.title, workKey: 0, kind: chapterKind(g.entry.title), sections: [] });
    } else {
      for (const g of groups) {
        const wk = workTitles.push(truncate(g.entry.title)) - 1;
        if (g.children.length === 0) {
          units.push({ start: g.entry.section, title: g.entry.title, workKey: wk, kind: chapterKind(g.entry.title), sections: [] });
          continue;
        }
        if (g.entry.section < g.children[0].section) {
          units.push({ start: g.entry.section, title: 'Opening', workKey: wk, kind: 'story', intro: true, sections: [] });
        }
        for (const c of g.children) units.push({ start: c.section, title: c.title, workKey: wk, kind: chapterKind(c.title), sections: [] });
      }
    }
    units.sort((a, b) => a.start - b.start);
    // assign sections: before the first entry → first unit; unclaimed → previous unit
    let u = 0;
    for (let s = 0; s < nSec; s++) {
      while (u + 1 < units.length && units[u + 1].start <= s) u++;
      units[u].sections.push(s);
    }
    // intro text: short → joins the work's first chapter
    const merged: Unit[] = [];
    for (let i = 0; i < units.length; i++) {
      const un = units[i];
      const next = units[i + 1];
      const tokens = un.sections.reduce((n, s) => n + secTokens[s], 0);
      if (un.intro && tokens < MIN_CHAPTER_TOKENS && next && next.workKey === un.workKey) {
        next.sections = [...un.sections, ...next.sections];
        continue;
      }
      merged.push(un);
    }
    units = merged;
  } else {
    workTitles.push(content.meta.title);
    let pending: Unit | undefined;
    let pendingTokens = 0;
    for (let s = 0; s < nSec; s++) {
      if (!pending || pendingTokens >= MIN_CHAPTER_TOKENS) {
        pending = { start: s, title: `Section ${units.length + 1}`, workKey: 0, kind: 'story', sections: [] };
        units.push(pending);
        pendingTokens = 0;
      }
      pending.sections.push(s);
      pendingTokens += secTokens[s];
    }
  }

  // ---- footnotes (B13)
  const noteUnits = units.filter((x) => x.kind === 'notes');
  const noteSections = new Set(noteUnits.flatMap((x) => x.sections));
  const linked = new Set<string>();
  for (let s = 0; s < nSec; s++) {
    if (noteSections.has(s)) continue;
    for (const b of content.sections[s].blocks) for (const l of b.links) if (l.anchorId && noteSections.has(l.section)) linked.add(`${l.section}#${l.anchorId}`);
  }
  /** note key → blocks */
  const notes = new Map<string, { section: number; block: number }[]>();
  /** unlinked note text per work */
  const orphanNotes = new Map<number, { section: number; block: number }[]>();
  for (const nu of noteUnits) {
    let current: { section: number; block: number }[] | undefined;
    for (const s of nu.sections) {
      content.sections[s].blocks.forEach((b: Block, bi) => {
        const key = b.anchorIds.map((a) => `${s}#${a}`).find((k) => linked.has(k));
        if (key) {
          current = [];
          for (const a of b.anchorIds) notes.set(`${s}#${a}`, current);
        } else if (b.anchorIds.length) {
          current = undefined; // an anchored note nothing links to
        }
        if (current) current.push({ section: s, block: bi });
        else {
          const list = orphanNotes.get(nu.workKey) ?? [];
          list.push({ section: s, block: bi });
          orphanNotes.set(nu.workKey, list);
        }
      });
    }
  }

  // ---- chapters and reading order
  const storyUnits = units.filter((x) => x.kind !== 'notes');
  const placedNotes = new Set<unknown>();
  type Pending = { unit: Unit; order: { section: number; block: number; note?: boolean }[]; tokens: number };
  const chs: Pending[] = storyUnits.map((unit) => ({ unit, order: [], tokens: 0 }));
  for (const ch of chs) {
    for (const s of ch.unit.sections) {
      content.sections[s].blocks.forEach((b, bi) => {
        ch.order.push({ section: s, block: bi });
        ch.tokens += blockTokens[s][bi];
        for (const l of b.links) {
          const note = l.anchorId ? notes.get(`${l.section}#${l.anchorId}`) : undefined;
          if (note && !placedNotes.has(note)) {
            placedNotes.add(note);
            for (const nb of note) {
              ch.order.push({ ...nb, note: true });
              ch.tokens += blockTokens[nb.section][nb.block];
            }
          }
        }
      });
    }
  }
  // unlinked note text (and notes whose linking chapter is gone) → last chapter of the work
  const leftovers = new Map(orphanNotes);
  for (const nu of noteUnits) {
    for (const note of new Set(notes.values())) {
      if (placedNotes.has(note) || note[0] === undefined || !nu.sections.includes(note[0].section)) continue;
      placedNotes.add(note);
      leftovers.set(nu.workKey, [...(leftovers.get(nu.workKey) ?? []), ...note]);
    }
  }
  for (const [wk, blocks] of leftovers) {
    const target = [...chs].reverse().find((c) => c.unit.workKey === wk) ?? chs[chs.length - 1];
    if (!target) continue;
    for (const nb of blocks) {
      target.order.push({ ...nb, note: true });
      target.tokens += blockTokens[nb.section][nb.block];
    }
  }

  // ---- merge short story chapters into a neighbour of the same work
  let list = chs;
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.unit.kind !== 'story' || c.tokens >= MIN_CHAPTER_TOKENS) continue;
      const sameWork = list.filter((x) => x.unit.workKey === c.unit.workKey && x.unit.kind === 'story');
      if (sameWork.length <= 1) continue;
      const next = list[i + 1];
      const prev = list[i - 1];
      if (next && next.unit.workKey === c.unit.workKey && next.unit.kind === 'story') {
        next.order = [...c.order, ...next.order];
        next.tokens += c.tokens;
      } else if (prev && prev.unit.workKey === c.unit.workKey && prev.unit.kind === 'story') {
        prev.order = [...prev.order, ...c.order];
        prev.tokens += c.tokens;
      } else continue;
      list = [...list.slice(0, i), ...list.slice(i + 1)];
      changed = true;
      break;
    }
  }

  // ---- works actually used, renumbered
  const usedWorkKeys = [...new Set(list.map((c) => c.unit.workKey))];
  const works: Work[] = usedWorkKeys.map((k, i) => ({ index: i, title: truncate(workTitles[k] ?? content.meta.title) }));
  const chapters: Structure['chapters'] = [];
  const order: PlacedBlock[] = [];
  list.forEach((c, i) => {
    const kind = c.unit.kind === 'notes' ? 'backMatter' : c.unit.kind;
    chapters.push({ index: i, workIndex: usedWorkKeys.indexOf(c.unit.workKey), title: truncate(c.unit.title) || `Section ${i + 1}`,
      kind, included: kind === 'story' });
    for (const o of c.order) order.push({ ...o, chapter: i });
  });
  return { works, chapters, order };
}
