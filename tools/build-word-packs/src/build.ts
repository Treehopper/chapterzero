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
/** per part of speech: German translations and an English definition */
interface PosSense { de: string[]; def?: string }
interface Lemma { pos: Set<string>; mainPos?: string; senses: Map<string, PosSense>; forms: Set<string>; hasForms: Set<string> }
const lemmas = new Map<string, Lemma>();
/** (form, lemma) → the parts of speech that form belongs to ("chafed" → verb, "chafes" → noun + verb) */
const pairPos = new Map<string, Set<string>>();
const notePos = (form: string, lemma: string, pos: string) => {
  const k = `${form}\t${lemma}`;
  let s = pairPos.get(k);
  if (!s) pairPos.set(k, (s = new Set()));
  s.add(pos);
};
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
interface Entry { word: string; pos: string; lang_code?: string; etymology_number?: number; forms?: { form?: string; tags?: string[] }[];
  senses?: Sense[]; translations?: Tr[] }

const MARGINAL = new Set(['obsolete', 'archaic', 'misspelling', 'dialectal', 'rare', 'nonstandard', 'eye-dialect', 'pronunciation-spelling']);
const CLIPPING = new Set(['clipping', 'abbreviation']);
/** etymologies with real senses per word, and per (form, lemma) the etymologies of its current spelling pointers */
const realEtym = new Map<string, Set<number>>();
const spellingEtym = new Map<string, Set<number>>();
const inflected = new Set<string>();
const addTo = <K, V>(m: Map<K, Set<V>>, k: K, v: V) => { let x = m.get(k); if (!x) m.set(k, (x = new Set())); x.add(v); };
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
    const marginal = !!s.tags?.some((t) => MARGINAL.has(t) || CLIPPING.has(t));
    for (const t of inflections) if (t !== word) { addPair(word, t, false); notePos(word, t, e.pos); inflected.add(`${word}\t${t}`); }
    for (const t of spellings) if (t !== word) { addPair(word, t, marginal); if (!marginal) addTo(spellingEtym, `${word}\t${t}`, e.etymology_number ?? 0); }
    if (!pointer && g) real.push(s);
  }
  if (real.length === 0) continue; // rule 2: only feeds the forms table
  addTo(realEtym, word, e.etymology_number ?? 0);
  // archaic, obsolete, rare… senses only when the entry has nothing current ("loom": utensil)
  const current = real.filter((s) => !s.tags?.some((t) => MARGINAL.has(t)));
  const use = current.length ? current : real;
  let l = lemmas.get(word);
  if (!l) lemmas.set(word, (l = { pos: new Set(), senses: new Map(), forms: new Set(), hasForms: new Set() }));
  l.pos.add(e.pos);
  l.mainPos ??= e.pos;
  let ps = l.senses.get(e.pos);
  if (!ps) l.senses.set(e.pos, (ps = { de: [] }));
  const trs = [...use.flatMap((s) => s.translations ?? []), ...(e.translations ?? [])].filter(isDe);
  for (const t of trs) {
    const w = t.word!.normalize('NFC').trim();
    if (!w || ps.de.length >= 6 || ps.de.includes(w)) continue;
    // the main part of speech is the one the first translation belongs to ("make" → verb: machen)
    if (![...l.senses.values()].some((x) => x.de.length)) l.mainPos = e.pos;
    ps.de.push(w);
  }
  if (trs.length) deSeen++;
  ps.def ??= cutDefinition(use[0].glosses![0]);
  const fes = (e.forms ?? []).filter(usableFormEntry).filter((f) => normWord(f.form!) !== word);
  if (fes.length) l.hasForms.add(e.pos);
  for (const f of fes) { l.forms.add(normWord(f.form!)); notePos(normWord(f.form!), word, e.pos); }
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
// a spelling pointer from another etymology is a homograph, not a variant: "haft" (handle)
// is also a Scottish spelling of "heft" (pastureland); treat it like a marginal one
for (const [k, etyms] of spellingEtym) {
  const [form, l] = k.split('\t');
  const own = realEtym.get(form);
  if (own && !inflected.has(k) && ![...etyms].some((n) => own.has(n))) addTo(altOnly, form, l);
}
for (const [form, ls] of formOf) {
  for (const l of [...ls]) {
    // a marginal spelling pointer or clipping never overrides a form that is a lemma in its own
    // right ("ere" is also an obsolete form of "ear", "amend" no clipping of "amendment"); inflections and standard spellings keep
    // §6.4 ("bore" → "bear", "centre" → "center")
    if (!lemmas.has(l) || (lemmas.has(form) && altOnly.get(form)?.has(l))) ls.delete(l);
  }
}
for (const [w, l] of lemmas) {
  cand(w, w);
  // skip a listed variant whose own entry calls it a marginal form of this lemma ("ere")
  for (const f of l.forms) if (!(lemmas.has(f) && altOnly.get(f)?.has(w))) cand(f, w);
  for (const p of ['noun', 'verb', 'adj']) {
    if (l.pos.has(p) && !l.hasForms.has(p)) for (const f of regularForms(w, p)) if (freq.has(f)) { cand(f, w); notePos(f, w, p); }
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
/** pos with the main part of speech first, the rest sorted */
const mainFirst = (l: Lemma) => [l.mainPos!, ...[...l.pos].filter((p) => p !== l.mainPos).sort()];
const main = (l: Lemma): PosSense => l.senses.get(l.mainPos!) ?? { de: [] };
/** row[6]: the other parts of speech that have their own translations or definition (README §6) */
type OtherSense = [string, string[], string | null];
type WordRow = [string, number, string[], string[], string | null, number, OtherSense[]?];
const wordRows: WordRow[] = [];
const freedictRows: [string, string[]][] = [];
for (const [lemma, r] of rank) {
  if (r <= COMMON_MAX_RANK || r > LIST_MAX_RANK) continue;
  const l = lemmas.get(lemma)!;
  const m = main(l);
  const fd = m.de.length === 0 ? freedict.get(lemma) : undefined;
  if (m.de.length === 0 && !fd && !m.def) continue; // rule 6
  const cognate = isCognate(lemma, m.de.length ? m.de : fd ?? []);
  const others: OtherSense[] = mainFirst(l).slice(1).flatMap((p) => {
    const s = l.senses.get(p);
    return s && (s.de.length || s.def) ? [[p, s.de, s.def ?? null] as OtherSense] : [];
  });
  const row: WordRow = [lemma, r, mainFirst(l), m.de, m.def ?? null, cognate ? 1 : 0];
  if (others.length) row.push(others);
  wordRows.push(row);
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
/** [form, lemma, pos?]: pos when the form belongs to one part of speech only ("chafed" → verb) */
const formRows: ([string, string] | [string, string, string])[] = [];
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
  else if (form !== winner) {
    const ps = pairPos.get(`${form}\t${winner}`);
    formRows.push(ps?.size === 1 ? [form, winner, [...ps][0]] : [form, winner]);
  }
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
