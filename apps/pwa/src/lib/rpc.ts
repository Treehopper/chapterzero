/** postMessage RPC: every VocabApp call is a plain-JSON request (README §4.2). */
import type { VocabApp } from '@vocabfirst/core';

export type RpcRequest =
  | { type: 'init'; packsUrl: string; dbName: string }
  | { type: 'call'; id: number; path: string[]; args: unknown[] };

export type RpcResponse =
  | { type: 'ready' }
  | { type: 'callback'; id: number; value: unknown }
  | { type: 'result'; id: number; ok: true; value: unknown }
  | { type: 'result'; id: number; ok: false; error: string };

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; callback?: (v: unknown) => void };

export function connect(worker: Worker, packsUrl: string, dbName = 'vocabfirst'): { api: VocabApp; ready: Promise<void> } {
  let next = 1;
  const pending = new Map<number, Pending>();
  let markReady!: () => void;
  const ready = new Promise<void>((r) => (markReady = r));
  worker.onmessage = (e: MessageEvent<RpcResponse>) => {
    const m = e.data;
    if (m.type === 'ready') return markReady();
    const p = pending.get(m.id);
    if (!p) return;
    if (m.type === 'callback') return p.callback?.(m.value);
    pending.delete(m.id);
    if (m.ok) p.resolve(m.value);
    else p.reject(new Error(m.error));
  };
  worker.postMessage({ type: 'init', packsUrl, dbName } satisfies RpcRequest);

  const call = (path: string[], args: unknown[]) =>
    ready.then(() => new Promise((resolve, reject) => {
      const id = next++;
      let callback: ((v: unknown) => void) | undefined;
      const wire = args.map((a) => {
        if (typeof a === 'function') { callback = a as (v: unknown) => void; return { __callback: true }; }
        return a;
      });
      pending.set(id, { resolve, reject, callback });
      const transfer = wire.filter((a): a is ArrayBuffer => a instanceof ArrayBuffer);
      worker.postMessage({ type: 'call', id, path, args: wire } satisfies RpcRequest, transfer);
    }));

  const proxy = (path: string[]): unknown =>
    new Proxy(() => undefined, {
      get: (_t, key) => (typeof key === 'string' && key !== 'then' ? proxy([...path, key]) : undefined),
      apply: (_t, _this, args) => call(path, args),
    });
  return { api: proxy([]) as VocabApp, ready };
}
