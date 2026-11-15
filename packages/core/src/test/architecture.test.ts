/** README §4 rules 1–2, checked on the source (tsc with lib ES2022 checks the globals too). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]))
    .filter((f) => f.endsWith('.ts') && !f.includes('/test/') && !f.endsWith('.test.ts'));

describe('core architecture rules', () => {
  const src = files(root).map((f) => ({ f, text: readFileSync(f, 'utf8') }));
  it('imports nothing outside core (except the test fixture JSON)', () => {
    for (const { f, text } of src) {
      for (const m of text.matchAll(/from '([^']+)'/g)) {
        const spec = m[1];
        const ok = spec.startsWith('.') && !/(apps|storage-idb|epub-browser|word-packs)/.test(spec);
        expect(ok || spec.endsWith('mini-wordlist.json'), `${f}: ${spec}`).toBe(true);
      }
    }
  });
  it('uses no browser globals, Date.now or Math.random', () => {
    for (const { f, text } of src) {
      expect(text, f).not.toMatch(/\b(window|document|indexedDB|localStorage|navigator)\./);
      expect(text, f).not.toMatch(/Date\.now\(|Math\.random\(|new Date\(\)/);
    }
  });
});
