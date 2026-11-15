/** CalibrationService (README §7.8, Epic H). */
import { fit, shuffle } from '../domain/calibration.ts';
import { DEFAULT_CUTOFF, LEVELS, startLevel } from '../domain/levels.ts';
import type { CalibrationItem, CalibrationSession, VocabularyProfile } from '../domain/types.ts';
import type { Random, WordList } from '../ports/index.ts';
import type { Ctx } from './context.ts';

export const STAGE1_PER_LEVEL = 2;
export const STAGE2_LEVELS = 4;
export const STAGE2_PER_LEVEL = 10;
export const TOTAL = LEVELS.length * STAGE1_PER_LEVEL + STAGE2_LEVELS * STAGE2_PER_LEVEL;

export interface CalibrationView {
  word?: { lemma: string; de: string[]; level: number };
  position: number;
  total: number;
  stage: 1 | 2;
  result?: { cutoffRank: number; level: number; r50?: number; k?: number };
}

const acceptable = (lemma: string) => /^[a-z]+$/.test(lemma) && lemma.length >= 4;

export async function sampleLevel(wordList: WordList, random: Random, level: number, count: number, taken: Set<string>): Promise<CalibrationItem[]> {
  const l = LEVELS[level - 1];
  const out: CalibrationItem[] = [];
  for (let draws = 0; draws < 200 && out.length < count; draws++) {
    const rank = l.from + Math.floor(random.next() * (l.to - l.from + 1));
    const e = await wordList.firstAtOrAfter(rank, l.to);
    if (!e || !acceptable(e.lemma) || !e.de.length || e.cognate || taken.has(e.lemma)) continue;
    taken.add(e.lemma);
    out.push({ lemma: e.lemma, rank: e.rank, level, de: e.de.slice(0, 3) });
  }
  return out;
}

/** Stage 2: the 4 levels whose geometric midpoint is closest to r50. */
export function nearestLevels(r50: number, n = STAGE2_LEVELS): number[] {
  return [...LEVELS]
    .map((l) => ({ level: l.level, d: Math.abs(Math.log(Math.sqrt(l.from * l.to)) - Math.log(r50)) }))
    .sort((a, b) => a.d - b.d || a.level - b.level)
    .slice(0, n)
    .map((x) => x.level)
    .sort((a, b) => a - b);
}

export function calibrationService(ctx: Ctx) {
  const view = (s: CalibrationSession, result?: CalibrationView['result']): CalibrationView => {
    const it = s.items[s.position];
    return { word: it && !result ? { lemma: it.lemma, de: it.de, level: it.level } : undefined,
      position: s.position, total: TOTAL, stage: s.stage, result };
  };

  async function stage1(): Promise<CalibrationSession> {
    const taken = new Set<string>();
    const items: CalibrationItem[] = [];
    for (const l of LEVELS) items.push(...(await sampleLevel(ctx.wordList, ctx.random, l.level, STAGE1_PER_LEVEL, taken)));
    return { items: shuffle(items, () => ctx.random.next()), position: 0, stage: 1 };
  }

  const resultOf = (p: VocabularyProfile) => ({ cutoffRank: p.cutoffRank, level: startLevel(p.cutoffRank), r50: p.r50, k: p.k });

  return {
    startOrResume: () =>
      ctx.uow.run(async (tx) => {
        let s = await tx.profile.getCalibration();
        if (!s) {
          s = await stage1();
          await tx.profile.saveCalibration(s);
        }
        return view(s);
      }),

    restart: () =>
      ctx.uow.run(async (tx) => {
        const s = await stage1();
        await tx.profile.saveCalibration(s);
        return view(s);
      }),

    answer: (known: boolean) =>
      ctx.uow.run(async (tx) => {
        const s = await tx.profile.getCalibration();
        if (!s) throw new Error('No vocabulary check in progress');
        if (s.items[s.position]) s.items[s.position].known = known;
        s.position++;
        const answered = s.items.filter((i) => i.known !== undefined).map((i) => ({ rank: i.rank, known: !!i.known }));
        if (s.stage === 1 && s.position >= s.items.length) {
          const f = fit(answered);
          const taken = new Set(s.items.map((i) => i.lemma));
          const more: CalibrationItem[] = [];
          for (const level of nearestLevels(f.r50)) more.push(...(await sampleLevel(ctx.wordList, ctx.random, level, STAGE2_PER_LEVEL, taken)));
          s.items.push(...shuffle(more, () => ctx.random.next()));
          s.stage = 2;
        }
        if (s.position >= s.items.length) {
          const f = fit(answered);
          const profile: VocabularyProfile = { cutoffRank: f.cutoffRank, r50: f.r50, k: f.k, source: 'calibration', updatedAt: ctx.clock.now().toISOString() };
          await tx.profile.saveProfile(profile);
          await tx.profile.saveCalibration(undefined);
          return view(s, resultOf(profile));
        }
        await tx.profile.saveCalibration(s);
        return view(s);
      }),

    skip: () =>
      ctx.uow.run(async (tx) => {
        const p: VocabularyProfile = { cutoffRank: DEFAULT_CUTOFF, source: 'default', updatedAt: ctx.clock.now().toISOString() };
        await tx.profile.saveProfile(p);
        await tx.profile.saveCalibration(undefined);
        return p;
      }),

    profile: () => ctx.uow.run((tx) => tx.profile.getProfile()),

    setCutoff: (rank: number) =>
      ctx.uow.run(async (tx) => {
        const cutoffRank = Math.round(Math.min(Math.max(rank, 2000), 60000) / 100) * 100;
        const prev = await tx.profile.getProfile();
        const p: VocabularyProfile = { ...prev, cutoffRank, source: 'manual', updatedAt: ctx.clock.now().toISOString() };
        await tx.profile.saveProfile(p);
        return p;
      }),
  };
}
