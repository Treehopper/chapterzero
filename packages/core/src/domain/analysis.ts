/** Import steps 5–8 (README §7.1): tokenise, match, names, aggregate. */
import type { WordList } from '../ports/index.ts';
import { buildStructure, removeRepeatedBlocks, splitSectionsAtTocAnchors, type PlacedBlock } from './structure.ts';
import { languageRules, type LanguageRules } from './language.ts';
import { cutAround, normalizeToken, tokenizeBlock, type Sentence } from './text.ts';
import type { BookTextChapter, Chapter, EpubContent, ImportDraft } from './types.ts';

interface TokenStat {
  token: string;
  count: number;
  /** occurrences right after a verb cue ("to", "would", "they" …) or a noun cue ("the", "his" …) */
  cues: { verb: number; noun: number };
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


async function resolveBatched(wordList: WordList, tokens: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < tokens.length; i += BATCH) {
    const r = await wordList.resolve(tokens.slice(i, i + BATCH));
    for (const [k, v] of r) out.set(k, v);
  }
  return out;
}

/** Resolves tokens; one the list doesn't know gets a second chance as another spelling (English: American). */
async function resolveAll(wordList: WordList, tokens: string[], lang: LanguageRules): Promise<Map<string, string>> {
  const out = await resolveBatched(wordList, tokens);
  const variants = new Map<string, string[]>();
  for (const t of tokens) if (!out.has(t)) { const v = lang.spellingVariants(t); if (v.length) variants.set(t, v); }
  const r = await resolveBatched(wordList, [...new Set([...variants.values()].flat())]);
  for (const [t, vs] of variants) {
    const hit = vs.find((v) => r.has(v));
    if (hit !== undefined) out.set(t, r.get(hit)!);
  }
  return out;
}

/** the part of speech a clear majority (⅔) of the votes points to, else none */
function bookPos(votes: Map<string, number>): string | undefined {
  const total = [...votes.values()].reduce((a, b) => a + b, 0);
  const [best] = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  return best && best[1] * 3 >= total * 2 ? best[0] : undefined;
}

export async function analyseContent(
  raw: EpubContent, wordList: WordList, onProgress?: (done: number, total: number, phase: string) => void,
): Promise<AnalysisResult> {
  const content = splitSectionsAtTocAnchors(removeRepeatedBlocks(raw));
  const pair = await wordList.pair();
  const lang = languageRules(pair.source);
  onProgress?.(0, 1, 'tokenising');
  const tokenized: Sentence[][][] = content.sections.map((s) => s.blocks.map((b) => tokenizeBlock(b.text, lang)));
  const blockTokens = tokenized.map((sec) =>
    sec.map((sents) => sents.reduce((n, s) => n + s.words.filter((w) => normalizeToken(w.raw, lang).kind !== 'digit').length, 0)));
  const structure = buildStructure(content, blockTokens);

  const a = await lemmasOf(structure.order.map((pb) => ({ chapter: pb.chapter, sents: tokenized[pb.section][pb.block] })),
    structure.chapters.length, wordList, lang, onProgress);
  const chapters: Chapter[] = structure.chapters.map((c) => ({ ...c, wordTokens: a.chapterTokens[c.index] }));
  return {
    book: {
      title: content.meta.title, author: content.meta.author, language: pair.source, translationLanguage: pair.target, coverDataUrl: content.meta.coverDataUrl,
      stats: { wordTokens: a.wordTokens, distinctWords: a.lemmas.length + a.common.length },
      works: structure.works, chapters,
    },
    lemmas: a.lemmas,
    listedLemmas: a.lemmas.filter((l) => l.listed).map((l) => l.lemma),
    nameLemmas: a.lemmas.filter((l) => l.name).map((l) => l.lemma),
    common: a.common,
    text: bookText(content, structure.order, structure.chapters.length),
    ...(content.meta.language ? { declaredLanguage: content.meta.language } : {}),
  };
}

export interface LemmaAnalysis {
  lemmas: AnalysisResult['lemmas'];
  common: AnalysisResult['common'];
  /** word tokens per chapter index, and in all */
  chapterTokens: number[];
  wordTokens: number;
}

/**
 * The book's stored text (Epic R) read again with the current word lists, chapters as they are (B3: update a book
 * after a word-list update without importing it again).
 */
export async function reanalyseText(text: BookTextChapter[], wordList: WordList, onProgress?: (done: number, total: number, phase: string) => void): Promise<LemmaAnalysis> {
  const lang = languageRules((await wordList.pair()).source);
  const placed = text.flatMap((ch, chapter) => ch.blocks.map((b) => ({ chapter, sents: tokenizeBlock(b.text, lang) })));
  return lemmasOf(placed, text.length, wordList, lang, onProgress);
}

