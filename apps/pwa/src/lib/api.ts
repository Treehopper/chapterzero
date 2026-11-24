import { connect } from './rpc';

const params = new URLSearchParams(location.search);
/** `?packs=test` (e2e) switches to the miniature pack; remembered for this browser. */
function packsUrl(): string {
  const p = params.get('packs');
  try {
    for (const k of ['vf:packs', 'vf:theme']) localStorage.removeItem(k);   // the keys of the app's first name
    if (p === 'test' || p === 'real') localStorage.setItem('c0:packs', p);
    const saved = localStorage.getItem('c0:packs');
    if (saved === 'test') return new URL(`${import.meta.env.BASE_URL}test-packs/`, location.origin).toString();
  } catch { /* storage blocked */ }
  return new URL(`${import.meta.env.BASE_URL}packs/`, location.origin).toString();
}

const worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
export const { api, ready } = connect(worker, packsUrl());
