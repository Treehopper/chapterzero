/** Ports (README §4.1): everything core needs from the outside world. */
import type {
  AchievementUnlock, AppState, BackupV1, Book, BookId, BookLemma, BookText, CalibrationSession, Card, CardId,
  EpubContent, ImportDraft, LearnerStats, LemmaKind, PackInfo, PackStatus, Progress, ReadingPosition, ReviewLogEntry,
  SessionId, Settings, StudySession, VocabularyProfile, WordEntry,
} from '../domain/types.ts';

export interface CardFilter { status?: Card['status'] }

export interface BookRepository {
  get(id: BookId): Promise<Book | undefined>;
  list(): Promise<Book[]>;
  save(book: Book): Promise<void>;
  /** cascades to cards, book lemmas, sessions, the book's text and reading position */
  delete(id: BookId): Promise<void>;
}

export interface BookTextRepository {
  get(bookId: BookId): Promise<BookText | undefined>;
  save(text: BookText): Promise<void>;
  getPosition(bookId: BookId): Promise<ReadingPosition | undefined>;
  savePosition(p: ReadingPosition): Promise<void>;
}

export interface CardRepository {
  get(id: CardId): Promise<Card | undefined>;
  listByBook(bookId: BookId, filter?: CardFilter): Promise<Card[]>;
  listAll(): Promise<Card[]>;
  saveMany(cards: Card[]): Promise<void>;
  deleteMany(ids: CardId[]): Promise<void>;
}

export interface BookLemmaRepository {
  saveMany(rows: BookLemma[]): Promise<void>;
  get(bookId: BookId, lemma: string): Promise<BookLemma | undefined>;
  listByBook(bookId: BookId, kind?: LemmaKind): Promise<BookLemma[]>;
}

export interface ImportDraftRepository {
  get(id: string): Promise<ImportDraft | undefined>;
  save(draft: ImportDraft): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface SessionRepository {
  get(id: SessionId): Promise<StudySession | undefined>;
  getActive(bookId: BookId): Promise<StudySession | undefined>;
  save(session: StudySession): Promise<void>;
}

export interface ReviewLogRepository {
  /** returns the sequence number of the new entry */
  append(entry: ReviewLogEntry): Promise<number>;
  remove(seq: number): Promise<void>;
  listSince(since: Date): Promise<ReviewLogEntry[]>;
}

export interface AchievementRepository {
  getStats(): Promise<LearnerStats>;
  saveStats(stats: LearnerStats): Promise<void>;
  listUnlocks(): Promise<AchievementUnlock[]>;
  addUnlocks(unlocks: AchievementUnlock[]): Promise<void>;
}

export interface KnownWordRepository {
  hasMany(lemmas: string[]): Promise<Set<string>>;
  addMany(lemmas: string[]): Promise<void>;
  remove(lemma: string): Promise<void>;
}

export interface ProfileRepository {
  getProfile(): Promise<VocabularyProfile | undefined>;
  saveProfile(profile: VocabularyProfile): Promise<void>;
  getCalibration(): Promise<CalibrationSession | undefined>;
  saveCalibration(session: CalibrationSession | undefined): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
}

export interface AppStateRepository {
  get(): Promise<AppState>;
  save(state: AppState): Promise<void>;
}

/** Whole-database dump/replace for BackupV1 (F1). */
export interface BackupStore {
  dump(): Promise<Omit<BackupV1, 'format' | 'version' | 'exportedAt'>>;
  replace(data: BackupV1): Promise<void>;
}

export interface Repositories {
  books: BookRepository;
  cards: CardRepository;
  bookTexts: BookTextRepository;
  bookLemmas: BookLemmaRepository;
  drafts: ImportDraftRepository;
  sessions: SessionRepository;
  reviewLog: ReviewLogRepository;
  achievements: AchievementRepository;
  knownWords: KnownWordRepository;
  profile: ProfileRepository;
  settings: SettingsRepository;
  appState: AppStateRepository;
  backup: BackupStore;
}

/** Atomic multi-repository write — required for C5. */
export interface UnitOfWork {
  run<T>(work: (tx: Repositories) => Promise<T>): Promise<T>;
}

export interface WordList {
  info(): Promise<PackInfo[]>;
  /** token → lemma. '' = common word. Absent key = not in the lists. */
  resolve(tokens: string[]): Promise<Map<string, string>>;
  /** form → its only part of speech, for forms that have one ("chafed" → verb); others are absent */
  formPos(forms: string[]): Promise<Map<string, string>>;
  entries(lemmas: string[]): Promise<Map<string, WordEntry>>;
  firstAtOrAfter(rank: number, maxRank: number): Promise<WordEntry | undefined>;
}

export interface PackInstaller {
  status(): Promise<PackStatus>;
  install(onProgress: (p: Progress) => void): Promise<void>;
}

export interface EpubReader {
  read(file: ArrayBuffer): Promise<EpubContent>;
}

export interface Clock { now(): Date }
export interface IdGenerator { next(): string }
export interface Random { next(): number }

export interface Ports {
  uow: UnitOfWork;
  wordList: WordList;
  packs: PackInstaller;
  epub: EpubReader;
  clock: Clock;
  ids: IdGenerator;
  random: Random;
}
