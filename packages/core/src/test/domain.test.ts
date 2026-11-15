import { describe, expect, it } from 'vitest';
import { fit, shuffle } from '../domain/calibration.ts';
import { grade, DEFAULT_SCHEDULER } from '../domain/scheduler.ts';
import { onGrade, newUnlocks, ACHIEVEMENTS } from '../domain/achievements.ts';
import { levelOfRank, startLevel } from '../domain/levels.ts';
import { lookupLinks, isValidTemplate, DEFAULT_LOOKUP_PROVIDERS } from '../domain/lookup.ts';
import { resolveCardContent } from '../domain/cardContent.ts';
import { nearestLevels } from '../services/calibrationService.ts';
import { EMPTY_STATS } from '../domain/settings.ts';
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

describe('lookup links (C16–C17)', () => {
  it('encodes the lemma into enabled https templates in order', () => {
    const l = lookupLinks('relinquish', DEFAULT_LOOKUP_PROVIDERS);
    expect(l.map((x) => x.name)).toEqual(['Wiktionary', 'dict.cc', 'LEO', 'Linguee', 'Cambridge']);
    expect(l[0].url).toBe('https://en.wiktionary.org/wiki/relinquish#English');
    expect(lookupLinks('a b', [{ ...DEFAULT_LOOKUP_PROVIDERS[1] }])[0].url).toBe('https://www.dict.cc/?s=a%20b');
  });
  it('accepts only https templates with {word}', () => {
    expect(isValidTemplate('https://example.com/?q={word}')).toBe(true);
    expect(isValidTemplate('http://example.com/?q={word}')).toBe(false);
    expect(isValidTemplate('https://example.com/')).toBe(false);
    expect(isValidTemplate('javascript:alert({word})')).toBe(false);
  });
});

describe('resolveCardContent (§6.3)', () => {
  const e = { lemma: 'x', rank: 5000, pos: [], de: [], deFreedict: [], cognate: false };
  it('prefers Wiktionary, then FreeDict, then the definition', () => {
    expect(resolveCardContent({ ...e, de: ['a', 'b', 'c', 'd', 'e'], def: 'D' }, true)).toEqual({ translations: ['a', 'b', 'c', 'd'], definition: 'D', translationSource: 'list' });
    expect(resolveCardContent({ ...e, deFreedict: ['f'], def: 'D' }, true)?.translations).toEqual(['f']);
    expect(resolveCardContent({ ...e, def: 'D' }, true)).toEqual({ translations: [], definition: 'D', translationSource: 'definition' });
    expect(resolveCardContent({ ...e, def: 'D' }, false)).toBeUndefined();
  });
});
