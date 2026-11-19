/** Word-pack download (A2, A3) and the IndexedDB-backed WordList (README §6). */
import { LEGACY_PAIR, type LanguagePair, type PackInfo, type PackInstaller, type PackStatus, type Progress, type WordEntry, type WordList } from '@vocabfirst/core';
import type { VocabDb } from '@vocabfirst/storage-idb';
import { sha256Hex } from './sha256';

export interface ManifestChunk { file: string; bytes: number; rows?: number; sha256: string; sha256Json?: string }
/** words: the word table; extra: a second dictionary's translations; forms: form → lemma (README §6.1) */
export type PackRole = 'words' | 'extra' | 'forms';
export interface ManifestPack extends PackInfo { role?: PackRole; chunks: ManifestChunk[] }
/** `source` / `target`: the language pair; manifests without them are English → German */
export interface Manifest { formatVersion: 1; name?: string; source?: string; target?: string; packs: ManifestPack[] }
type Installed = { packs: PackInfo[]; complete: boolean; name?: string; pair?: LanguagePair };

const TABLE = { words: 'words', extra: 'wordsExtra', forms: 'forms' } as const;
/** packs of manifests written before roles */
const LEGACY_ROLE: Record<string, PackRole> = { 'words-en-de': 'words', 'words-de-freedict': 'extra', 'forms-en': 'forms' };
const roleOf = (p: ManifestPack): PackRole | undefined => p.role ?? LEGACY_ROLE[p.id];
const pairOf = (m: Manifest): LanguagePair => (m.source && m.target ? { source: m.source, target: m.target } : LEGACY_PAIR);

async function gunzip(bytes: Uint8Array): Promise<string> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes); // already decoded by the server
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

const toRow = (role: PackRole, r: unknown[]) => {
  switch (role) {
    case 'words': return { lemma: r[0], rank: r[1], pos: r[2], tr: r[3], def: r[4], flags: r[5], ...(r[6] ? { senses: r[6] } : {}) };
    case 'extra': return { lemma: r[0], tr: r[1] };
    default: return { form: r[0], lemma: r[1], ...(r[2] ? { pos: r[2] } : {}) };
  }
};

const info = ({ chunks: _c, ...p }: ManifestPack): PackInfo => p;

export class HttpPackInstaller implements PackInstaller {
  constructor(private readonly db: VocabDb, private readonly baseUrl: string, private readonly fetchFn: typeof fetch = (...a) => fetch(...a)) {}

  private async manifest(): Promise<Manifest | undefined> {
    try {
      const res = await this.fetchFn(new URL('manifest.json', this.baseUrl).toString(), { cache: 'no-cache' });
      if (!res.ok) return undefined;
      return (await res.json()) as Manifest;
    } catch {
      return undefined;
    }
  }

  private async installed(): Promise<Installed> {
    const row = await this.db.meta.get('packs');
    const v = row?.value as Installed | undefined;
    return v ?? { packs: [], complete: false };
  }

  async status(opts: { remote?: boolean } = {}): Promise<PackStatus> {
    const [inst, m] = await Promise.all([this.installed(), opts.remote === false ? undefined : this.manifest()]);
    const available = m?.packs.map(info);
    const updateAvailable = !!available && inst.complete
      && available.some((a) => inst.packs.find((p) => p.id === a.id)?.version !== a.version);
    const pair = inst.complete ? inst.pair ?? LEGACY_PAIR : m && pairOf(m);
    return { installed: inst.complete, packs: inst.packs, available, updateAvailable, name: inst.name ?? m?.name, ...(pair ? { pair } : {}) };
  }

