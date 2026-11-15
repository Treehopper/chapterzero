/** IndexedDB adapters (Dexie) for the core repository ports (README §10). */
import Dexie, { type Table } from 'dexie';
import {
  DEFAULT_SETTINGS, EMPTY_STATS,
  type AchievementUnlock, type AppState, type BackupV1, type Book, type BookLemma, type CalibrationSession, type Card,
  type ImportDraft, type LearnerStats, type Repositories, type ReviewLogEntry, type Settings, type StudySession,
  type UnitOfWork, type VocabularyProfile,
} from '@vocabfirst/core';

export type WordRow = { lemma: string; rank: number; pos: string[]; de: string[]; def: string | null; flags: number };
export type FreedictRow = { lemma: string; de: string[] };
export type FormRow = { form: string; lemma: string };
export type PackChunkRow = { packId: string; file: string; sha256: string; version: string };
type Meta = { key: string; value: unknown };

export class VocabDb extends Dexie {
  books!: Table<Book, string>;
  cards!: Table<Card, string>;
  bookLemmas!: Table<BookLemma, [string, string]>;
  importDrafts!: Table<ImportDraft, string>;
  sessions!: Table<StudySession, string>;
  reviewLog!: Table<ReviewLogEntry, number>;
  knownWords!: Table<{ lemma: string }, string>;
  achievementUnlocks!: Table<AchievementUnlock, [string, string]>;
  words!: Table<WordRow, string>;
  wordsFreedict!: Table<FreedictRow, string>;
  forms!: Table<FormRow, string>;
  packChunks!: Table<PackChunkRow, [string, string]>;
  meta!: Table<Meta, string>;

  constructor(name = 'vocabfirst') {
    super(name);
    this.version(1).stores({
      books: 'id',
      cards: 'id, bookId, [bookId+status], lemma',
      bookLemmas: '[bookId+lemma], bookId, [bookId+kind]',
      importDrafts: 'id',
      sessions: 'id, [bookId+state]',
      reviewLog: '++seq, at, cardId, bookId',
      knownWords: 'lemma',
      achievementUnlocks: '[achievementId+tier], unlockedAt',
      words: 'lemma, rank',
      wordsFreedict: 'lemma',
      forms: 'form',
      packChunks: '[packId+file]',
      meta: 'key',
    });
  }

  /** user data tables (everything except the word packs) */
  get userTables() {
    return [this.books, this.cards, this.bookLemmas, this.importDrafts, this.sessions, this.reviewLog, this.knownWords,
      this.achievementUnlocks, this.meta];
  }
}

// Repository methods return Dexie promises (no async/await): native awaits inside a nested
// async function can end the IndexedDB transaction early (Dexie PrematureCommitError).
const getMeta = <T>(db: VocabDb, key: string, fallback: T): Promise<T> =>
  db.meta.get(key).then((row) => (row ? (row.value as T) : fallback));
const setMeta = (db: VocabDb, key: string, value: unknown): Promise<void> =>
  value === undefined ? db.meta.delete(key) : db.meta.put({ key, value }).then(() => undefined);
const done = () => undefined;

const byBook = (id: string) => [[id, Dexie.minKey], [id, Dexie.maxKey]] as const;

