/** Word-pack download (A2, A3) and the IndexedDB-backed WordList (README §6). */
import type { PackInfo, PackInstaller, PackStatus, Progress, WordEntry, WordList } from '@vocabfirst/core';
import type { VocabDb } from '@vocabfirst/storage-idb';
import { sha256Hex } from './sha256';

export interface ManifestChunk { file: string; bytes: number; rows?: number; sha256: string; sha256Json?: string }
export interface ManifestPack extends PackInfo { chunks: ManifestChunk[] }
export interface Manifest { formatVersion: 1; name?: string; packs: ManifestPack[] }

const STORE: Record<string, 'words' | 'wordsFreedict' | 'forms'> = {
  'words-en-de': 'words', 'words-de-freedict': 'wordsFreedict', 'forms-en': 'forms',
};

async function gunzip(bytes: Uint8Array): Promise<string> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes); // already decoded by the server
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

const toRow = (packId: string, r: unknown[]) => {
  switch (STORE[packId]) {
    case 'words': return { lemma: r[0], rank: r[1], pos: r[2], de: r[3], def: r[4], flags: r[5], ...(r[6] ? { senses: r[6] } : {}) };
    case 'wordsFreedict': return { lemma: r[0], de: r[1] };
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

  private async installed(): Promise<{ packs: PackInfo[]; complete: boolean; name?: string }> {
    const row = await this.db.meta.get('packs');
    const v = row?.value as { packs: PackInfo[]; complete: boolean; name?: string } | undefined;
    return v ?? { packs: [], complete: false };
  }

  async status(): Promise<PackStatus> {
    const [inst, m] = await Promise.all([this.installed(), this.manifest()]);
    const available = m?.packs.map(info);
    const updateAvailable = !!available && inst.complete
      && available.some((a) => inst.packs.find((p) => p.id === a.id)?.version !== a.version);
    return { installed: inst.complete, packs: inst.packs, available, updateAvailable, name: inst.name ?? m?.name };
  }

  async install(onProgress: (p: Progress) => void): Promise<void> {
    const m = await this.manifest();
    if (!m) throw new Error('Could not reach the word-list server. Check your connection and try again.');
    if (m.formatVersion !== 1) throw new Error(`Unsupported word-list format ${m.formatVersion}`);
    const inst = await this.installed();
    // a new version replaces the old rows of that pack
    for (const p of m.packs) {
      const old = inst.packs.find((x) => x.id === p.id);
      const store = STORE[p.id];
      if (!store) throw new Error(`Unknown pack ${p.id}`);
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
      const rows = (JSON.parse(await gunzip(bytes)) as unknown[][]).map((r) => toRow(p.id, r));
      const store = STORE[p.id];
      await this.db.transaction('rw', [this.db[store], this.db.packChunks], async () => {
        await (this.db[store] as unknown as { bulkPut(r: unknown[]): Promise<unknown> }).bulkPut(rows);
        await this.db.packChunks.put({ packId: p.id, file: c.file, sha256: c.sha256, version: p.version });
      });
      loaded += c.bytes;
      onProgress({ loaded, total, phase: 'downloading' });
    }
    await this.db.meta.put({ key: 'packs', value: { packs: m.packs.map(info), complete: true, name: m.name } });
    onProgress({ loaded: total, total, phase: 'done' });
  }
}

/** Methods return Dexie promises (no async/await) so they can join a UnitOfWork transaction. */
export class IdbWordList implements WordList {
  constructor(private readonly db: VocabDb) {}

  info(): Promise<PackInfo[]> {
    return this.db.meta.get('packs').then((row) => (row?.value as { packs: PackInfo[] } | undefined)?.packs ?? []);
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
    return Promise.all([this.db.words.bulkGet(lemmas), this.db.wordsFreedict.bulkGet(lemmas)]).then(([ws, fd]) => {
      const out = new Map<string, WordEntry>();
      lemmas.forEach((l, i) => {
        const w = ws[i];
        if (!w) return;
        out.set(l, { lemma: w.lemma, rank: w.rank, pos: w.pos, de: w.de, deFreedict: fd[i]?.de ?? [], def: w.def ?? undefined, cognate: (w.flags & 1) === 1,
          ...(w.senses ? { senses: w.senses.map(([pos, de, def]) => ({ pos, de, def: def ?? undefined })) } : {}) });
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