  async install(onProgress: (p: Progress) => void): Promise<void> {
    const m = await this.manifest();
    if (!m) throw new Error('Could not reach the word-list server. Check your connection and try again.');
    if (m.formatVersion !== 1) throw new Error(`Unsupported word-list format ${m.formatVersion}`);
    const inst = await this.installed();
    // a new version replaces the old rows of that pack
    for (const p of m.packs) {
      const old = inst.packs.find((x) => x.id === p.id);
      const role = roleOf(p);
      if (!role) throw new Error(`Unknown pack ${p.id}`);
      const store = TABLE[role];
      const chunksOfOtherVersion = await this.db.packChunks.filter((c) => c.packId === p.id && c.version !== p.version).count();
      if ((old && old.version !== p.version) || chunksOfOtherVersion) {
        await this.db.transaction('rw', [this.db[store], this.db.packChunks, this.db.meta], async () => {
          await this.db[store].clear();
          await this.db.packChunks.filter((c) => c.packId === p.id).delete();
          await this.db.meta.put({ key: 'packs', value: { ...inst, complete: false } });
        });
      }
    }
    const done = new Set((await this.db.packChunks.toArray()).map((c) => `${c.packId}/${c.file}/${c.sha256}`));
    const todo = m.packs.flatMap((p) => p.chunks.filter((c) => !done.has(`${p.id}/${c.file}/${c.sha256}`)).map((c) => ({ p, c })));
    const total = todo.reduce((n, x) => n + x.c.bytes, 0);
    let loaded = 0;
    onProgress({ loaded, total, phase: 'downloading' });
    for (const { p, c } of todo) {
      const res = await this.fetchFn(new URL(c.file, this.baseUrl).toString());
      if (!res.ok || !res.body) throw new Error(`Download failed: ${c.file} (HTTP ${res.status})`);
      const reader = res.body.getReader();
      const parts: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        parts.push(value);
        got += value.length;
        onProgress({ loaded: loaded + Math.min(got, c.bytes), total, phase: 'downloading' });
      }
      const bytes = new Uint8Array(got);
      let off = 0;
      for (const part of parts) { bytes.set(part, off); off += part.length; }
      // gzip as published, or already decoded by a server that sent Content-Encoding: gzip
      const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
      const expected = gzipped ? c.sha256 : c.sha256Json;
      const sha = await sha256Hex(bytes);
      if (!expected || sha !== expected) throw new Error(`Checksum mismatch for ${c.file}. Please try again.`);
      onProgress({ loaded: loaded + c.bytes, total, phase: 'installing' });
      const role = roleOf(p)!;
      const rows = (JSON.parse(await gunzip(bytes)) as unknown[][]).map((r) => toRow(role, r));
      const store = TABLE[role];
      await this.db.transaction('rw', [this.db[store], this.db.packChunks], async () => {
        await (this.db[store] as unknown as { bulkPut(r: unknown[]): Promise<unknown> }).bulkPut(rows);
        await this.db.packChunks.put({ packId: p.id, file: c.file, sha256: c.sha256, version: p.version });
      });
      loaded += c.bytes;
      onProgress({ loaded, total, phase: 'downloading' });
    }
    await this.db.meta.put({ key: 'packs', value: { packs: m.packs.map(info), complete: true, name: m.name, pair: pairOf(m) } satisfies Installed });
    onProgress({ loaded: total, total, phase: 'done' });
  }
}

/** Methods return Dexie promises (no async/await) so they can join a UnitOfWork transaction. */
export class IdbWordList implements WordList {
  constructor(private readonly db: VocabDb) {}

  info(): Promise<PackInfo[]> {
    return this.db.meta.get('packs').then((row) => (row?.value as Installed | undefined)?.packs ?? []);
  }

  pair(): Promise<LanguagePair> {
    return this.db.meta.get('packs').then((row) => (row?.value as Installed | undefined)?.pair ?? LEGACY_PAIR);
  }

  resolve(tokens: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    return this.db.forms.bulkGet(tokens).then((forms) => {
      const misses: string[] = [];
      tokens.forEach((t, i) => (forms[i] ? out.set(t, forms[i]!.lemma) : misses.push(t)));
      return this.db.words.bulkGet(misses).then((words) => {
        misses.forEach((t, i) => { if (words[i]) out.set(t, t); });
        return out;
      });
    });
  }

  formPos(forms: string[]): Promise<Map<string, string>> {
    return this.db.forms.bulkGet(forms).then((rows) => {
      const out = new Map<string, string>();
      forms.forEach((f, i) => { const p = rows[i]?.pos; if (p) out.set(f, p); });
      return out;
    });
  }

  entries(lemmas: string[]): Promise<Map<string, WordEntry>> {
    return Promise.all([this.db.words.bulkGet(lemmas), this.db.wordsExtra.bulkGet(lemmas)]).then(([ws, ex]) => {
      const out = new Map<string, WordEntry>();
      lemmas.forEach((l, i) => {
        const w = ws[i];
        if (!w) return;
        out.set(l, { lemma: w.lemma, rank: w.rank, pos: w.pos, tr: w.tr, trExtra: ex[i]?.tr ?? [], def: w.def ?? undefined, cognate: (w.flags & 1) === 1,
          ...(w.senses ? { senses: w.senses.map(([pos, tr, def]) => ({ pos, tr, def: def ?? undefined })) } : {}) });
      });
      return out;
    });
  }

  firstAtOrAfter(rank: number, maxRank: number): Promise<WordEntry | undefined> {
    if (rank > maxRank) return Promise.resolve(undefined);
    return this.db.words.where('rank').between(rank, maxRank, true, true).first()
      .then((w) => (w ? this.entries([w.lemma]).then((m) => m.get(w.lemma)) : undefined));
  }
}
