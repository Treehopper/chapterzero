import { describe, expect, it } from 'vitest';
import { fit, shuffle } from '../domain/calibration.ts';
import { grade, DEFAULT_SCHEDULER } from '../domain/scheduler.ts';
import { onGrade, newUnlocks, ACHIEVEMENTS } from '../domain/achievements.ts';
import { DEFAULT_CUTOFF, LEVELS, levelCutoff, levelOfRank, startLevel } from '../domain/levels.ts';
import { lookupLinks, isValidTemplate, DEFAULT_LOOKUP_PROVIDERS } from '../domain/lookup.ts';
import { headword, resolveCardContent, senseOptions } from '../domain/cardContent.ts';
import { nearestLevels } from '../services/calibrationService.ts';
import { EMPTY_STATS } from '../domain/settings.ts';
import { chapterWords } from '../domain/coverage.ts';
import { DEFAULT_PACE, estimateToReady, paceFrom } from '../domain/estimate.ts';
import { SeededRandom } from '../testing/memory.ts';
import type { Card } from '../domain/types.ts';

const RANKS = [1500, 1800, 2400, 2900, 3600, 4700, 5600, 7000, 8000, 9500, 11000, 14000, 16000, 19000, 22000, 28000, 33000, 41000, 50000, 65000];
const KNOWN = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0];

describe('calibration fit (§7.8 test vectors)', () => {
  it('mixed answers', () => {
    const r = fit(RANKS.map((rank, i) => ({ rank, known: KNOWN[i] === 1 })));
    expect(r).toEqual({ r50: 17667, k: 3.5, cutoffRank: 10800 });
    expect(startLevel(r.cutoffRank)).toBe(6);
  });
  it('all known', () => {
    const r = fit(RANKS.map((rank) => ({ rank, known: true })));
    expect(r).toEqual({ r50: 150000, k: 6, cutoffRank: 60000 });
    expect(startLevel(r.cutoffRank)).toBe(10);
  });
  it('none known', () => {
    const r = fit(RANKS.map((rank) => ({ rank, known: false })));
    expect(r).toEqual({ r50: 500, k: 6, cutoffRank: 2000 });
    expect(startLevel(r.cutoffRank)).toBe(1);
  });
  it('a level picked by hand maps to a cutoff inside it; level 5 is the default', () => {
    for (const l of LEVELS) expect(startLevel(levelCutoff(l.level))).toBe(l.level);
    expect(levelCutoff(5)).toBe(DEFAULT_CUTOFF);
  });
  it('stage 2 picks the four levels nearest to r50', () => {
    expect(nearestLevels(17667)).toEqual([5, 6, 7, 8]); // ln-distances: L7 .02, L8 .33, L6 .37, L5 .71 < L9 .73
    expect(nearestLevels(500)).toEqual([1, 2, 3, 4]);
    expect(nearestLevels(150000)).toEqual([7, 8, 9, 10]);
  });
  it('shuffle is deterministic with a seeded random', () => {
    const r1 = new SeededRandom(1), r2 = new SeededRandom(1);
    expect(shuffle([1, 2, 3, 4, 5], () => r1.next())).toEqual(shuffle([1, 2, 3, 4, 5], () => r2.next()));
  });
});

describe('levels', () => {
  it('maps rank bands', () => {
    expect(levelOfRank(1000)).toBe(0);
    expect(levelOfRank(1001)).toBe(1);
    expect(levelOfRank(7500)).toBe(4);
    expect(levelOfRank(7501)).toBe(5);
    expect(levelOfRank(45001)).toBe(10);
    expect(startLevel(8000)).toBe(5);
  });
});

const card = (over: Partial<Card> = {}): Card => ({
  id: 'b:x', bookId: 'b', lemma: 'x', forms: [], occurrences: 1, occurrencesByChapter: { 0: 1 }, firstPosition: 0, chapterIndex: 0,
  translations: ['x'], pos: [], translationSource: 'list', origin: 'import', status: 'active', level: 0,
  stats: { correct: 0, wrong: 0, failStreak: 0 }, ...over,
});

describe('sense options for editing (C13)', () => {
  it('lists each part of speech with its own translations and definition, main first', () => {
    const e = { lemma: 'chafe', rank: 9000, pos: ['noun', 'verb'], tr: ['Scheuerstelle'], trExtra: [], def: 'a sore from rubbing', cognate: false,
      senses: [{ pos: 'verb', tr: ['scheuern', 'reiben'], def: 'to rub' }, { pos: 'noun', tr: ['x'] }, { pos: 'adj', tr: [] }] };
    expect(senseOptions(e)).toEqual([
      { pos: 'noun', translations: ['Scheuerstelle'], definition: 'a sore from rubbing' },
      { pos: 'verb', translations: ['scheuern', 'reiben'], definition: 'to rub' },
    ]);
  });
});

