/** Import steps 5–8 (README §7.1): tokenise, match, names, aggregate. */
import type { WordList } from '../ports/index.ts';
import { buildStructure, removeRepeatedBlocks } from './structure.ts';
import { cutAround, normalizeToken, tokenizeBlock, type Sentence } from './text.ts';
import type { Chapter, EpubContent, ImportDraft } from './types.ts';

interface TokenStat {
  count: number;
  byChapter: Map<number, number>;
  firstPos: number;
  nonInitial: number;
  nonInitialCap: number;
  initial: number;
  initialCap: number;
  caps: number;
  first: { pos: number; text: string; wc: number; at: number };
  firstGood?: { pos: number; text: string };
}

export type AnalysisResult = Omit<ImportDraft, 'id' | 'createdAt'>;

const BATCH = 2000;

async function resolveAll(wordList: WordList, tokens: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < tokens.length; i += BATCH) {
    const r = await wordList.resolve(tokens.slice(i, i + BATCH));
    for (const [k, v] of r) out.set(k, v);
  }
  return out;
}

export async function analyseContent(
  raw: EpubContent, wordList: WordList, onProgress?: (done: number, total: number, phase: string) => void,
): Promise<AnalysisResult> {
  const content = removeRepeatedBlocks(raw);
  onProgress?.(0, 1, 'tokenising');
  const tokenized: Sentence[][][] = content.sections.map((s) => s.blocks.map((b) => tokenizeBlock(b.text)));
  const blockTokens = tokenized.map((sec) =>
    sec.map((sents) => sents.reduce((n, s) => n + s.words.filter((w) => normalizeToken(w.raw).kind !== 'digit').length, 0)));
  const structure = buildStructure(content, blockTokens);

  const chapterTokens = new Array<number>(structure.chapters.length).fill(0);
  const stats = new Map<string, TokenStat>();
  const common = new Map<string, Set<number>>();
  let pos = 0;
  const total = structure.order.length;
  structure.order.forEach((pb, i) => {
    if (i % 500 === 0) onProgress?.(i, total, 'tokenising');
    for (const sent of tokenized[pb.section][pb.block]) {
      let wcache: number | undefined;
      let first = true;
      for (const w of sent.words) {
        const t = normalizeToken(w.raw);
        if (t.kind === 'digit') continue;
        const initial = first;
        first = false;
        chapterTokens[pb.chapter]++;
        const p = pos++;
        if (t.kind === 'contraction') {
          const set = common.get(t.norm) ?? new Set();
          set.add(pb.chapter);
          common.set(t.norm, set);
          continue;
        }
        let st = stats.get(t.norm);
        if (!st) {
          wcache ??= sent.words.length;
          st = { count: 0, byChapter: new Map(), firstPos: p, nonInitial: 0, nonInitialCap: 0, initial: 0, initialCap: 0, caps: 0,
            first: { pos: p, text: sent.text, wc: wcache, at: w.index } };
          stats.set(t.norm, st);
        }
        st.count++;
        st.byChapter.set(pb.chapter, (st.byChapter.get(pb.chapter) ?? 0) + 1);
        if (t.allCaps) st.caps++;
        if (initial) { st.initial++; if (t.capitalized) st.initialCap++; }
        else { st.nonInitial++; if (t.capitalized) st.nonInitialCap++; }
        if (!st.firstGood) {
          wcache ??= sent.words.length;
          if (wcache >= 8 && wcache <= 25) st.firstGood = { pos: p, text: sent.text };
        }
      }
    }
  });

  // ---- match (step 6)
  onProgress?.(0, 1, 'matching');
  const distinct = [...stats.keys()];
  const resolved = await resolveAll(wordList, distinct);
  const hyphenParts = new Map<string, string[]>();
  const partTokens = new Set<string>();
  for (const t of distinct) {
    if (resolved.has(t) || !t.includes('-')) continue;
    const parts = t.split('-').filter(Boolean);
    hyphenParts.set(t, parts);
    for (const p of parts) partTokens.add(p);
  }
  const partResolved = await resolveAll(wordList, [...partTokens].filter((p) => !resolved.has(p)));
  const lookup = (t: string) => (resolved.has(t) ? resolved.get(t) : partResolved.get(t));

  // ---- aggregate per lemma (step 8)
  interface Agg { lemma: string; listed: boolean; forms: Set<string>; stats: TokenStat[] }
  const aggs = new Map<string, Agg>();
  const add = (lemma: string, listed: boolean, form: string, st: TokenStat) => {
    let a = aggs.get(lemma);
    if (!a) aggs.set(lemma, (a = { lemma, listed, forms: new Set(), stats: [] }));
    a.listed ||= listed;
    a.forms.add(form);
    a.stats.push(st);
  };
  const addCommon = (token: string, st: TokenStat) => {
    const set = common.get(token) ?? new Set();
    for (const c of st.byChapter.keys()) set.add(c);
    common.set(token, set);
  };
  for (const [t, st] of stats) {
    const r = resolved.get(t);
    if (r === '') { addCommon(t, st); continue; }
    if (r !== undefined) { add(r, true, t, st); continue; }
    const parts = hyphenParts.get(t);
    if (parts) {
      const listedParts = parts.map((p) => lookup(p)).filter((l): l is string => !!l);
      if (listedParts.length) { for (const l of new Set(listedParts)) add(l, true, t, st); continue; }
      if (parts.every((p) => lookup(p) === '')) { addCommon(t, st); continue; }
    }
    add(t, false, t, st);
  }

  const lemmas: AnalysisResult['lemmas'] = [];
  for (const a of aggs.values()) {
    let count = 0, nonInitial = 0, nonInitialCap = 0, initial = 0, initialCap = 0, caps = 0;
    const byChapter: Record<number, number> = {};
    let first = a.stats[0];
    let good: TokenStat['firstGood'];
    for (const st of a.stats) {
      count += st.count; nonInitial += st.nonInitial; nonInitialCap += st.nonInitialCap;
      initial += st.initial; initialCap += st.initialCap; caps += st.caps;
      for (const [c, n] of st.byChapter) byChapter[c] = (byChapter[c] ?? 0) + n;
      if (st.firstPos < first.firstPos) first = st;
      if (st.firstGood && (!good || st.firstGood.pos < good.pos)) good = st.firstGood;
    }
    // names (step 7, B5): capitals only, or capitalised in ≥ 90 % of non-initial occurrences
    const name = caps === count
      || (nonInitial > 0 && nonInitialCap / nonInitial >= 0.9)
      || (!a.listed && nonInitial === 0 && initial > 0 && initialCap === initial);
    const f = first.first;
    const example = f.wc >= 8 && f.wc <= 25 ? f.text : good ? good.text : cutAround(f.text, f.at);
    lemmas.push({ lemma: a.lemma, listed: a.listed, name, forms: [...a.forms].sort(), occurrences: count,
      occurrencesByChapter: byChapter, firstPosition: first.firstPos, example });
  }
  lemmas.sort((x, y) => x.firstPosition - y.firstPosition);

  const chapters: Chapter[] = structure.chapters.map((c) => ({ ...c, wordTokens: chapterTokens[c.index] }));
  const commonList = [...common.entries()].map(([token, set]) => ({ token, chapters: [...set].sort((a, b) => a - b) }));
  return {
    book: {
      title: content.meta.title, author: content.meta.author, language: 'en', coverDataUrl: content.meta.coverDataUrl,
      stats: { wordTokens: pos, distinctWords: lemmas.length + commonList.length },
      works: structure.works, chapters,
    },
    lemmas,
    listedLemmas: lemmas.filter((l) => l.listed).map((l) => l.lemma),
    nameLemmas: lemmas.filter((l) => l.name).map((l) => l.lemma),
    common: commonList,
  };
}
