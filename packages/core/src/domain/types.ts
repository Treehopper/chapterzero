/** Domain model (README §5). Plain JSON objects only. */
import type { LanguagePair } from './language.ts';

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
  /** BCP 47 code of the book's language: the word list's source language at import */
  language: string;
  /** the language of the cards' translations; books imported before language pairs: 'de' */
  translationLanguage?: string;
  importedAt: string;
  cutoffRank: number;
  stats: { wordTokens: number; distinctWords: number };
  coverDataUrl?: string;
  works: Work[];
  chapters: Chapter[];
  chaptersAnnounced: number[];
  finishedAt?: string;
}

/** The book's text for the reader (Epic R), stored at import: paragraphs per chapter, in reading order. */
export interface BookText {
  bookId: BookId;
  chapters: BookTextChapter[];
}
/** footnotes sit right after the paragraph that links to them (B13), marked `note` */
export interface BookTextChapter { blocks: { text: string; note?: boolean }[] }

export interface ReadingPosition { bookId: BookId; chapter: number; block: number; at: string }

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
  /** the part of speech the book uses, when its forms and context agree ("chafed" → verb) */
  pos?: string;
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
  /** the text for the reader, per chapter (Epic R) */
  text: BookTextChapter[];
  /** the language the EPUB says it is in */
  declaredLanguage?: string;
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
  /** the word lists' source language, and the EPUB's own when it says another one (wrong lists for this book) */
  language: string;
  otherLanguage?: string;
}

export interface ChapterProgress {
  index: number; workIndex: number; title: string; displayTitle: string;
  included: boolean; wordTokens: number;
  coverage: number;
  /** 0–1 of the way from "no card of this chapter known" to the coverage target; 1 = ready */
  toTarget: number;
  unknownEvery: number | null;
  state: 'ready' | 'learning' | 'upcoming' | 'excluded';
  cards: { unseen: number; learning: number; learned: number };
  unlisted: { words: number; occurrences: number };
  /** practice this chapter adds until it is ready, once the chapters before it are (E7); absent when ready or not included */
  toReady?: ToReady;
}

export interface ToReady { minutes: number; cards: number; newCards: number }

export interface CardSnapshot { card: Card }

export interface StudySession {
  id: SessionId;
  bookId: BookId;
  startedAt: string;
  queue: CardId[];
  /** seenBack: the back was shown once, so a swipe on the front grades even with requireFlipBeforeGrade */
  current?: { cardId: CardId; phase: 'front' | 'back' | 'wrongReview'; seenBack?: boolean };
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
    /** the word's row before "translation makes no sense" moved it to the words not in the lists */
    lemmaBefore?: BookLemma;
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
  /** chosen at start: a fixed number of cards (no refill) or an end time (refills past the daily limit) */
  cardLimit?: number;
  endsAt?: string;
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
  /** every included chapter ready now, however it got there (finishedAt is set once, by study, G2) */
  ready: boolean;
  /** practice until every included chapter is ready (E7); days: at the daily new-card limit, plus a day for the last ones' second review */
  toReady: ToReady & { days: number };
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

export interface CalibrationItem { lemma: string; rank: number; level: number; tr: string[]; pos?: string[]; def?: string; known?: boolean }

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
  /** {word}; also {source} / {target} (language codes) and {sourceName} (English name: "English") */
  urlTemplate: string;
  /** the language pairs it serves, "en-de" or "en-*"; none = all */
  pairs?: string[];
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
  /** a definition in the book's language when the lists have no translation */
  useDefinitions: boolean;
  skipCognates: boolean;
  /** vocabulary check (H2): a swipe on the front only answers after the flip */
  requireFlipBeforeGrade: boolean;
  /** study: a right swipe on a card never turned over. 'ask' once, then 'known' (out for good), 'grade' (knew it), 'off'.
   *  A left swipe on such a card never grades: nothing is shown after a swipe (user feedback) */
  frontSwipe: 'ask' | 'known' | 'grade' | 'off';
  gestureHints: 'everySession' | 'off';
  /** false hides achievements and streaks everywhere: pop-ups, statistics, library, book overview */
  achievementPopups: boolean;
  /** the Undo pill after a swipe grade; Undo stays in the swipe-up panel */
  undoAfterGrade: boolean;
  /** the Undo button after Mark as known (study panel, front swipe, Words screen) */
  undoAfterKnown: boolean;
  /** the box dots on the card back */
  showBoxLevel: boolean;
  /** the lookup links on the card back (C17) */
  showLookupLinks: boolean;
  /** the app's own language; 'auto' follows the device (English unless it is German) */
  uiLanguage: 'auto' | 'en' | 'de';
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
  /** translations into the target language */
  tr: string[];
  /** translations from a second dictionary, used when `tr` is empty */
  trExtra: string[];
  /** definition in the source language */
  def?: string;
  /** looks and means nearly the same in the target language */
  cognate: boolean;
  /** other parts of speech with their own translations / definition (pos[0]'s are tr and def) */
  senses?: { pos: string; tr: string[]; def?: string }[];
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
  /** the installed lists' languages, else what the server offers */
  pair?: LanguagePair;
}

export interface Progress { loaded: number; total: number; phase: string }

export interface EpubContent {
  /** language: the EPUB's dc:language, if given */
  meta: { title: string; author?: string; language?: string; coverDataUrl?: string };
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