describe('time to ready (E7)', () => {
  const ch = (index: number) => ({ index, workIndex: 0, title: String(index), kind: 'story' as const, included: true, wordTokens: 100 });
  const book = { id: 'b', title: 'B', language: 'en' as const, importedAt: '', cutoffRank: 0, stats: { wordTokens: 200, distinctWords: 0 },
    works: [], chapters: [ch(0), ch(1)], chaptersAnnounced: [] };
  it('takes cards in study order until the target; later chapters count earlier ones as done', () => {
    const cards = [
      card({ id: 'c', occurrencesByChapter: { 0: 1 }, firstPosition: 30 }), card({ id: 'b', occurrencesByChapter: { 0: 2 }, firstPosition: 20 }),
      card({ id: 'a', occurrencesByChapter: { 0: 5, 1: 3 }, firstPosition: 10 }), card({ id: 'd', occurrencesByChapter: { 1: 2 }, level: 1 }),
    ];
    const [one, two] = estimateToReady(book, cards, 0.98, DEFAULT_PACE);
    expect(one).toMatchObject({ cards: 2, newCards: 2, reviews: 5, minutes: 1 });   // a, then b: 8 → 1 unknown of 100
    expect(two).toMatchObject({ cards: 0, minutes: 0 });                            // a is planned already, d alone is 2 %
  });
  it('learns the pace from the review log, with defaults for a short history', () => {
    expect(paceFrom([])).toEqual(DEFAULT_PACE);
    const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 10, 0, s)).toISOString();
    const log = Array.from({ length: 30 }, (_, i) => ({ cardId: 'x', bookId: 'b', at: at(i * 5), result: i % 5 ? 'known' as const : 'unknown' as const, levelBefore: 0, levelAfter: 0 }));
    expect(paceFrom(log)).toEqual({ secondsPerReview: 5, wrongRate: 0.2 });
  });
});

describe('chapter bars (I2)', () => {
  const ch = { index: 0, wordTokens: 100 };
  const two = (l1: number, l2: number) => [card({ occurrencesByChapter: { 0: 5 }, level: l1 }), card({ id: 'b:y', occurrencesByChapter: { 0: 5 }, level: l2 })];
  it('counts the words still to learn and the known ones', () => {
    expect(chapterWords(ch, two(0, 0), 0.98)).toEqual({ done: 0, toGo: 2, share: 0 });     // 90 %: both needed
    expect(chapterWords(ch, two(2, 0), 0.98)).toEqual({ done: 1, toGo: 1, share: 0.5 });   // 95 %
    expect(chapterWords(ch, two(2, 2), 0.98)).toEqual({ done: 2, toGo: 0, share: 1 });
    expect(chapterWords(ch, two(0, 0), 0.95).toGo).toBe(1);                                // one is enough for 95 %
    expect(chapterWords(ch, [card({ occurrencesByChapter: { 0: 1 } })], 0.98).share).toBe(1); // 99 % already
  });
});

describe('scheduler (§7.2)', () => {
  const now = new Date(2026, 2, 2, 15, 30);
  it('doubles intervals from local midnight', () => {
    let c = card();
    const days: number[] = [];
    for (let i = 0; i < 9; i++) {
      c = grade(c, 'known', now, DEFAULT_SCHEDULER);
      days.push(Math.round((new Date(c.dueAt!).getTime() - new Date(2026, 2, 2).getTime()) / 86_400_000));
    }
    expect(days).toEqual([1, 2, 4, 8, 16, 32, 64, 128, 128]);
    expect(c.level).toBe(8);
  });
  it('property: failed → level 0, never above max, due monotonic in level', () => {
    const rnd = new SeededRandom(7);
    for (let run = 0; run < 200; run++) {
      let c = card();
      let lastDue = 0;
      for (let i = 0; i < 30; i++) {
        const known = rnd.next() < 0.7;
        c = grade(c, known ? 'known' : 'unknown', now, DEFAULT_SCHEDULER);
        expect(c.level).toBeLessThanOrEqual(DEFAULT_SCHEDULER.maxLevel);
        if (!known) { expect(c.level).toBe(0); expect(c.dueAt).toBeUndefined(); lastDue = 0; continue; }
        const due = new Date(c.dueAt!).getTime();
        expect(due).toBeGreaterThanOrEqual(lastDue);
        lastDue = due;
      }
    }
  });
});

