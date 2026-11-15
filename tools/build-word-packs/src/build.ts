/**
 * Builds the three word packs of README §6 from Wiktextract (kaikki.org), FreeDict eng-deu
 * and wordfreq, and writes them with a manifest to apps/pwa/public/packs.
 */
import { createReadStream, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { createGunzip, gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { decode } from '@msgpack/msgpack';
import { OUT_DIR, SOURCES } from './sources.ts';
import {
  ALLOWED_POS, COMMON_MAX_RANK, LIST_MAX_RANK, cutDefinition, isCognate, isUsableForm, isUsableHeadword,
  levelOfRank, normWord, planChunks, regularForms, spellingOfTarget, usableFormEntry,
} from './rules.ts';

const MAX_CHUNK = 2 * 1024 * 1024;
const VERSION = new Date().toISOString().slice(0, 10);
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);

// ---------------------------------------------------------------- 1. wordfreq
log('reading wordfreq');
const freq = new Map<string, number>();
{
  const data = decode(gunzipSync(readFileSync(SOURCES.wordfreq.path))) as unknown[];
  for (let i = 1; i < data.length; i++) {
    const f = 10 ** (-(i - 1) / 100);
    for (const w of data[i] as string[]) {
      const n = normWord(w);
      freq.set(n, (freq.get(n) ?? 0) + f);
    }
  }
}
log(`wordfreq: ${freq.size} words`);

// ---------------------------------------------------------------- 2. Wiktextract
interface Lemma { pos: Set<string>; de: string[]; def?: string; forms: Set<string>; hasForms: Set<string> }
const lemmas = new Map<string, Lemma>();
/** candidate (form → lemmas) pairs from form-of / alt-of entries and senses */
const formOf = new Map<string, Set<string>>();
/** pairs that only come from marginal spelling variants (obsolete, misspelling, …) */
const altOnly = new Map<string, Set<string>>();
const addPair = (form: string, lemma: string, alt: boolean) => {
  if (!isUsableForm(form) || !lemma) return;
  let s = formOf.get(form);
  if (!s) formOf.set(form, (s = new Set()));
  const a = altOnly.get(form) ?? new Set<string>();
  if (alt && !s.has(lemma)) a.add(lemma);
  if (!alt) a.delete(lemma);
  altOnly.set(form, a);
  s.add(lemma);
};

interface Sense { glosses?: string[]; tags?: string[]; form_of?: { word: string }[]; alt_of?: { word: string }[];
  translations?: Tr[] }
interface Tr { lang_code?: string; code?: string; word?: string }
interface Entry { word: string; pos: string; lang_code?: string; forms?: { form?: string; tags?: string[] }[];
  senses?: Sense[]; translations?: Tr[] }

const MARGINAL = new Set(['obsolete', 'archaic', 'misspelling', 'dialectal', 'rare', 'nonstandard', 'eye-dialect', 'pronunciation-spelling']);
const isDe = (t: Tr) => (t.lang_code ?? t.code) === 'de' && !!t.word;
let lines = 0;
let deSeen = 0;
log('reading Wiktextract');
const rl = createInterface({ input: createReadStream(SOURCES.wiktextract.path).pipe(createGunzip()), crlfDelay: Infinity });
for await (const line of rl) {
  lines++;
  if (lines % 200_000 === 0) log(`  ${lines} entries, ${lemmas.size} lemmas`);
  const e = JSON.parse(line) as Entry;
  if (e.lang_code && e.lang_code !== 'en') continue;
  if (!ALLOWED_POS.has(e.pos)) continue;
  if (!isUsableHeadword(e.word)) continue;
  const word = normWord(e.word);
  const senses = e.senses ?? [];
  const real: Sense[] = [];
  for (const s of senses) {
    const inflections = (s.form_of ?? []).map((t) => normWord(t.word ?? ''));
    const spellings = (s.alt_of ?? []).map((t) => normWord(t.word ?? ''));
    const g = s.glosses?.[0] ?? '';
    const spelled = inflections.length + spellings.length === 0 ? spellingOfTarget(g) : undefined;
    if (spelled) spellings.push(normWord(spelled));
    const pointer = inflections.length + spellings.length > 0 || s.tags?.includes('form-of') || s.tags?.includes('alt-of');
    const marginal = !!s.tags?.some((t) => MARGINAL.has(t));
    for (const t of inflections) if (t !== word) addPair(word, t, false);
    for (const t of spellings) if (t !== word) addPair(word, t, marginal);
    if (!pointer && g) real.push(s);
  }
  if (real.length === 0) continue; // rule 2: only feeds the forms table
  let l = lemmas.get(word);
  if (!l) lemmas.set(word, (l = { pos: new Set(), de: [], forms: new Set(), hasForms: new Set() }));
  l.pos.add(e.pos);
  const trs = [...real.flatMap((s) => s.translations ?? []), ...(e.translations ?? [])].filter(isDe);
  for (const t of trs) {
    const w = t.word!.normalize('NFC').trim();
    if (w && l.de.length < 6 && !l.de.includes(w)) l.de.push(w);
  }
  if (trs.length) deSeen++;
  if (!l.def) l.def = cutDefinition(real[0].glosses![0]);
  const fes = (e.forms ?? []).filter(usableFormEntry).filter((f) => normWord(f.form!) !== word);
  if (fes.length) l.hasForms.add(e.pos);
  for (const f of fes) l.forms.add(normWord(f.form!));
}
log(`Wiktextract: ${lines} entries, ${lemmas.size} lemmas, ${deSeen} with German, ${formOf.size} form-of forms`);

// candidate pairs: entry forms, form-of entries, identity, regular fallback
const candidates = new Map<string, Set<string>>(formOf);
const cand = (form: string, lemma: string) => {
  if (!lemmas.has(lemma) || !isUsableForm(form)) return;
  let s = candidates.get(form);
  if (!s) candidates.set(form, (s = new Set()));
  s.add(lemma);
};
for (const [form, ls] of formOf) {
  for (const l of [...ls]) {
    // a marginal spelling pointer never overrides a form that is a lemma in its own right
    // ("ere" is also an obsolete form of "ear"); inflections and standard spellings keep
    // §6.4 ("bore" → "bear", "centre" → "center")
    if (!lemmas.has(l) || (lemmas.has(form) && altOnly.get(form)?.has(l))) ls.delete(l);
  }
}
for (const [w, l] of lemmas) {
  cand(w, w);
  // skip a listed variant whose own entry calls it a marginal form of this lemma ("ere")
  for (const f of l.forms) if (!(lemmas.has(f) && altOnly.get(f)?.has(w))) cand(f, w);
  for (const p of ['noun', 'verb', 'adj']) {
    if (l.pos.has(p) && !l.hasForms.has(p)) for (const f of regularForms(w, p)) if (freq.has(f)) cand(f, w);
  }
}
for (const [f, s] of candidates) if (s.size === 0) candidates.delete(f);

// ---------------------------------------------------------------- 3. ranks (rule 4)
const own = (l: string) => freq.get(l) ?? 0;
const pick = (ls: Set<string>, better: (a: string, b: string) => boolean) => {
  let best = '';
  for (const l of ls) if (!best || better(l, best)) best = l;
  return best;
};
const summed = new Map<string, number>();
for (const [w, f] of freq) {
  const ls = candidates.get(w);
  if (!ls) continue;
  const winner = pick(ls, (a, b) => own(a) > own(b) || (own(a) === own(b) && a < b));
  summed.set(winner, (summed.get(winner) ?? 0) + f);
}
const ranked = [...summed.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
const rank = new Map<string, number>();
ranked.forEach(([l], i) => rank.set(l, i + 1));
log(`ranked lemmas: ${ranked.length}`);

// ---------------------------------------------------------------- 4. FreeDict (rule 5)
log('reading FreeDict');
const freedict = new Map<string, string[]>();
{
  const tei = readFileSync(SOURCES.freedict.tei, 'utf8');
  const entryRe = /<entry\b[\s\S]*?<\/entry>/g;
  const decodeXml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  for (const m of tei.matchAll(entryRe)) {
    const orth = /<orth>([^<]*)<\/orth>/.exec(m[0]);
    if (!orth) continue;
    const head = normWord(decodeXml(orth[1]).trim());
    const r = rank.get(head);
    if (!r || r <= COMMON_MAX_RANK || r > LIST_MAX_RANK) continue;
    const list = freedict.get(head) ?? [];
    for (const q of m[0].matchAll(/<cit type="trans">\s*<quote[^>]*>([^<]*)<\/quote>/g)) {
      const t = decodeXml(q[1]).trim();
      if (t && list.length < 6 && !list.includes(t)) list.push(t);
    }
    if (list.length) freedict.set(head, list);
  }
}
log(`FreeDict: ${freedict.size} list headwords`);

// ---------------------------------------------------------------- 5. word table
type WordRow = [string, number, string[], string[], string | null, number];
const wordRows: WordRow[] = [];
const freedictRows: [string, string[]][] = [];
for (const [lemma, r] of rank) {
  if (r <= COMMON_MAX_RANK || r > LIST_MAX_RANK) continue;
  const l = lemmas.get(lemma)!;
  const fd = l.de.length === 0 ? freedict.get(lemma) : undefined;
  if (l.de.length === 0 && !fd && !l.def) continue; // rule 6
  const cognate = isCognate(lemma, l.de.length ? l.de : fd ?? []);
  wordRows.push([lemma, r, [...l.pos].sort(), l.de, l.def ?? null, cognate ? 1 : 0]);
  if (fd) freedictRows.push([lemma, fd]);
}
const listed = new Set(wordRows.map((w) => w[0]));

// sanity check (rule 8)
{
  const level1 = wordRows.filter((w) => levelOfRank(w[1]) === 1).slice(0, 1000);
  const empty = level1.filter((w) => w[3].length === 0).length;
  log(`sanity: ${empty} of ${level1.length} level-1 words without German`);
  if (empty > level1.length / 2) throw new Error('German translations look empty: check the Wiktextract field names');
}

// ---------------------------------------------------------------- 6. forms table (§6.4)
const formRows: [string, string][] = [];
for (const [form, ls] of candidates) {
  let winner = '';
  let wr = Infinity;
  for (const l of ls) {
    const r = rank.get(l);
    if (r !== undefined && r <= LIST_MAX_RANK && (r < wr || (r === wr && l < winner))) { winner = l; wr = r; }
  }
  if (!winner) continue;
  if (wr <= COMMON_MAX_RANK) formRows.push([form, '']);
  else if (!listed.has(winner)) continue;
  else if (form !== winner) formRows.push([form, winner]);
}

// ---------------------------------------------------------------- 7. write packs
const byFirst = <T extends [string, ...unknown[]]>(a: T, b: T) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
wordRows.sort(byFirst);
freedictRows.sort(byFirst);
formRows.sort(byFirst);

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });
const gz = (rows: unknown[]) => gzipSync(JSON.stringify(rows), { level: 9 });
function writePack(id: string, rows: unknown[], meta: { sources: string[]; licence: string }) {
  const chunks = planChunks(rows, (r) => gz(r).length, MAX_CHUNK);
  const out = chunks.map((c, i) => {
    const file = `${id}.${String(i).padStart(3, '0')}.json.gz`;
    const json = JSON.stringify(c);
    const data = gzipSync(json, { level: 9 });
    writeFileSync(join(OUT_DIR, file), data);
    // sha256Json: some servers send .gz with Content-Encoding: gzip, so the client gets the JSON
    return { file, bytes: data.length, rows: c.length, sha256: createHash('sha256').update(data).digest('hex'),
      sha256Json: createHash('sha256').update(json).digest('hex') };
  });
  const bytes = out.reduce((n, c) => n + c.bytes, 0);
  log(`${id}: ${rows.length} rows, ${out.length} chunks, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  return { id, version: VERSION, ...meta, entryCount: rows.length, bytes, chunks: out };
}
const packs = [
  writePack('words-en-de', wordRows, { sources: [SOURCES.wiktextract.url, SOURCES.wordfreq.url], licence: SOURCES.wiktextract.licence }),
  writePack('words-de-freedict', freedictRows, { sources: [SOURCES.freedict.url], licence: SOURCES.freedict.licence }),
  writePack('forms-en', formRows, { sources: [SOURCES.wiktextract.url, SOURCES.wordfreq.url], licence: SOURCES.wiktextract.licence }),
];
const total = packs.reduce((n, p) => n + p.bytes, 0);
writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify({ formatVersion: 1, name: 'English → German', packs }, null, 2));
log(`total ${(total / 1024 / 1024).toFixed(2)} MB${total > 10 * 1024 * 1024 ? ' — OVER the 10 MB target' : ''}`);
const perLevel: Record<number, number> = {};
for (const w of wordRows) perLevel[levelOfRank(w[1])] = (perLevel[levelOfRank(w[1])] ?? 0) + 1;
log('words per level', perLevel, 'cognates', wordRows.filter((w) => w[5]).length,
  'definition-only', wordRows.filter((w) => !w[3].length && !freedict.has(w[0])).length);