/** Steps 5–8 on sentences placed in their chapters: counts, matching, names, one row per lemma. */
async function lemmasOf(placed: { chapter: number; sents: Sentence[] }[], chapters: number, wordList: WordList, lang: LanguageRules,
  onProgress?: (done: number, total: number, phase: string) => void): Promise<LemmaAnalysis> {
  const chapterTokens = new Array<number>(chapters).fill(0);
  const stats = new Map<string, TokenStat>();
  const common = new Map<string, Set<number>>();
  let pos = 0;
  const total = placed.length;
  placed.forEach((pb, i) => {
    if (i % 500 === 0) onProgress?.(i, total, 'tokenising');
    for (const sent of pb.sents) {
      let wcache: number | undefined;
      let first = true;
      let prev = '';
      for (const w of sent.words) {
        const t = normalizeToken(w.raw, lang);
        if (t.kind === 'digit') { prev = ''; continue; }
        const initial = first;
        first = false;
        const before = prev;
        prev = t.norm;
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
          st = { token: t.norm, count: 0, cues: { verb: 0, noun: 0 }, byChapter: new Map(), firstPos: p, nonInitial: 0, nonInitialCap: 0, initial: 0, initialCap: 0, caps: 0,
            first: { pos: p, text: sent.text, wc: wcache, at: w.index } };
          stats.set(t.norm, st);
        }
        st.count++;
        if (lang.verbCues.has(before)) st.cues.verb++;
        else if (lang.nounCues.has(before)) st.cues.noun++;
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
  const resolved = await resolveAll(wordList, distinct, lang);
  const hyphenParts = new Map<string, string[]>();
  const partTokens = new Set<string>();
  for (const t of distinct) {
    if (resolved.has(t) || !t.includes('-')) continue;
    const parts = t.split('-').filter(Boolean);
    hyphenParts.set(t, parts);
    for (const p of parts) partTokens.add(p);
  }
  const partResolved = await resolveAll(wordList, [...partTokens].filter((p) => !resolved.has(p)), lang);
  // numbers written as words ("twenty-nine", "ninth") are never cards: they count as common words
  // (lists built before the number flag: their parts of speech say "num")
  const listed = [...new Set([...resolved.values(), ...partResolved.values()].filter(Boolean))];
  const numbers = new Set<string>();
  for (let i = 0; i < listed.length; i += BATCH) {
    for (const [l, e] of await wordList.entries(listed.slice(i, i + BATCH))) if (e.number || e.pos[0] === 'num') numbers.add(l);
  }
  const resolvedAt = (t: string) => (resolved.has(t) ? resolved.get(t) : partResolved.get(t));
  const lookup = (t: string) => { const l = resolvedAt(t); return l && numbers.has(l) ? '' : l; };
  const formPos = await wordList.formPos(distinct.filter((t) => resolved.get(t)));

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
    const r = resolved.has(t) ? lookup(t) : undefined;
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
    const votes = new Map<string, number>();
    const vote = (p: string, n: number) => { if (n) votes.set(p, (votes.get(p) ?? 0) + n); };
    for (const st of a.stats) {
      const fp = formPos.get(st.token);
      if (fp) vote(fp, st.count);                 // "chafed" can only be the verb
      vote('verb', st.cues.verb);
      vote('noun', st.cues.noun);
      count += st.count; nonInitial += st.nonInitial; nonInitialCap += st.nonInitialCap;
      initial += st.initial; initialCap += st.initialCap; caps += st.caps;
      for (const [c, n] of st.byChapter) byChapter[c] = (byChapter[c] ?? 0) + n;
      if (st.firstPos < first.firstPos) first = st;
      if (st.firstGood && (!good || st.firstGood.pos < good.pos)) good = st.firstGood;
    }
    // names (step 7, B5): capitals only, or capitalised in ≥ 90 % of non-initial occurrences;
    // where every noun has a capital (German), only a word the list doesn't know and always capitalised
    const name = lang.capitalNames
      ? caps === count || (nonInitial > 0 && nonInitialCap / nonInitial >= 0.9) || (!a.listed && nonInitial === 0 && initial > 0 && initialCap === initial)
      : !a.listed && initialCap + nonInitialCap === count;
    const f = first.first;
    const example = f.wc >= 8 && f.wc <= 25 ? f.text : good ? good.text : cutAround(f.text, f.at, lang);
    lemmas.push({ lemma: a.lemma, listed: a.listed, name, forms: [...a.forms].sort(), occurrences: count,
      occurrencesByChapter: byChapter, firstPosition: first.firstPos, example, pos: bookPos(votes) });
  }
  lemmas.sort((x, y) => x.firstPosition - y.firstPosition);

  return { lemmas, common: [...common.entries()].map(([token, set]) => ({ token, chapters: [...set].sort((x, y) => x - y) })), chapterTokens, wordTokens: pos };
}

/** the reader's text (Epic R): each chapter's paragraphs in reading order, footnotes after their paragraph */
function bookText(content: EpubContent, order: PlacedBlock[], chapters: number): BookTextChapter[] {
  const out: BookTextChapter[] = Array.from({ length: chapters }, () => ({ blocks: [] }));
  for (const pb of order) {
    const text = content.sections[pb.section].blocks[pb.block].text.replace(/\s+/g, ' ').trim();
    if (text) out[pb.chapter].blocks.push(pb.note ? { text, note: true } : { text });
  }
  return out;
}