describe('achievements (§7.6)', () => {
  it('streak, total, comeback', () => {
    let stats = EMPTY_STATS;
    let c = card({ stats: { correct: 0, wrong: 3, failStreak: 3 } });
    const r = onGrade(stats, c, 'known');
    expect(r.stats).toMatchObject({ correctStreak: 1, totalCorrect: 1, comebacks: 1, bestCorrectStreak: 1 });
    expect(r.card.stats.failStreak).toBe(0);
    const w = onGrade(r.stats, r.card, 'unknown');
    expect(w.stats.correctStreak).toBe(0);
    expect(w.stats.bestCorrectStreak).toBe(1);
    expect(w.card.stats.failStreak).toBe(1);
    stats = { ...EMPTY_STATS, bestCorrectStreak: 10, totalCorrect: 49 };
    const u = newUnlocks(ACHIEVEMENTS, stats, [{ achievementId: 'on-a-roll', tier: 'bronze', unlockedAt: 'x' }], 'now');
    expect(u.map((x) => `${x.achievementId}:${x.tier}`)).toEqual(['on-a-roll:silver']);
  });
});

const EN_DE = { source: 'en', target: 'de' };
describe('lookup links (C16–C17)', () => {
  it('encodes the lemma into enabled https templates in order', () => {
    const l = lookupLinks('relinquish', DEFAULT_LOOKUP_PROVIDERS, EN_DE);
    expect(l.map((x) => x.name)).toEqual(['Wiktionary', 'dict.cc', 'LEO', 'Linguee', 'Cambridge']);
    expect(l[0].url).toBe('https://en.wiktionary.org/wiki/relinquish#English');
    expect(lookupLinks('a b', [{ ...DEFAULT_LOOKUP_PROVIDERS[1] }], EN_DE)[0].url).toBe('https://www.dict.cc/?s=a%20b');
  });
  it('shows only the dictionaries for the language pair; custom ones everywhere', () => {
    const custom = { id: 'c1', name: 'Mine', enabled: true, order: 9, urlTemplate: 'https://x.test/{source}-{target}/{word}' };
    const fr = lookupLinks('homme', [...DEFAULT_LOOKUP_PROVIDERS, custom], { source: 'fr', target: 'es' });
    expect(fr.map((x) => x.name)).toEqual(['Wiktionary', 'Mine']);
    expect(fr.map((x) => x.url)).toEqual(['https://en.wiktionary.org/wiki/homme#French', 'https://x.test/fr-es/homme']);
    expect(lookupLinks('moor', DEFAULT_LOOKUP_PROVIDERS, { source: 'en', target: 'fr' }).map((x) => x.name)).toEqual(['Wiktionary', 'Cambridge']);
    // settings stored before pairs: the built-in template and pairs still apply
    const stored = { ...DEFAULT_LOOKUP_PROVIDERS[0], urlTemplate: 'https://en.wiktionary.org/wiki/{word}#English' };
    expect(lookupLinks('Haus', [stored], { source: 'de', target: 'en' })[0].url).toBe('https://en.wiktionary.org/wiki/Haus#German');
  });
  it('accepts only https templates with {word}', () => {
    expect(isValidTemplate('https://example.com/?q={word}')).toBe(true);
    expect(isValidTemplate('http://example.com/?q={word}')).toBe(false);
    expect(isValidTemplate('https://example.com/')).toBe(false);
    expect(isValidTemplate('javascript:alert({word})')).toBe(false);
  });
});

describe('resolveCardContent (§6.3)', () => {
  const e = { lemma: 'x', rank: 5000, pos: [], tr: [], trExtra: [], cognate: false };
  it('prefers Wiktionary, then FreeDict, then the definition', () => {
    expect(resolveCardContent({ ...e, tr: ['a', 'b', 'c', 'd', 'e'], def: 'D' }, true)).toEqual({ translations: ['a', 'b', 'c', 'd'], definition: 'D', translationSource: 'list' });
    expect(resolveCardContent({ ...e, trExtra: ['f'], def: 'D' }, true)?.translations).toEqual(['f']);
    expect(resolveCardContent({ ...e, def: 'D' }, true)).toEqual({ translations: [], definition: 'D', translationSource: 'definition' });
    expect(resolveCardContent({ ...e, def: 'D' }, false)).toBeUndefined();
  });
});

describe('headword', () => {
  it('prefixes "to" when the main part of speech is a verb', () => {
    expect(headword('brood', ['verb', 'adj', 'noun'])).toBe('to brood');
    expect(headword('cudgel', ['noun', 'verb'])).toBe('cudgel');
    expect(headword('quaint', ['adj'])).toBe('quaint');
    expect(headword('frobnicate', [])).toBe('frobnicate');
  });
});
