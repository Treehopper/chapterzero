/**
 * Cuts a miniature word list out of the real packs: fixtures/mini-wordlist.json (for core
 * unit tests) and fixtures/mini-pack/ (same format as the real packs, for e2e tests).
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { OUT_DIR, ROOT } from './sources.ts';
import { levelOfRank } from './rules.ts';

type WordRow = [string, number, string[], string[], string | null, number];
const load = <T>(prefix: string): T[] =>
  readdirSync(OUT_DIR).filter((f) => f.startsWith(prefix)).sort().flatMap((f) => JSON.parse(gunzipSync(readFileSync(join(OUT_DIR, f))).toString()));
const words = load<WordRow>('words-en-de.');
const freedict = load<[string, string[]]>('words-de-freedict.');
const forms = load<[string, string]>('forms-en.');

/** Words the fixture books and tests use. */
const WANTED = `stride relinquish melancholy scythe ephemeral saunter shelf mouse goose ox harbor encyclopedia
  gaunt brooding wistful lantern moor heather tempest solemn cottage parchment quill vexed sombre somber ominous
  dagger gallant forlorn rampart gale lurk dwindle haggard whisper cobblestone ember thicket vow wretch
  ponder glimmer hearth bough meadow ravine sullen weary dusk tavern quiver loom ashen hollow kindle mire`.split(/\s+/).filter(Boolean);

const byLemma = new Map(words.map((w) => [w[0], w]));
const chosen = new Map<string, WordRow>();
for (const w of WANTED) if (byLemma.has(w)) chosen.set(w, byLemma.get(w)!);
// 18 calibration-friendly words per level (letters only, ≥ 4, German, no cognate)
for (let level = 1; level <= 10; level++) {
  const ok = words.filter((w) => levelOfRank(w[1]) === level && /^[a-z]{4,}$/.test(w[0]) && w[3].length && !w[5]);
  const step = Math.max(1, Math.floor(ok.length / 18));
  for (let i = 0; i < ok.length && chosen.size < level * 18 + WANTED.length; i += step) chosen.set(ok[i][0], ok[i]);
}
// a few cognates and definition-only words
for (const w of words.filter((x) => x[5]).slice(0, 10)) chosen.set(w[0], w);
for (const w of words.filter((x) => !x[3].length && x[4] && !freedict.some((f) => f[0] === x[0])).slice(0, 5)) chosen.set(w[0], w);
const fd = freedict.filter((f) => chosen.has(f[0]));
for (const f of freedict.slice(0, 3)) { chosen.set(f[0], byLemma.get(f[0])!); fd.push(f); }

const COMMON = `the a an and of to in is was he she it they his her that with for on as at by from had have be been were
  not but or so if this which all one said there their them would could when what we you i me my no out up down into
  over then than more some any only very old man men time day way back did do does done go went gone come came see saw
  seen look looked looking know knew known think thought say says long little great good well also before after again
  away still even just like upon now here these those such own other our us who whom him its are am being has having
  made make way eyes eye hand hands face night house round under through about against between while once never ever
  where why how much many most every each can will shall should may might must yet too off light dark last first
  two three new very far near left right side head heart life world thing things nothing something anything everything
  door room voice words word turned turn stood stand sat sit took take gave give told tell asked ask felt feel heard
  hear began begin seemed seem saw found find kept keep let put set got get grew grow ran run walked walk across
  along toward towards behind beneath without within among until because though although whether`.split(/\s+/).filter(Boolean);

const lemmas = new Set(chosen.keys());
const formRows = forms.filter(([f, l]) => (l !== '' && lemmas.has(l)) || (l === '' && COMMON.includes(f)));
for (const c of COMMON) if (!formRows.some(([f]) => f === c)) formRows.push([c, '']);
formRows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
const wordRows = [...chosen.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
fd.sort((a, b) => (a[0] < b[0] ? -1 : 1));

writeFileSync(join(ROOT, 'fixtures/mini-wordlist.json'), JSON.stringify({ words: wordRows, freedict: fd, forms: formRows }));
const packDir = join(ROOT, 'fixtures/mini-pack');
rmSync(packDir, { recursive: true, force: true });
mkdirSync(packDir, { recursive: true });
const manifest = { formatVersion: 1, name: 'English → German (test mini pack)', packs: [] as unknown[] };
for (const [id, rows] of [['words-en-de', wordRows], ['words-de-freedict', fd], ['forms-en', formRows]] as const) {
  const data = gzipSync(JSON.stringify(rows));
  const file = `${id}.000.json.gz`;
  writeFileSync(join(packDir, file), data);
  manifest.packs.push({ id, version: 'test', sources: ['fixture'], licence: 'CC BY-SA 4.0 / GPL (excerpt)', entryCount: rows.length,
    bytes: data.length, chunks: [{ file, bytes: data.length, rows: rows.length, sha256: createHash('sha256').update(data).digest('hex') }] });
}
writeFileSync(join(packDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`fixture: ${wordRows.length} words, ${fd.length} freedict, ${formRows.length} forms`);