export function idbRepositories(db: VocabDb): Repositories {
  return {
    books: {
      get: (id) => db.books.get(id),
      list: () => db.books.toArray(),
      save: (b) => db.books.put(b).then(done),
      delete: (id) => {
        const [lo, hi] = byBook(id);
        return db.cards.where('bookId').equals(id).delete()
          .then(() => db.bookLemmas.where('bookId').equals(id).delete())
          .then(() => db.sessions.where('[bookId+state]').between(lo, hi, true, true).delete())
          .then(() => db.books.delete(id));
      },
    },
    cards: {
      get: (id) => db.cards.get(id),
      listByBook: (bookId, f) => (f?.status ? db.cards.where('[bookId+status]').equals([bookId, f.status]).toArray() : db.cards.where('bookId').equals(bookId).toArray()),
      listAll: () => db.cards.toArray(),
      saveMany: (cs) => db.cards.bulkPut(cs).then(done),
      deleteMany: (ids) => db.cards.bulkDelete(ids),
    },
    bookLemmas: {
      saveMany: (rows) => db.bookLemmas.bulkPut(rows).then(done),
      get: (b, l) => db.bookLemmas.get([b, l]),
      listByBook: (b, kind) => (kind ? db.bookLemmas.where('[bookId+kind]').equals([b, kind]).toArray() : db.bookLemmas.where('bookId').equals(b).toArray()),
    },
    drafts: {
      get: (id) => db.importDrafts.get(id),
      save: (d) => db.importDrafts.put(d).then(done),
      delete: (id) => db.importDrafts.delete(id),
    },
    sessions: {
      get: (id) => db.sessions.get(id),
      getActive: (bookId) => db.sessions.where('[bookId+state]').equals([bookId, 'active']).first(),
      save: (s) => db.sessions.put(s).then(done),
    },
    reviewLog: {
      append: (e) => { const { seq: _seq, ...rest } = e; return db.reviewLog.add(rest as ReviewLogEntry).then((k) => k as number); },
      remove: (seq) => db.reviewLog.delete(seq),
      listSince: (since) => db.reviewLog.where('at').aboveOrEqual(since.toISOString()).toArray(),
    },
    achievements: {
      getStats: () => getMeta<LearnerStats>(db, 'stats', EMPTY_STATS),
      saveStats: (s) => setMeta(db, 'stats', s),
      listUnlocks: () => db.achievementUnlocks.toArray(),
      addUnlocks: (u) => db.achievementUnlocks.bulkPut(u.map((x) => ({ ...x, tier: x.tier ?? 'gold' }))).then(done),
    },
    knownWords: {
      hasMany: (ls) => db.knownWords.bulkGet(ls).then((rows) => new Set(rows.filter((r): r is { lemma: string } => !!r).map((r) => r.lemma))),
      addMany: (ls) => db.knownWords.bulkPut(ls.map((lemma) => ({ lemma }))).then(done),
      remove: (l) => db.knownWords.delete(l),
    },
    profile: {
      getProfile: () => getMeta<VocabularyProfile | undefined>(db, 'profile', undefined),
      saveProfile: (p) => setMeta(db, 'profile', p),
      getCalibration: () => getMeta<CalibrationSession | undefined>(db, 'calibration', undefined),
      saveCalibration: (s) => setMeta(db, 'calibration', s),
    },
    settings: {
      get: () => getMeta<Partial<Settings>>(db, 'settings', {}).then((s) => ({ ...DEFAULT_SETTINGS, ...s })),
      save: (s) => setMeta(db, 'settings', s),
    },
    appState: {
      get: () => getMeta<AppState>(db, 'appState', {}),
      save: (s) => setMeta(db, 'appState', s),
    },
    backup: {
      dump: () => Promise.all([
        db.books.toArray(), db.bookLemmas.toArray(), db.cards.toArray(), db.sessions.toArray(), db.reviewLog.toArray(),
        db.knownWords.toArray(), getMeta<VocabularyProfile | undefined>(db, 'profile', undefined),
        getMeta<LearnerStats>(db, 'stats', EMPTY_STATS), db.achievementUnlocks.toArray(), getMeta<Partial<Settings>>(db, 'settings', {}),
      ]).then(([books, bookLemmas, cards, sessions, reviewLog, known, profile, stats, unlocks, settings]) => ({
        books, bookLemmas, cards, sessions, reviewLog, knownWords: known.map((r) => r.lemma), profile, stats, unlocks,
        settings: { ...DEFAULT_SETTINGS, ...settings },
      })),
      replace: (b: BackupV1) =>
        getMeta<AppState>(db, 'appState', {}).then((appState) =>
          Promise.all(db.userTables.map((t) => t.clear())).then(() => Promise.all([
            db.books.bulkPut(b.books), db.bookLemmas.bulkPut(b.bookLemmas), db.cards.bulkPut(b.cards), db.sessions.bulkPut(b.sessions),
            db.reviewLog.bulkPut(b.reviewLog), db.knownWords.bulkPut(b.knownWords.map((lemma) => ({ lemma }))),
            db.achievementUnlocks.bulkPut(b.unlocks.map((x) => ({ ...x, tier: x.tier ?? 'gold' }))),
            b.profile ? setMeta(db, 'profile', b.profile) : undefined,
            setMeta(db, 'stats', b.stats), setMeta(db, 'settings', b.settings),
            setMeta(db, 'appState', { ...appState, lastBookId: undefined, lastRoute: undefined }),
          ]))).then(done),
    },
  };
}

/** One IndexedDB transaction over all stores (README §7.4). */
export class IdbUnitOfWork implements UnitOfWork {
  private readonly repos: Repositories;
  constructor(private readonly db: VocabDb) {
    this.repos = idbRepositories(db);
  }
  run<T>(work: (tx: Repositories) => Promise<T>): Promise<T> {
    return this.db.transaction('rw', this.db.tables, () => work(this.repos));
  }
}
