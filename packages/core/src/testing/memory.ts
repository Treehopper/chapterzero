/** In-memory implementations of all ports (tests, and a reference for the adapters). */
import { deepClone as clone } from '../domain/clone.ts';
import { DEFAULT_SETTINGS, EMPTY_STATS } from '../domain/settings.ts';
import type {
  AchievementUnlock, AppState, BackupV1, Book, BookLemma, BookText, CalibrationSession, Card, EpubContent, ImportDraft,
  LearnerStats, PackStatus, ReadingPosition, ReviewLogEntry, Settings, StudySession, VocabularyProfile, WordEntry,
} from '../domain/types.ts';
import type { Clock, EpubReader, IdGenerator, PackInstaller, Ports, Random, Repositories, UnitOfWork, WordList } from '../ports/index.ts';

interface Data {
  books: Map<string, Book>;
  cards: Map<string, Card>;
  lemmas: Map<string, BookLemma>;
  drafts: Map<string, ImportDraft>;
  sessions: Map<string, StudySession>;
  texts: Map<string, BookText>;
  positions: Map<string, ReadingPosition>;
  log: ReviewLogEntry[];
  seq: number;
  stats: LearnerStats;
  unlocks: AchievementUnlock[];
  known: Set<string>;
  profile?: VocabularyProfile;
  calibration?: CalibrationSession;
  settings: Settings;
  appState: AppState;
}


function emptyData(): Data {
  return { books: new Map(), cards: new Map(), lemmas: new Map(), drafts: new Map(), sessions: new Map(), texts: new Map(), positions: new Map(), log: [], seq: 0,
    stats: clone(EMPTY_STATS), unlocks: [], known: new Set(), settings: clone(DEFAULT_SETTINGS), appState: {} };
}

function repos(d: Data): Repositories {
  return {
    books: {
      get: async (id) => clone(d.books.get(id)),
      list: async () => [...d.books.values()].map(clone),
      save: async (b) => void d.books.set(b.id, clone(b)),
      delete: async (id) => {
        d.books.delete(id);
        for (const [k, c] of d.cards) if (c.bookId === id) d.cards.delete(k);
        for (const [k, l] of d.lemmas) if (l.bookId === id) d.lemmas.delete(k);
        for (const [k, s] of d.sessions) if (s.bookId === id) d.sessions.delete(k);
        d.texts.delete(id);
        d.positions.delete(id);
      },
    },
    bookTexts: {
      get: async (id) => clone(d.texts.get(id)),
      save: async (t) => void d.texts.set(t.bookId, clone(t)),
      getPosition: async (id) => clone(d.positions.get(id)),
      savePosition: async (p) => void d.positions.set(p.bookId, clone(p)),
    },
    cards: {
      get: async (id) => clone(d.cards.get(id)),
      listByBook: async (bookId, f) => [...d.cards.values()].filter((c) => c.bookId === bookId && (!f?.status || c.status === f.status)).map(clone),
      listAll: async () => [...d.cards.values()].map(clone),
      saveMany: async (cs) => { for (const c of cs) d.cards.set(c.id, clone(c)); },
      deleteMany: async (ids) => { for (const id of ids) d.cards.delete(id); },
    },
    bookLemmas: {
      saveMany: async (rows) => { for (const r of rows) d.lemmas.set(`${r.bookId}|${r.lemma}`, clone(r)); },
      get: async (b, l) => clone(d.lemmas.get(`${b}|${l}`)),
      listByBook: async (b, kind) => [...d.lemmas.values()].filter((r) => r.bookId === b && (!kind || r.kind === kind)).map(clone),
    },
    drafts: {
      get: async (id) => clone(d.drafts.get(id)),
      save: async (x) => void d.drafts.set(x.id, clone(x)),
      delete: async (id) => void d.drafts.delete(id),
    },
    sessions: {
      get: async (id) => clone(d.sessions.get(id)),
      getActive: async (bookId) => clone([...d.sessions.values()].find((s) => s.bookId === bookId && s.state === 'active')),
      save: async (s) => void d.sessions.set(s.id, clone(s)),
    },
    reviewLog: {
      append: async (e) => { const seq = ++d.seq; d.log.push({ ...clone(e), seq }); return seq; },
      remove: async (seq) => { d.log = d.log.filter((e) => e.seq !== seq); },
      listSince: async (since) => d.log.filter((e) => new Date(e.at) >= since).map(clone),
    },
    achievements: {
      getStats: async () => clone(d.stats),
      saveStats: async (s) => { d.stats = clone(s); },
      listUnlocks: async () => d.unlocks.map(clone),
      addUnlocks: async (u) => { d.unlocks.push(...clone(u)); },
    },
    knownWords: {
      hasMany: async (ls) => new Set(ls.filter((l) => d.known.has(l))),
      addMany: async (ls) => { for (const l of ls) d.known.add(l); },
      remove: async (l) => void d.known.delete(l),
    },
    profile: {
      getProfile: async () => clone(d.profile),
      saveProfile: async (p) => { d.profile = clone(p); },
      getCalibration: async () => clone(d.calibration),
      saveCalibration: async (s) => { d.calibration = clone(s); },
    },
    settings: { get: async () => clone(d.settings), save: async (s) => { d.settings = clone(s); } },
    appState: { get: async () => clone(d.appState), save: async (s) => { d.appState = clone(s); } },
    backup: {
      dump: async () => ({
        books: [...d.books.values()].map(clone), bookLemmas: [...d.lemmas.values()].map(clone), cards: [...d.cards.values()].map(clone),
        sessions: [...d.sessions.values()].map(clone), reviewLog: d.log.map(clone), knownWords: [...d.known],
        profile: clone(d.profile), stats: clone(d.stats), unlocks: d.unlocks.map(clone), settings: clone(d.settings),
      }),
      replace: async (b: BackupV1) => {
        const fresh = emptyData();
        // the reader's text is not in backups (size): kept for the books the backup brings back
        const ids = new Set(b.books.map((x) => x.id));
        const keep = <T,>(m: Map<string, T>) => new Map([...m].filter(([k]) => ids.has(k)));
        Object.assign(d, fresh, {
          texts: keep(d.texts), positions: keep(d.positions),
          books: new Map(b.books.map((x) => [x.id, clone(x)])), cards: new Map(b.cards.map((x) => [x.id, clone(x)])),
          lemmas: new Map(b.bookLemmas.map((x) => [`${x.bookId}|${x.lemma}`, clone(x)])),
          sessions: new Map(b.sessions.map((x) => [x.id, clone(x)])), log: clone(b.reviewLog),
          seq: Math.max(0, ...b.reviewLog.map((e) => e.seq ?? 0)), known: new Set(b.knownWords), profile: clone(b.profile),
          stats: clone(b.stats), unlocks: clone(b.unlocks), settings: { ...clone(DEFAULT_SETTINGS), ...clone(b.settings) },
        });
      },
    },
  };
}

