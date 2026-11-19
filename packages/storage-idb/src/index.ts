/** IndexedDB adapters (Dexie) for the core repository ports (README §10). */
import Dexie, { type Table } from 'dexie';
import {
  DEFAULT_SETTINGS, EMPTY_STATS, migrateSettings,
  type AchievementUnlock, type AppState, type BackupV1, type Book, type BookLemma, type BookText, type Card, type ImportDraft,
  type LearnerStats, type ReadingPosition, type Repositories, type ReviewLogEntry, type Settings, type StudySession, type UnitOfWork,
  type VocabularyProfile,
} from '@vocabfirst/core';

/** a word-list row: translations into the target language (`tr`), a definition in the source language */
export type WordRow = { lemma: string; rank: number; pos: string[]; tr: string[]; def: string | null; flags: number;
  /** other parts of speech: [pos, tr, def] */
  senses?: [string, string[], string | null][] };
/** translations from a second dictionary (FreeDict for English → German) */
export type ExtraRow = { lemma: string; tr: string[] };
export type FormRow = { form: string; lemma: string; /** the form's only part of speech, if it has one */ pos?: string };
export type PackChunkRow = { packId: string; file: string; sha256: string; version: string };
type Meta = { key: string; value: unknown };
type Known = { lemma: string };

export class VocabDb extends Dexie {
  books!: Table<Book, string>;
  cards!: Table<Card, string>;
  bookLemmas!: Table<BookLemma, [string, string]>;
  importDrafts!: Table<ImportDraft, string>;
  sessions!: Table<StudySession, string>;
  reviewLog!: Table<ReviewLogEntry, number>;
  knownWords!: Table<Known, string>;
  achievementUnlocks!: Table<AchievementUnlock, [string, string]>;
  words!: Table<WordRow, string>;
  wordsExtra!: Table<ExtraRow, string>;
  forms!: Table<FormRow, string>;
  packChunks!: Table<PackChunkRow, [string, string]>;
  meta!: Table<Meta, string>;
  bookTexts!: Table<BookText, string>;
  readingPositions!: Table<ReadingPosition, string>;

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
    // Epic R: the reader's text and position, per book
    this.version(2).stores({ bookTexts: 'bookId', readingPositions: 'bookId' });
    // any language pair: translations are `tr`, not `de`; the second dictionary's table has a neutral name
    this.version(3).stores({ wordsExtra: 'lemma', wordsFreedict: null }).upgrade(async (tx) => {
      await tx.table('words').toCollection().modify((r: { de?: string[]; tr?: string[] }) => { r.tr = r.de ?? []; delete r.de; });
      const extra = (await tx.table('wordsFreedict').toArray()) as { lemma: string; de: string[] }[];
      await tx.table('wordsExtra').bulkPut(extra.map((r) => ({ lemma: r.lemma, tr: r.de })));
      const s = await tx.table('meta').get('settings');
      if (s) await tx.table('meta').put({ key: 'settings', value: migrateSettings(s.value) });
    });
  }
}

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

/**
 * Pending writes of one unit of work on one table. Reads see them (read-your-writes);
 * they reach IndexedDB only in the final commit.
 */
class Overlay<T, K> {
  readonly puts = new Map<string, T>();
  readonly dels = new Map<string, K>();
  cleared = false;
  constructor(readonly table: Table<T, K>, readonly keyOf: (row: T) => K) {}
  private k(key: K) { return JSON.stringify(key); }
  get dirty() { return this.cleared || this.puts.size > 0 || this.dels.size > 0; }

  put(rows: T[]) {
    for (const r of rows) {
      const k = this.k(this.keyOf(r));
      this.puts.set(k, clone(r));
      this.dels.delete(k);
    }
  }
  del(keys: K[]) {
    for (const key of keys) {
      const k = this.k(key);
      this.puts.delete(k);
      this.dels.set(k, key);
    }
  }
  clear() { this.cleared = true; this.puts.clear(); this.dels.clear(); }

