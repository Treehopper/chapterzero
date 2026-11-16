/** Domain model (README §5). Plain JSON objects only. */

export type BookId = string;
export type CardId = string;
export type SessionId = string;
export type CardStatus = 'active' | 'removed' | 'known';
export type Grade = 'known' | 'unknown';
export type Tier = 'bronze' | 'silver' | 'gold';

export interface Work { index: number; title: string }

export interface Chapter {
  index: number;
  workIndex: number;
  title: string;
  kind: 'story' | 'frontMatter' | 'backMatter';
  included: boolean;
  wordTokens: number;
}

export interface Book {
  id: BookId;
  title: string;
  author?: string;
  language: 'en';
  importedAt: string;
  cutoffRank: number;
  stats: { wordTokens: number; distinctWords: number };
  coverDataUrl?: string;
  works: Work[];
  chapters: Chapter[];
  chaptersAnnounced: number[];
  finishedAt?: string;
}

export type LemmaKind = 'card' | 'belowLevel' | 'known' | 'cognate' | 'name' | 'unlisted';

export interface BookLemma {
  bookId: BookId;
  lemma: string;
  kind: LemmaKind;
  /** Re-filtering (B3) needs the classification inputs, not just its result. */
  listed: boolean;
  name: boolean;
  forms: string[];
  occurrences: number;
  occurrencesByChapter: Record<number, number>;
  firstPosition: number;
  example?: string;
  ignored?: boolean;
}

export interface CardStats {
  correct: number;
  wrong: number;
  failStreak: number;
  lastReviewedAt?: string;
  /** First grade ever; drives the daily new-card limit (§7.3 step 2). */
  firstReviewedAt?: string;
}

export interface Card {
  id: CardId;
  bookId: BookId;
  lemma: string;
  forms: string[];
  occurrences: number;
  occurrencesByChapter: Record<number, number>;
  firstPosition: number;
  chapterIndex: number;
  example?: string;
  listLevel?: number;
  translations: string[];
  definition?: string;
  pos: string[];
  translationSource: 'list' | 'definition' | 'manual';
  origin: 'import' | 'manual';
  status: CardStatus;
  /** Set when the learner changed the translation (protects it from re-filtering). */
  edited?: boolean;
  level: number;
  dueAt?: string;
  stats: CardStats;
}

export interface ImportDraft {
  id: string;
  createdAt: string;
  book: Omit<Book, 'id' | 'importedAt' | 'cutoffRank' | 'chaptersAnnounced'>;
  lemmas: Omit<BookLemma, 'bookId' | 'kind'>[];
  listedLemmas: string[];
  nameLemmas: string[];
  /** Distinct common tokens with the chapters they occur in (preview counts). */
  common: { token: string; chapters: number[] }[];
}

export interface PreviewCounts {
  distinctWords: number; common: number; belowLevel: number; known: number;
  cognates: number; names: number; cards: number; unlisted: number;
}

export interface ImportPreview {
  draftId: string;
  title: string;
  author?: string;
  coverDataUrl?: string;
  works: {
    index: number; title: string;
    chapters: { index: number; title: string; kind: Chapter['kind']; included: boolean; wordTokens: number }[];
  }[];
  cutoffRank: number;
  level: number;
  counts: PreviewCounts;
  cardsPerListLevel: Record<number, number>;
  coverageBefore: number;
  includedChapters: number[];
}

export interface ChapterProgress {
  index: number; workIndex: number; title: string; displayTitle: string;
  included: boolean; wordTokens: number;
  coverage: number;
  unknownEvery: number | null;
  state: 'ready' | 'learning' | 'upcoming' | 'excluded';
  cards: { unseen: number; learning: number; learned: number };
  unlisted: { words: number; occurrences: number };
}

export interface CardSnapshot { card: Card }

export interface StudySession {
  id: SessionId;
  bookId: BookId;
  startedAt: string;
  queue: CardId[];
  current?: { cardId: CardId; phase: 'front' | 'back' | 'wrongReview' };
  undo?: {
    kind: 'grade' | 'retire' | 'remove';
    cardId: CardId;
    before: CardSnapshot;
    queueBefore: CardId[];
    currentBefore: StudySession['current'];
    countersBefore: StudySession['counters'];
    gradedBefore: CardId[];
    statsBefore: LearnerStats;
    addedKnownWord?: string;
    logSeq?: number;
  };
  counters: {
    reviewed: number; correct: number; wrong: number; promoted: number; demoted: number;
    alreadyKnown: number; removed: number;
    /** first attempt of each card in this session (accuracy, §7.5) */
    firstAttempts: number; firstAttemptsCorrect: number;
  };
  /** cards graded at least once in this session */
  graded: CardId[];
  targetChapter?: number;
  studyAhead?: boolean;
  coverageAtStart: { book: number; chapter: number; chapterIndex: number };
  state: 'active' | 'finished';
  finishedAt?: string;
  statistics?: SessionStatistics;
  unlocks: AchievementUnlock[];
}

