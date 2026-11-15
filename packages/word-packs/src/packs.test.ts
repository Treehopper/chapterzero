import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '@vocabfirst/core';
import { SeededRandom, SeqIds, FixedClock } from '@vocabfirst/core/testing';
import { IdbUnitOfWork, VocabDb } from '@vocabfirst/storage-idb';
import { ZipEpubReader } from '@vocabfirst/epub-browser';
import { HttpPackInstaller, IdbWordList } from './index.ts';

const packDir = join(import.meta.dirname, '../../../fixtures/mini-pack');
const BASE = 'https://app.test/packs/';
let dbn = 0;

function server(opts: { failFile?: string; corrupt?: string; offline?: boolean } = {}) {
  const requests: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url.replace(BASE, ''));
    if (opts.offline) throw new TypeError('Failed to fetch');
    const file = url.replace(BASE, '');
    if (file === opts.failFile) return new Response('nope', { status: 500 });
    let body: Uint8Array = readFileSync(join(packDir, file));
    if (file === opts.corrupt) body = body.map((b, i) => (i === 20 ? b ^ 1 : b));
    return new Response(body as BodyInit);
  }) as typeof fetch;
  return { fetchFn, requests };
}

describe('HttpPackInstaller + IdbWordList', () => {
  it('installs with progress, resumes at the first missing chunk, verifies hashes', async () => {
    const db = new VocabDb(`t${dbn++}`);
    const s1 = server({ failFile: 'forms-en.000.json.gz' });
    const inst1 = new HttpPackInstaller(db, BASE, s1.fetchFn);
    const progress: number[] = [];
    await expect(inst1.install((p) => progress.push(p.loaded))).rejects.toThrow(/Download failed/);
    expect((await inst1.status()).installed).toBe(false);
    const s2 = server();
    const inst2 = new HttpPackInstaller(db, BASE, s2.fetchFn);
    await inst2.install(() => undefined);
    expect(s2.requests.filter((r) => r.endsWith('.gz'))).toEqual(['forms-en.000.json.gz']); // the others were kept
    const st = await inst2.status();
    expect(st).toMatchObject({ installed: true, updateAvailable: false });
    expect(st.packs.map((p) => p.id)).toEqual(['words-en-de', 'words-de-freedict', 'forms-en']);
    const wl = new IdbWordList(db);
    const r = await wl.resolve(['strode', 'the', 'relinquish', 'lasgun']);
    expect([...r]).toEqual([['strode', 'stride'], ['the', ''], ['relinquish', 'relinquish']]);
    const e = await wl.entries(['relinquish']);
    expect(e.get('relinquish')).toMatchObject({ rank: expect.any(Number), cognate: false });
    expect((await wl.firstAtOrAfter(10001, 15000))!.rank).toBeGreaterThanOrEqual(10001);
    expect(await wl.firstAtOrAfter(99999, 100000)).toBeUndefined();
    expect(progress.length).toBeGreaterThan(0);
    // offline after install: status still says installed
    expect((await new HttpPackInstaller(db, BASE, server({ offline: true }).fetchFn).status()).installed).toBe(true);
  });

  it('accepts chunks a server already decompressed (Content-Encoding: gzip)', async () => {
    const db = new VocabDb(`t${dbn++}`);
    const { gunzipSync } = await import('node:zlib');
    const fetchFn = (async (input: RequestInfo | URL) => {
      const file = String(input).replace(BASE, '');
      const body = readFileSync(join(packDir, file));
      return new Response((file.endsWith('.gz') ? gunzipSync(body) : body) as BodyInit);
    }) as typeof fetch;
    await new HttpPackInstaller(db, BASE, fetchFn).install(() => undefined);
    expect((await new IdbWordList(db).resolve(['strode'])).get('strode')).toBe('stride');
  });

  it('rejects a corrupted chunk', async () => {
    const db = new VocabDb(`t${dbn++}`);
    const inst = new HttpPackInstaller(db, BASE, server({ corrupt: 'words-en-de.000.json.gz' }).fetchFn);
    await expect(inst.install(() => undefined)).rejects.toThrow(/Checksum/);
  });
});

describe('the whole app on IndexedDB', () => {
  it('imports the fixture EPUB, studies, resumes, and rolls back failed transactions', async () => {
    const db = new VocabDb(`t${dbn++}`);
    await new HttpPackInstaller(db, BASE, server().fetchFn).install(() => undefined);
    const clock = new FixedClock(new Date('2026-03-02T09:00:00Z'));
    const ports = { uow: new IdbUnitOfWork(db), wordList: new IdbWordList(db), packs: new HttpPackInstaller(db, BASE, server().fetchFn),
      epub: new ZipEpubReader(), clock, ids: new SeqIds('x'), random: new SeededRandom(3) };
    const app = createApp(ports);
    const b = readFileSync(join(import.meta.dirname, '../../../fixtures/epub/omnibus-fixture.epub'));
    const p = await app.books.analyse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    expect(p.works.map((w) => w.title)).toEqual(['Cover', 'Contents', 'The Moor', 'The Harbour', 'About the Author']);
    const c = p.counts;
    expect(c.distinctWords).toBe(c.common + c.belowLevel + c.known + c.cognates + c.names + c.cards + c.unlisted);
    const book = await app.books.confirm(p.draftId, { includedChapters: p.includedChapters, cutoffRank: 5000 });
    expect(book.cards).toBeGreaterThan(5);
    const v = await app.study.resumeOrStart(book.id);
    await app.study.flip(v.sessionId);
    const g = await app.study.grade(v.sessionId, 'unknown');
    expect(g.phase).toBe('wrongReview');
    // a failing transaction leaves no trace
    await expect(ports.uow.run(async (tx) => { await tx.knownWords.addMany(['zzz']); throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await ports.uow.run((tx) => tx.knownWords.hasMany(['zzz']))).toEqual(new Set());
    // a fresh app over the same database resumes the session
    const app2 = createApp({ ...ports, uow: new IdbUnitOfWork(db) });
    const r = await app2.study.resumeOrStart(book.id);
    expect(r).toMatchObject({ sessionId: v.sessionId, phase: 'wrongReview' });
    const backup = await app2.backup.export();
    expect(backup.cards.length).toBe(book.cards);
    await app2.books.delete(book.id);
    expect(await app2.books.list()).toEqual([]);
    await app2.backup.import(backup);
    expect((await app2.books.list()).map((x) => x.title)).toEqual(['The Lantern Omnibus']);
  });
});
