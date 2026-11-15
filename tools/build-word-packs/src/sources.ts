import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const SOURCE_DIR = join(ROOT, '.cache/sources');
export const OUT_DIR = join(ROOT, 'apps/pwa/public/packs');

export const SOURCES = {
  wiktextract: {
    url: 'https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz',
    path: join(SOURCE_DIR, 'kaikki-English.jsonl.gz'),
    licence: 'CC BY-SA 4.0 (Wiktionary contributors, via Wiktextract/kaikki.org)',
  },
  freedict: {
    url: 'https://download.freedict.org/dictionaries/eng-deu/1.9-fd1/freedict-eng-deu-1.9-fd1.src.tar.xz',
    path: join(SOURCE_DIR, 'freedict-eng-deu.src.tar.xz'),
    dir: join(SOURCE_DIR, 'freedict'),
    tei: join(SOURCE_DIR, 'freedict/eng-deu/eng-deu.tei'),
    licence: 'GPL-2.0-or-later (FreeDict eng-deu 1.9-fd1, from TU Chemnitz "Ding")',
  },
  wordfreq: {
    url: 'https://github.com/rspeer/wordfreq/raw/master/wordfreq/data/large_en.msgpack.gz',
    path: join(SOURCE_DIR, 'large_en.msgpack.gz'),
    licence: 'CC BY-SA 4.0 (wordfreq data by Robyn Speer; build-time only)',
  },
} as const;