export interface BookProgress {
  bookId: BookId;
  title: string;
  coverage: number;
  unknownEvery: number | null;
  coverageTarget: number;
  works: { index: number; title: string }[];
  chapters: ChapterProgress[];
  learningChapter?: { index: number; displayTitle: string; coverage: number };
  boxes: number[];
  cards: { active: number; unseen: number; learning: number; learned: number; known: number; removed: number; total: number };
  rareWordsKnown: number;
  rareWordsTotal: number;
  unlisted: { words: number; occurrences: number };
  due: number;
  finishedAt?: string;
}

export interface SessionStatistics {
  sessionId: SessionId;
  bookId: BookId;
  session: {
    reviewed: number; firstTryAccuracy: number; promoted: number; demoted: number;
    alreadyKnown: number; removed: number; durationSec: number;
  };
  coverage: {
    chapter?: { index: number; displayTitle: string; before: number; after: number };
    book: { before: number; after: number };
  };
  book: BookProgress;
  overall: {
    streakDays: number; longestStreak: number; reviewsToday: number;
    dailyGoal: number; wordsLearnedAllBooks: number;
  };
  achievements: AchievementUnlock[];
  perfect: boolean;
}

export interface VocabularyProfile {
  cutoffRank: number;
  r50?: number;
  k?: number;
  source: 'calibration' | 'manual' | 'default';
  updatedAt: string;
}

export interface CalibrationItem { lemma: string; rank: number; level: number; de: string[]; pos?: string[]; def?: string; known?: boolean }

export interface CalibrationSession {
  items: CalibrationItem[];
  position: number;
  stage: 1 | 2;
  phase?: 'front' | 'back';
  /** words swapped out as no fair test (H), never drawn again */
  replaced?: string[];
}

export interface LearnerStats {
  correctStreak: number;
  bestCorrectStreak: number;
  totalCorrect: number;
  booksFinished: BookId[];
  comebacks: number;
}

export type AchievementMetric = 'bestCorrectStreak' | 'totalCorrect' | 'booksFinished' | 'comebacks' | 'bookFinished';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  metric: AchievementMetric;
  tiers: { tier: Tier; threshold: number }[];
  bookId?: BookId;
}

export interface AchievementUnlock {
  achievementId: string;
  tier?: Tier;
  unlockedAt: string;
  sessionId?: SessionId;
  /** display copy, filled in when the unlock is created */
  name?: string;
  description?: string;
}

export interface LookupProvider {
  id: string; name: string; enabled: boolean; order: number;
  urlTemplate: string;
}

export interface ReviewLogEntry {
  seq?: number;
  cardId: CardId; bookId: BookId; at: string;
  result: Grade; levelBefore: number; levelAfter: number;
}

export interface SchedulerConfig {
  baseIntervalDays: number;
  factor: number;
  maxLevel: number;
  requeueGap: number;
}

export interface Settings {
  dailyNewLimit: number;
  dailyGoal: number;
  coverageTarget: number;
  retireOnFirstTry: boolean;
  useEnglishDefinitions: boolean;
  skipCognates: boolean;
  requireFlipBeforeGrade: boolean;
  gestureHints: 'everySession' | 'off';
  achievementPopups: boolean;
  lookupProviders: LookupProvider[];
  scheduler: SchedulerConfig;
}

export interface AppState {
  lastBookId?: BookId;
  lastRoute?: string;
  installGuideDismissed?: boolean;
  levelHintDismissed?: boolean;
  /** the one-time question "grade without flipping?" was answered */
  frontSwipeAsked?: boolean;
  lastExportAt?: string;
}

export interface WordEntry {
  lemma: string;
  rank: number;
  pos: string[];
  de: string[];
  deFreedict: string[];
  def?: string;
  cognate: boolean;
}

export interface PackInfo {
  id: string; version: string; sources: string[]; licence: string;
  entryCount: number; bytes: number;
}

export interface PackStatus {
  installed: boolean;
  /** installed pack versions */
  packs: PackInfo[];
  /** what the server offers, when it could be reached */
  available?: PackInfo[];
  updateAvailable: boolean;
  name?: string;
}

export interface Progress { loaded: number; total: number; phase: string }

export interface EpubContent {
  meta: { title: string; author?: string; coverDataUrl?: string };
  toc: { title: string; depth: number; section: number; anchorId?: string }[];
  sections: {
    blocks: {
      text: string;
      anchorIds: string[];
      links: { section: number; anchorId?: string }[];
    }[];
  }[];
}

export interface BackupV1 {
  format: 'vocabfirst-backup';
  version: 1;
  exportedAt: string;
  books: Book[];
  bookLemmas: BookLemma[];
  cards: Card[];
  sessions: StudySession[];
  reviewLog: ReviewLogEntry[];
  knownWords: string[];
  profile?: VocabularyProfile;
  stats: LearnerStats;
  unlocks: AchievementUnlock[];
  settings: Settings;
}
