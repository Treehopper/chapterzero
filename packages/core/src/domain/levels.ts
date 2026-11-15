/** List levels as rank bands (README §6.2). */
export const LEVELS: { level: number; from: number; to: number }[] = [
  { level: 1, from: 1001, to: 2000 },
  { level: 2, from: 2001, to: 3000 },
  { level: 3, from: 3001, to: 5000 },
  { level: 4, from: 5001, to: 7500 },
  { level: 5, from: 7501, to: 10000 },
  { level: 6, from: 10001, to: 15000 },
  { level: 7, from: 15001, to: 20000 },
  { level: 8, from: 20001, to: 30000 },
  { level: 9, from: 30001, to: 45000 },
  { level: 10, from: 45001, to: 100000 },
];

export const COMMON_MAX_RANK = 1000;
export const DEFAULT_CUTOFF = 8000;

/** Level whose range contains `rank` (0 for common words). */
export function levelOfRank(rank: number): number {
  if (rank <= COMMON_MAX_RANK) return 0;
  for (const l of LEVELS) if (rank <= l.to) return l.level;
  return 10;
}

/** The level the learner "starts at": the level whose range contains the cutoff (§7.8). */
export function startLevel(cutoffRank: number): number {
  return Math.max(1, levelOfRank(cutoffRank));
}
