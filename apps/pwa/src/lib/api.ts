import { connect } from './rpc';

const params = new URLSearchParams(location.search);
/** `?packs=test` (e2e) switches to the miniature pack; remembered for this browser. */
function packsUrl(): string {
  const p = params.get('packs');
  try {
    if (p === 'test' || p === 'real') localStorage.setItem('vf:packs', p);
    const saved = localStorage.getItem('vf:packs');
    if (saved === 'test') return new URL(`${import.meta.env.BASE_URL}test-packs/`, location.origin).toString();
  } catch { /* storage blocked */ }
  return new URL(`${import.meta.env.BASE_URL}packs/`, location.origin).toString();
}

const worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
export const { api, ready } = connect(worker, packsUrl());
