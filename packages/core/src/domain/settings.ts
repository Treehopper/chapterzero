import { DEFAULT_LOOKUP_PROVIDERS } from './lookup.ts';
import { DEFAULT_SCHEDULER } from './scheduler.ts';
import type { LearnerStats, Settings } from './types.ts';

export const DEFAULT_SETTINGS: Settings = {
  dailyNewLimit: 20,
  dailyGoal: 20,
  coverageTarget: 0.98,
  retireOnFirstTry: true,
  useEnglishDefinitions: true,
  skipCognates: true,
  requireFlipBeforeGrade: true,
  gestureHints: 'everySession',
  achievementPopups: true,
  undoAfterGrade: true,
  showBoxLevel: false,
  lookupProviders: DEFAULT_LOOKUP_PROVIDERS,
  scheduler: DEFAULT_SCHEDULER,
};

export const EMPTY_STATS: LearnerStats = { correctStreak: 0, bestCorrectStreak: 0, totalCorrect: 0, booksFinished: [], comebacks: 0 };

export function clampSettings(s: Settings): Settings {
  return {
    ...s,
    dailyNewLimit: Math.max(1, Math.min(200, Math.round(s.dailyNewLimit))),
    dailyGoal: Math.max(1, Math.min(500, Math.round(s.dailyGoal))),
    coverageTarget: Math.max(0.95, Math.min(1, s.coverageTarget)),
  };
}