/** Transactions: work on a copy, swap it in on success; serialised like IndexedDB rw transactions. */
export class MemoryUnitOfWork implements UnitOfWork {
  data = emptyData();
  private chain: Promise<unknown> = Promise.resolve();
  /** test hook: throw after the work ran, before commit */
  failNextCommit = false;

  run<T>(work: (tx: Repositories) => Promise<T>): Promise<T> {
    const next = this.chain.then(async () => {
      const copy = cloneData(this.data);
      const result = await work(repos(copy));
      if (this.failNextCommit) { this.failNextCommit = false; throw new Error('simulated crash before commit'); }
      this.data = copy;
      return result;
    });
    this.chain = next.catch(() => undefined);
    return next;
  }
}

function cloneData(d: Data): Data {
  const maps = <K, V>(m: Map<K, V>) => new Map([...m].map(([k, v]) => [k, clone(v)] as [K, V]));
  return { ...clone({ ...d, books: undefined, cards: undefined, lemmas: undefined, drafts: undefined, sessions: undefined, texts: undefined, positions: undefined, known: undefined }),
    books: maps(d.books), cards: maps(d.cards), lemmas: maps(d.lemmas), drafts: maps(d.drafts), sessions: maps(d.sessions),
    texts: maps(d.texts), positions: maps(d.positions),
    known: new Set(d.known) } as Data;
}

export class FixedClock implements Clock {
  constructor(public current: Date) {}
  now() { return new Date(this.current); }
  advanceDays(n: number) { this.current = new Date(this.current.getTime() + n * 86_400_000); }
  advanceMs(n: number) { this.current = new Date(this.current.getTime() + n); }
}

export class SeqIds implements IdGenerator {
  private n = 0;
  constructor(private prefix = 'id') {}
  next() { return `${this.prefix}${++this.n}`; }
}

/** mulberry32 */
export class SeededRandom implements Random {
  constructor(private seed = 42) {}
  next() {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export class MemoryWordList implements WordList {
  readonly words = new Map<string, WordEntry>();
  readonly forms = new Map<string, string>();
  readonly posOf = new Map<string, string>();
  constructor(words: WordEntry[], forms: ([string, string] | [string, string, string?])[]) {
    for (const w of words) this.words.set(w.lemma, w);
    for (const [f, l, p] of forms) { this.forms.set(f, l); if (p) this.posOf.set(f, p); }
  }
  async info() { return []; }
  async resolve(tokens: string[]) {
    const out = new Map<string, string>();
    for (const t of tokens) {
      const f = this.forms.get(t);
      if (f !== undefined) out.set(t, f);
      else if (this.words.has(t)) out.set(t, t);
    }
    return out;
  }
  async formPos(forms: string[]) {
    return new Map(forms.flatMap((f) => (this.posOf.has(f) ? [[f, this.posOf.get(f)!] as [string, string]] : [])));
  }
  async entries(lemmas: string[]) {
    const out = new Map<string, WordEntry>();
    for (const l of lemmas) { const e = this.words.get(l); if (e) out.set(l, clone(e)); }
    return out;
  }
  async firstAtOrAfter(rank: number, maxRank: number) {
    let best: WordEntry | undefined;
    for (const w of this.words.values()) if (w.rank >= rank && w.rank <= maxRank && (!best || w.rank < best.rank)) best = w;
    return best && clone(best);
  }
}

export class MemoryEpubReader implements EpubReader {
  constructor(private content: EpubContent | ((b: ArrayBuffer) => EpubContent)) {}
  async read(b: ArrayBuffer) { return typeof this.content === 'function' ? this.content(b) : clone(this.content); }
}

export class FakePacks implements PackInstaller {
  installed = true;
  async status(): Promise<PackStatus> { return { installed: this.installed, packs: [], updateAvailable: false }; }
  async install(onProgress: (p: { loaded: number; total: number; phase: string }) => void) { onProgress({ loaded: 1, total: 1, phase: 'done' }); this.installed = true; }
}

export function memoryPorts(opts: { wordList: WordList; epub?: EpubReader; now?: Date; seed?: number }): Ports & { uow: MemoryUnitOfWork; clock: FixedClock } {
  return {
    uow: new MemoryUnitOfWork(), wordList: opts.wordList, packs: new FakePacks(),
    epub: opts.epub ?? new MemoryEpubReader({ meta: { title: 'Empty' }, toc: [], sections: [] }),
    clock: new FixedClock(opts.now ?? new Date('2026-03-02T09:00:00Z')), ids: new SeqIds(), random: new SeededRandom(opts.seed ?? 42),
  };
}
