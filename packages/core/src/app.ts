/** createApp(ports) → the Application API the UI calls (README §4.2). */
import { ACHIEVEMENTS, bookAchievement, metricValue } from './domain/achievements.ts';
import { addDays, dayKey, startOfDay } from './domain/dates.ts';
import { isValidTemplate } from './domain/lookup.ts';
import { clampSettings } from './domain/settings.ts';
import type { AchievementUnlock, AppState, BackupV1, Settings, Tier } from './domain/types.ts';
import type { Ports } from './ports/index.ts';
import { calibrationService } from './services/calibrationService.ts';
import { cardService } from './services/cardService.ts';
import { bookOverview, listsSignature } from './services/context.ts';
import { importService } from './services/importService.ts';
import { computeBookProgress, dailyStats, loadBookProgress, streaks } from './services/progressService.ts';
import { readerService } from './services/readerService.ts';
import { studyService } from './services/studyService.ts';

export interface AchievementView {
  id: string; name: string; description: string; bookId?: string; coverDataUrl?: string;
  value: number;
  tiers: { tier: Tier; threshold: number; unlockedAt?: string }[];
  next?: { tier: Tier; threshold: number };
}

export function createApp(ports: Ports) {
  const { uow, clock } = ports;
  const imports = importService(ports);
  const calibration = calibrationService(ports);

  return {
    wordLists: {
      /** remote: false = only what is installed, without asking the server (start-up) */
      status: (opts?: { remote?: boolean }) => ports.packs.status(opts),
      install: (onProgress: (p: { loaded: number; total: number; phase: string }) => void) => ports.packs.install(onProgress),
      info: () => ports.wordList.info(),
    },
    calibration,
    books: {
      analyse: imports.analyse,
      preview: imports.preview,
      confirm: imports.confirm,
      discard: imports.discard,
      reapplyFilter: imports.reapplyFilter,
      updateFromLists: imports.updateFromLists,
      list: () =>
        uow.run(async (tx) => {
          const [books, settings] = await Promise.all([tx.books.list(), tx.settings.get()]);
          const now = clock.now();
          return Promise.all(books.sort((a, c) => c.importedAt.localeCompare(a.importedAt)).map(async (b) => {
            const [cards, lemmas] = await Promise.all([tx.cards.listByBook(b.id), tx.bookLemmas.listByBook(b.id, 'unlisted')]);
            return bookOverview(b, computeBookProgress(b, cards, lemmas, settings, now));
          }));
        }),
      get: (id: string) =>
        uow.run(async (tx) => {
          const b = await tx.books.get(id);
          if (!b) throw new Error('Book not found');
          return bookOverview(b, await loadBookProgress(tx, id, clock.now()));
        }),
      /** the book screen: overview and progress from one computation */
      page: (id: string) =>
        uow.run(async (tx) => {
          const b = await tx.books.get(id);
          if (!b) throw new Error('Book not found');
          const [progress, packs, hasText] = await Promise.all([loadBookProgress(tx, id, clock.now()), ports.wordList.info(), tx.bookTexts.has(id)]);
          // the word lists changed since the book was read: it can be updated (from its stored text)
          const listsChanged = hasText && packs.length > 0 && b.wordLists !== listsSignature(packs);
          return { book: bookOverview(b, progress), progress, listsChanged };
        }),
      chapters: (id: string) => uow.run(async (tx) => (await loadBookProgress(tx, id, clock.now())).chapters),
      delete: (id: string) =>
        uow.run(async (tx) => {
          await tx.books.delete(id);
          const s = await tx.appState.get();
          if (s.lastBookId === id) await tx.appState.save({ ...s, lastBookId: undefined });
        }),
    },
    study: studyService(ports),
    reader: readerService(ports),
    cards: cardService(ports),
    progress: {
      book: (id: string) => uow.run((tx) => loadBookProgress(tx, id, clock.now())),
      daily: (days = 30) =>
        uow.run(async (tx) => {
          const now = clock.now();
          const all = await tx.reviewLog.listSince(new Date(0));
          const byDay = dailyStats(all);
          const s = streaks(new Set(byDay.keys()), now);
          const settings = await tx.settings.get();
          const out = [];
          for (let i = days - 1; i >= 0; i--) {
            const k = dayKey(addDays(startOfDay(now), -i));
            out.push(byDay.get(k) ?? { day: k, reviews: 0, correct: 0 });
          }
          return { days: out, streakDays: s.current, longestStreak: s.longest, reviewsToday: byDay.get(dayKey(now))?.reviews ?? 0, dailyGoal: settings.dailyGoal };
        }),
    },
    achievements: {
      list: () =>
        uow.run(async (tx): Promise<AchievementView[]> => {
          const [stats, unlocks, books] = await Promise.all([tx.achievements.getStats(), tx.achievements.listUnlocks(), tx.books.list()]);
          const byKey = new Map(unlocks.map((u: AchievementUnlock) => [`${u.achievementId}|${u.tier ?? ''}`, u]));
          const defs = [...ACHIEVEMENTS, ...books.map(bookAchievement)];
          return defs.map((d) => {
            const value = metricValue(d, stats);
            const tiers = d.tiers.map((t) => ({ ...t, unlockedAt: byKey.get(`${d.id}|${t.tier}`)?.unlockedAt }));
            const book = d.bookId ? books.find((b) => b.id === d.bookId) : undefined;
            return { id: d.id, name: d.name, description: d.description, bookId: d.bookId, coverDataUrl: book?.coverDataUrl,
              value, tiers, next: tiers.find((t) => !t.unlockedAt) };
          });
        }),
    },
    settings: {
      get: () => uow.run((tx) => tx.settings.get()),
      update: (patch: Partial<Settings>) =>
        uow.run(async (tx) => {
          const cur = await tx.settings.get();
          if (patch.lookupProviders?.some((p) => !isValidTemplate(p.urlTemplate))) throw new Error('Lookup links must be https and contain {word}');
          const next = clampSettings({ ...cur, ...patch, scheduler: { ...cur.scheduler, ...patch.scheduler } });
          await tx.settings.save(next);
          return next;
        }),
    },
    appState: {
      get: () => uow.run((tx) => tx.appState.get()),
      update: (patch: Partial<AppState>) =>
        uow.run(async (tx) => {
          const next = { ...(await tx.appState.get()), ...patch };
          await tx.appState.save(next);
          return next;
        }),
    },
    backup: {
      export: () =>
        uow.run(async (tx): Promise<BackupV1> => {
          const data = await tx.backup.dump();
          const exportedAt = clock.now().toISOString();
          await tx.appState.save({ ...(await tx.appState.get()), lastExportAt: exportedAt });
          return { format: 'chapterzero-backup', version: 1, exportedAt, ...data };
        }),
      import: (data: BackupV1) =>
        uow.run(async (tx) => {
          // backups made before the rename (VocabFirst) restore too
          if (!['chapterzero-backup', 'vocabfirst-backup'].includes(data?.format) || data.version !== 1) throw new Error('Not a Chapter 0 backup file');
          await tx.backup.replace(data);
        }),
    },
  };
}

export type VocabApp = ReturnType<typeof createApp>;
