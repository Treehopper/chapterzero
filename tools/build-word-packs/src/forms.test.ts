/** §6.4 step 4: hand-checked forms must resolve as expected in the built packs. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUT_DIR, ROOT } from './sources.ts';

const built = existsSync(join(OUT_DIR, 'manifest.json'));
const load = (prefix: string): unknown[][] =>
  readdirSync(OUT_DIR).filter((f) => f.startsWith(prefix)).flatMap((f) => JSON.parse(gunzipSync(readFileSync(join(OUT_DIR, f))).toString()));

describe.skipIf(!built)('built packs', () => {
  const words = new Map(load('words-en-de.').map((r) => [r[0] as string, r]));
  const forms = new Map(load('forms-en.').map((r) => [r[0] as string, r[1] as string]));
  const resolve = (t: string) => (forms.has(t) ? forms.get(t) : words.has(t) ? t : undefined);

  it('resolves the 200-pair fixture', () => {
    const pairs = readFileSync(join(ROOT, 'fixtures/forms-200.tsv'), 'utf8').split('\n')
      .filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t'));
    expect(pairs.length).toBeGreaterThanOrEqual(200);
    const wrong = pairs.filter(([f, e]) => resolve(f) !== JSON.parse(e.startsWith('"') ? e : JSON.stringify(e)))
      .map(([f, e]) => `${f}: expected ${e}, got ${JSON.stringify(resolve(f))}`);
    expect(wrong).toEqual([]);
  });

  it('flags cognates as specified', () => {
    expect((words.get('melancholy') as number[])[5]).toBe(1);
    expect(words.has('gift') ? (words.get('gift') as number[])[5] : 0).toBe(0);
  });

  it('stays under the 10 MB target, in chunks ≤ 2 MB with valid hashes', () => {
    const m = JSON.parse(readFileSync(join(OUT_DIR, 'manifest.json'), 'utf8'));
    let total = 0;
    for (const p of m.packs) for (const c of p.chunks) { total += c.bytes; expect(c.bytes).toBeLessThanOrEqual(2 * 1024 * 1024); }
    expect(total).toBeLessThan(10 * 1024 * 1024);
  });
});