  async get(key: K): Promise<T | undefined> {
    const k = this.k(key);
    if (this.puts.has(k)) return clone(this.puts.get(k));
    if (this.dels.has(k) || this.cleared) return undefined;
    return this.table.get(key as never);
  }
  async bulkGet(keys: K[]): Promise<(T | undefined)[]> {
    const fromDb = this.cleared ? keys.map(() => undefined) : await this.table.bulkGet(keys as never);
    return keys.map((key, i) => {
      const k = this.k(key);
      if (this.puts.has(k)) return clone(this.puts.get(k));
      if (this.dels.has(k)) return undefined;
      return fromDb[i];
    });
  }
  /** rows from IndexedDB matching a query, merged with pending writes matching `pred` */
  async query(fromDb: () => Promise<T[]>, pred: (row: T) => boolean): Promise<T[]> {
    const rows = this.cleared ? [] : await fromDb();
    const out = new Map<string, T>();
    for (const r of rows) {
      const k = this.k(this.keyOf(r));
      if (!this.dels.has(k) && !this.puts.has(k)) out.set(k, r);
    }
    for (const [k, r] of this.puts) if (pred(r)) out.set(k, clone(r));
    return [...out.values()];
  }
  /** schedule the writes inside the commit transaction (no awaits: stays inside the IDB transaction) */
  apply(): Promise<unknown> {
    const steps: Promise<unknown>[] = [];
    if (this.cleared) steps.push(this.table.clear());
    if (this.dels.size) steps.push(this.table.bulkDelete([...this.dels.values()] as never));
    if (this.puts.size) steps.push(this.table.bulkPut([...this.puts.values()]));
    return Promise.all(steps);
  }
}

function overlays(db: VocabDb) {
  return {
    books: new Overlay(db.books, (b) => b.id),
    cards: new Overlay(db.cards, (c) => c.id),
    bookLemmas: new Overlay(db.bookLemmas, (r) => [r.bookId, r.lemma] as [string, string]),
    drafts: new Overlay(db.importDrafts, (d) => d.id),
    sessions: new Overlay(db.sessions, (s) => s.id),
    reviewLog: new Overlay(db.reviewLog, (e) => e.seq!),
    knownWords: new Overlay(db.knownWords, (k) => k.lemma),
    unlocks: new Overlay(db.achievementUnlocks, (u) => [u.achievementId, u.tier ?? 'gold'] as [string, string]),
    meta: new Overlay(db.meta, (m) => m.key),
    bookTexts: new Overlay(db.bookTexts, (t) => t.bookId),
    positions: new Overlay(db.readingPositions, (p) => p.bookId),
  };
}
type Overlays = ReturnType<typeof overlays>;

