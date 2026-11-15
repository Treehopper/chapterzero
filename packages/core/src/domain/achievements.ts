/** Achievements (README §7.6). Definitions are data. */
import type { AchievementDefinition, AchievementUnlock, Book, Card, Grade, LearnerStats, Tier } from './types.ts';

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'on-a-roll', name: 'On a Roll', description: 'Correct answers in a row', metric: 'bestCorrectStreak',
    tiers: [{ tier: 'bronze', threshold: 5 }, { tier: 'silver', threshold: 10 }, { tier: 'gold', threshold: 20 }] },
  { id: 'word-hoard', name: 'Word Hoard', description: 'Correct answers in total', metric: 'totalCorrect',
    tiers: [{ tier: 'bronze', threshold: 50 }, { tier: 'silver', threshold: 100 }, { tier: 'gold', threshold: 150 }] },
  { id: 'bookworm', name: 'Bookworm', description: 'Books ready to read', metric: 'booksFinished',
    tiers: [{ tier: 'bronze', threshold: 1 }, { tier: 'silver', threshold: 5 }, { tier: 'gold', threshold: 10 }] },
  { id: 'comeback', name: 'Comeback', description: 'Cards finally known after 3+ misses in a row', metric: 'comebacks',
    tiers: [{ tier: 'bronze', threshold: 1 }, { tier: 'silver', threshold: 10 }, { tier: 'gold', threshold: 25 }] },
];

export function bookAchievement(book: Pick<Book, 'id' | 'title'>): AchievementDefinition {
  return { id: `ready:${book.id}`, name: `Ready for ${book.title}`, description: 'Every chapter ready to read',
    metric: 'bookFinished', tiers: [{ tier: 'gold', threshold: 1 }], bookId: book.id };
}

export function metricValue(def: AchievementDefinition, stats: LearnerStats): number {
  switch (def.metric) {
    case 'bestCorrectStreak': return stats.bestCorrectStreak;
    case 'totalCorrect': return stats.totalCorrect;
    case 'booksFinished': return stats.booksFinished.length;
    case 'comebacks': return stats.comebacks;
    case 'bookFinished': return def.bookId && stats.booksFinished.includes(def.bookId) ? 1 : 0;
  }
}

export function onGrade(stats: LearnerStats, card: Card, result: Grade): { stats: LearnerStats; card: Card } {
  if (result === 'known') {
    const comeback = card.stats.failStreak >= 3;
    const streak = stats.correctStreak + 1;
    return {
      stats: { ...stats, correctStreak: streak, totalCorrect: stats.totalCorrect + 1,
        bestCorrectStreak: Math.max(stats.bestCorrectStreak, streak), comebacks: stats.comebacks + (comeback ? 1 : 0) },
      card: { ...card, stats: { ...card.stats, failStreak: 0 } },
    };
  }
  return { stats: { ...stats, correctStreak: 0 },
    card: { ...card, stats: { ...card.stats, failStreak: card.stats.failStreak + 1 } } };
}

const unlockKey = (id: string, tier?: Tier) => `${id}|${tier ?? ''}`;

export function newUnlocks(defs: AchievementDefinition[], stats: LearnerStats, existing: AchievementUnlock[],
  at: string, sessionId?: string): AchievementUnlock[] {
  const have = new Set(existing.map((u) => unlockKey(u.achievementId, u.tier)));
  const out: AchievementUnlock[] = [];
  for (const d of defs) {
    const v = metricValue(d, stats);
    for (const t of d.tiers) {
      if (v >= t.threshold && !have.has(unlockKey(d.id, t.tier))) {
        out.push({ achievementId: d.id, tier: t.tier, unlockedAt: at, sessionId, name: d.name, description: d.description });
      }
    }
  }
  return out;
}
