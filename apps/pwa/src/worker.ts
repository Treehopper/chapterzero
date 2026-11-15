/// <reference lib="webworker" />
/** Hosts core + adapters off the main thread (README §7.1); the UI talks to it by RPC. */
import { createApp, type Ports } from '@vocabfirst/core';
import { IdbUnitOfWork, VocabDb } from '@vocabfirst/storage-idb';
import { HttpPackInstaller, IdbWordList } from '@vocabfirst/word-packs';
import { ZipEpubReader } from '@vocabfirst/epub-browser';
import type { RpcRequest, RpcResponse } from './lib/rpc';

declare const self: DedicatedWorkerGlobalScope;

async function thumbnail(bytes: Uint8Array, mime: string): Promise<string | undefined> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return undefined;
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));
  const h = 240;
  const w = Math.round((bmp.width / bmp.height) * h);
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(s)}`;
}

let app: ReturnType<typeof createApp> | undefined;

function init(packsUrl: string, dbName: string) {
  const db = new VocabDb(dbName);
  const ports: Ports = {
    uow: new IdbUnitOfWork(db),
    wordList: new IdbWordList(db),
    packs: new HttpPackInstaller(db, packsUrl),
    epub: new ZipEpubReader({ makeThumbnail: thumbnail }),
    clock: { now: () => new Date() },
    ids: { next: () => crypto.randomUUID() },
    random: { next: () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 },
  };
  app = createApp(ports);
}

self.onmessage = async (e: MessageEvent<RpcRequest>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    init(msg.packsUrl, msg.dbName);
    self.postMessage({ type: 'ready' } satisfies RpcResponse);
    return;
  }
  const { id, path, args } = msg;
  try {
    if (!app) throw new Error('Worker not initialised');
    let target: unknown = app;
    for (const k of path) target = (target as Record<string, unknown>)[k];
    if (typeof target !== 'function') throw new Error(`Unknown method ${path.join('.')}`);
    const real = args.map((a) =>
      a && typeof a === 'object' && '__callback' in a ? (value: unknown) => self.postMessage({ type: 'callback', id, value } satisfies RpcResponse) : a);
    const value = await (target as (...a: unknown[]) => Promise<unknown>)(...real);
    self.postMessage({ type: 'result', id, ok: true, value } satisfies RpcResponse);
  } catch (err) {
    self.postMessage({ type: 'result', id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies RpcResponse);
  }
};
