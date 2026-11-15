/** jMemorize-style Leitner scheduler (README §7.2). */
import { addDays, startOfDay } from './dates.ts';
import type { Card, Grade, SchedulerConfig } from './types.ts';

export const DEFAULT_SCHEDULER: SchedulerConfig = { baseIntervalDays: 1, factor: 2, maxLevel: 8, requeueGap: 5 };

export interface Scheduler {
  grade(card: Card, result: Grade, now: Date, cfg: SchedulerConfig): Card;
}

export function intervalDays(level: number, cfg: SchedulerConfig): number {
  return cfg.baseIntervalDays * cfg.factor ** (level - 1);
}

export function grade(card: Card, result: Grade, now: Date, cfg: SchedulerConfig): Card {
  if (result === 'known') {
    const level = Math.min(card.level + 1, cfg.maxLevel);
    const days = intervalDays(level, cfg);
    return { ...card, level, dueAt: addDays(startOfDay(now), days).toISOString() };
  }
  return { ...card, level: 0, dueAt: undefined };
}

export const leitner: Scheduler = { grade };
