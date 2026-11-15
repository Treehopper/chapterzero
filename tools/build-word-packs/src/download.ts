/** Downloads the public sources into .cache/sources (skips files that already exist). */
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { SOURCES, SOURCE_DIR } from './sources.ts';

mkdirSync(SOURCE_DIR, { recursive: true });
for (const s of Object.values(SOURCES)) {
  if (existsSync(s.path)) continue;
  console.log(`downloading ${s.url}`);
  const res = await fetch(s.url);
  if (!res.ok || !res.body) throw new Error(`${s.url}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(s.path + '.part'));
  execFileSync('mv', [s.path + '.part', s.path]);
}
if (!existsSync(SOURCES.freedict.tei)) {
  mkdirSync(SOURCES.freedict.dir, { recursive: true });
  execFileSync('tar', ['-xJf', SOURCES.freedict.path, '-C', SOURCES.freedict.dir]);
}
console.log('sources ready');
