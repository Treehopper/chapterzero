/** Every text the app passes to t() / tn() has a German translation (README §8.4). */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { de } from './de';

const SRC = join(import.meta.dirname, '../..');
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? (f === 'i18n' ? [] : files(p)) : /\.(svelte|ts)$/.test(f) && !f.endsWith('.test.ts') ? [p] : [];
});
/** string literals that are the text arguments of t(…) and tn(n, …, …) */
function keys(src: string): string[] {
  const out: string[] = [];
  const lit = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|\x60((?:[^\x60\\$]|\\.)*)\x60`;
  for (const m of src.matchAll(new RegExp(String.raw`\bt\(\s*(?:${lit})`, 'g'))) out.push(m[1] ?? m[2] ?? m[3]);
  for (const m of src.matchAll(new RegExp(String.raw`\btn\([^,]+,\s*(?:${lit})\s*,\s*(?:${lit})`, 'g'))) out.push(m[1] ?? m[2] ?? m[3], m[4] ?? m[5] ?? m[6]);
  return out.map((k) => k.replace(/\\(['"\\])/g, '$1'));
}

describe('German texts', () => {
  const used = new Map<string, string>();
  for (const f of files(SRC)) for (const k of keys(readFileSync(f, 'utf8'))) used.set(k, f.slice(SRC.length + 1));
  it('the app uses t()', () => expect(used.size).toBeGreaterThan(0));
  it('every text has a translation', () => {
    expect([...used].filter(([k]) => !(k in de)).map(([k, f]) => `${f}: ${k}`)).toEqual([]);
  });
  it('translations keep the placeholders', () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
    expect(Object.entries(de).filter(([en, g]) => ph(en) !== ph(g)).map(([en]) => en)).toEqual([]);
  });
});
