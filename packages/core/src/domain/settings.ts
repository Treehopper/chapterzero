import { DEFAULT_LOOKUP_PROVIDERS } from './lookup.ts';
import { DEFAULT_SCHEDULER } from './scheduler.ts';
import type { LearnerStats, Settings } from './types.ts';

export const DEFAULT_SETTINGS: Settings = {
  dailyGoal: 20,
  coverageTarget: 0.98,
  retireOnFirstTry: true,
  useDefinitions: true,
  skipCognates: true,
  requireFlipBeforeGrade: true,
  frontSwipe: 'ask',
  gestureHints: 'everySession',
  achievementPopups: true,
  undoAfterGrade: true,
  undoAfterKnown: true,
  showBoxLevel: false,
  showLookupLinks: true,
  bookSentence: 'both',
  uiLanguage: 'auto',
  theme: 'auto',
  lookupProviders: DEFAULT_LOOKUP_PROVIDERS,
  scheduler: DEFAULT_SCHEDULER,
};

export const EMPTY_STATS: LearnerStats = { correctStreak: 0, bestCorrectStreak: 0, totalCorrect: 0, booksFinished: [], comebacks: 0 };

export function clampSettings(s: Settings): Settings {
  return {
    ...s,
    dailyGoal: Math.max(1, Math.min(500, Math.round(s.dailyGoal))),
    coverageTarget: Math.max(0.95, Math.min(1, s.coverageTarget)),
  };
}

/** stored settings of older versions: renamed and dropped fields */
export function migrateSettings(s: Partial<Settings> & { useEnglishDefinitions?: boolean; dailyNewLimit?: number }): Partial<Settings> {
  const { useEnglishDefinitions, dailyNewLimit: _dropped, ...rest } = s;
  return useEnglishDefinitions === undefined || rest.useDefinitions !== undefined ? rest : { ...rest, useDefinitions: useEnglishDefinitions };
}
