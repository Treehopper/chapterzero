import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256 } from './sha256.ts';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('sha256 fallback (insecure contexts have no crypto.subtle)', () => {
  it('matches node:crypto across block boundaries', () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 100_003]) {
      const data = new Uint8Array(randomBytes(n));
      expect(hex(sha256(data)), `length ${n}`).toBe(createHash('sha256').update(data).digest('hex'));
    }
  });
});