function repositories(db: VocabDb, o: Overlays): Repositories {
  const getMeta = async <T>(key: string, fallback: T): Promise<T> => {
    const row = await o.meta.get(key);
    return row ? (clone(row.value) as T) : fallback;
  };
  const setMeta = async (key: string, value: unknown) => {
    if (value === undefined) o.meta.del([key]);
    else o.meta.put([{ key, value: clone(value) }]);
  };
  let nextSeq: number | undefined;

  return {
    books: {
      get: (id) => o.books.get(id),
      list: () => o.books.query(() => db.books.toArray(), () => true),
      save: async (b) => o.books.put([b]),
      delete: async (id) => {
        const cards = await o.cards.query(() => db.cards.where('bookId').equals(id).toArray(), (c) => c.bookId === id);
        o.cards.del(cards.map((c) => c.id));
        const rows = await o.bookLemmas.query(() => db.bookLemmas.where('bookId').equals(id).toArray(), (r) => r.bookId === id);
        o.bookLemmas.del(rows.map((r) => [r.bookId, r.lemma] as [string, string]));
        const sessions = await o.sessions.query(() => db.sessions.where('[bookId+state]').between([id, Dexie.minKey] as never, [id, Dexie.maxKey] as never, true, true).toArray(), (s) => s.bookId === id);
        o.sessions.del(sessions.map((s) => s.id));
        o.bookTexts.del([id]);
        o.positions.del([id]);
        o.books.del([id]);
      },
    },
    bookTexts: {
      get: (id) => o.bookTexts.get(id),
      save: async (t) => o.bookTexts.put([t]),
      getPosition: (id) => o.positions.get(id),
      savePosition: async (p) => o.positions.put([p]),
    },
    cards: {
      get: (id) => o.cards.get(id),
      listByBook: (bookId, f) => f?.status
        ? o.cards.query(() => db.cards.where('[bookId+status]').equals([bookId, f.status!]).toArray(), (c) => c.bookId === bookId && c.status === f.status)
        : o.cards.query(() => db.cards.where('bookId').equals(bookId).toArray(), (c) => c.bookId === bookId),
      listAll: () => o.cards.query(() => db.cards.toArray(), () => true),
      saveMany: async (cs) => o.cards.put(cs),
      deleteMany: async (ids) => o.cards.del(ids),
    },
    bookLemmas: {
      saveMany: async (rows) => o.bookLemmas.put(rows),
      get: (b, l) => o.bookLemmas.get([b, l]),
      listByBook: (b, kind) => kind
        ? o.bookLemmas.query(() => db.bookLemmas.where('[bookId+kind]').equals([b, kind]).toArray(), (r) => r.bookId === b && r.kind === kind)
        : o.bookLemmas.query(() => db.bookLemmas.where('bookId').equals(b).toArray(), (r) => r.bookId === b),
    },
    drafts: {
      get: (id) => o.drafts.get(id),
      save: async (d) => o.drafts.put([d]),
      delete: async (id) => o.drafts.del([id]),
    },
    sessions: {
      get: (id) => o.sessions.get(id),
      getActive: async (bookId) =>
        (await o.sessions.query(() => db.sessions.where('[bookId+state]').equals([bookId, 'active']).toArray(), (s) => s.bookId === bookId && s.state === 'active'))[0],
      save: async (s) => o.sessions.put([s]),
    },
    reviewLog: {
      append: async (e) => {
        if (nextSeq === undefined) {
          const last = o.reviewLog.cleared ? undefined : await db.reviewLog.orderBy(':id').last();
          nextSeq = Math.max(last?.seq ?? 0, ...[...o.reviewLog.puts.values()].map((x) => x.seq ?? 0)) + 1;
        }
        const seq = nextSeq++;
        o.reviewLog.put([{ ...e, seq }]);
        return seq;
      },
      remove: async (seq) => o.reviewLog.del([seq]),
      listSince: (since) => {
        const iso = since.toISOString();
        return o.reviewLog.query(() => db.reviewLog.where('at').aboveOrEqual(iso).toArray(), (e) => e.at >= iso);
      },
    },
    achievements: {
      getStats: () => getMeta<LearnerStats>('stats', EMPTY_STATS),
      saveStats: (s) => setMeta('stats', s),
      listUnlocks: () => o.unlocks.query(() => db.achievementUnlocks.toArray(), () => true),
      addUnlocks: async (u) => o.unlocks.put(u.map((x) => ({ ...x, tier: x.tier ?? 'gold' }))),
    },
    knownWords: {
      hasMany: async (ls) => new Set((await o.knownWords.bulkGet(ls)).filter((r): r is Known => !!r).map((r) => r.lemma)),
      addMany: async (ls) => o.knownWords.put(ls.map((lemma) => ({ lemma }))),
      remove: async (l) => o.knownWords.del([l]),
    },
    profile: {
      getProfile: () => getMeta<VocabularyProfile | undefined>('profile', undefined),
      saveProfile: (p) => setMeta('profile', p),
      getCalibration: () => getMeta('calibration', undefined),
      saveCalibration: (s) => setMeta('calibration', s),
    },
    settings: {
      get: async () => ({ ...DEFAULT_SETTINGS, ...migrateSettings(await getMeta<Partial<Settings>>('settings', {})) }),
      save: (s) => setMeta('settings', s),
    },
    appState: {
      get: () => getMeta<AppState>('appState', {}),
      save: (s) => setMeta('appState', s),
    },
    backup: {
      dump: async () => ({
        books: await o.books.query(() => db.books.toArray(), () => true),
        bookLemmas: await o.bookLemmas.query(() => db.bookLemmas.toArray(), () => true),
        cards: await o.cards.query(() => db.cards.toArray(), () => true),
        sessions: await o.sessions.query(() => db.sessions.toArray(), () => true),
        reviewLog: await o.reviewLog.query(() => db.reviewLog.toArray(), () => true),
        knownWords: (await o.knownWords.query(() => db.knownWords.toArray(), () => true)).map((r) => r.lemma),
        profile: await getMeta<VocabularyProfile | undefined>('profile', undefined),
        stats: await getMeta<LearnerStats>('stats', EMPTY_STATS),
        unlocks: await o.unlocks.query(() => db.achievementUnlocks.toArray(), () => true),
        settings: { ...DEFAULT_SETTINGS, ...migrateSettings(await getMeta<Partial<Settings>>('settings', {})) },
      }),
      replace: async (b: BackupV1) => {
        const appState = await getMeta<AppState>('appState', {});
        // the reader's text is not in backups (size): kept for the books the backup brings back
        const ids = new Set(b.books.map((x) => x.id));
        const texts = (await o.bookTexts.query(() => db.bookTexts.toArray(), () => true)).filter((t) => ids.has(t.bookId));
        const positions = (await o.positions.query(() => db.readingPositions.toArray(), () => true)).filter((p) => ids.has(p.bookId));
        // the installed word lists belong to the device, not to the backup
        const packs = await o.meta.get('packs');
        for (const ov of Object.values(o)) ov.clear();
        if (packs) o.meta.put([packs]);
        o.bookTexts.put(texts);
        o.positions.put(positions);
        o.books.put(b.books);
        o.bookLemmas.put(b.bookLemmas);
        o.cards.put(b.cards);
        o.sessions.put(b.sessions);
        o.reviewLog.put(b.reviewLog.map((e, i) => ({ ...e, seq: e.seq ?? i + 1 })));
        o.knownWords.put(b.knownWords.map((lemma) => ({ lemma })));
        o.unlocks.put(b.unlocks.map((x) => ({ ...x, tier: x.tier ?? 'gold' })));
        if (b.profile) await setMeta('profile', b.profile);
        await setMeta('stats', b.stats);
        await setMeta('settings', { ...DEFAULT_SETTINGS, ...migrateSettings(b.settings) });
        await setMeta('appState', { ...appState, lastBookId: undefined, lastRoute: undefined });
      },
    },
  };
}

/**
 * Atomic unit of work (README §7.4). Reads go to IndexedDB through a write overlay; all writes
 * are committed at the end in one IndexedDB transaction, created and filled synchronously.
 * This does not depend on keeping an IndexedDB transaction alive across `await`s, which
 * native async functions cannot do reliably (WebKit). Units of work run one at a time.
 */
export class IdbUnitOfWork implements UnitOfWork {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private readonly db: VocabDb) {}

  run<T>(work: (tx: Repositories) => Promise<T>): Promise<T> {
    const next = this.chain.then(async () => {
      const o = overlays(this.db);
      const result = await work(repositories(this.db, o));
      const dirty = Object.values(o).filter((x) => x.dirty);
      if (dirty.length) {
        await this.db.transaction('rw', dirty.map((x) => x.table), () => Promise.all(dirty.map((x) => x.apply())));
      }
      return result;
    });
    this.chain = next.catch(() => undefined);
    return next;
  }
}
