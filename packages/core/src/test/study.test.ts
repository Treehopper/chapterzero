import { describe, expect, it } from 'vitest';
import { chapterCoverage } from '../domain/coverage.ts';
import type { Card } from '../domain/types.ts';
import { buf, filler, setup, twoChapterBook } from './helpers.ts';

async function imported(book = twoChapterBook(), now?: Date) {
  const s = setup(book, { now });
  const p = await s.app.books.analyse(buf);
  const b = await s.app.books.confirm(p.draftId, { includedChapters: p.includedChapters, cutoffRank: 2000 });
  const cards = () => s.ports.uow.run((tx) => tx.cards.listByBook(b.id));
  return { ...s, book: b, cards };
}

describe('session queue and grading', () => {
  it('starts with new cards of the learning chapter in order of first occurrence', async () => {
    const { app, book } = await imported();
    const v = await app.study.resumeOrStart(book.id);
    expect(v.card?.lemma).toBe('relinquish');
    expect(v.phase).toBe('front');
    expect(v.firstCard).toBe(true);
    const order: string[] = [];
    let cur = v;
    while (!cur.done) {
      order.push(cur.card!.lemma);
      await app.study.flip(cur.sessionId);
      cur = await app.study.grade(cur.sessionId, 'known');
    }
    // chapter One in order of first occurrence, then chapter Two
    expect(order).toEqual(['relinquish', 'lantern', 'scythe', 'gaunt', 'quill', 'parchment', 'dagger', 'hearth',
      'tempest', 'ravine', 'dusk', 'rampart', 'thicket', 'bough', 'ashen', 'gale']);
  });

  it('requires a flip, then retires first-sight known cards (C18) and undo reverses it', async () => {
    const { app, book, ports, cards } = await imported();
    const v0 = await app.study.resumeOrStart(book.id);
    await expect(app.study.grade(v0.sessionId, 'known')).rejects.toThrow(/Flip/);
    await app.study.flip(v0.sessionId);
    const total = v0.progress.total;
    const v1 = await app.study.grade(v0.sessionId, 'known');
    expect(v1.retired).toBe(true);
    expect(v1.counters).toMatchObject({ alreadyKnown: 1, reviewed: 0, correct: 0 });
    expect(v1.undoKind).toBe('retire');
    expect(v1.card?.lemma).not.toBe('relinquish');
    expect((await cards()).find((c) => c.lemma === 'relinquish')?.status).toBe('known');
    expect(await ports.uow.run((tx) => tx.knownWords.hasMany(['relinquish']))).toEqual(new Set(['relinquish']));
    const stats = await ports.uow.run((tx) => tx.achievements.getStats());
    expect(stats).toMatchObject({ correctStreak: 0, totalCorrect: 0 });
    expect(await ports.uow.run((tx) => tx.reviewLog.listSince(new Date(0)))).toHaveLength(0);
    expect(v1.progress.total).toBe(total); // a retired card is replaced... only if more unseen cards exist

    const u = await app.study.undo(v0.sessionId);
    expect(u.card?.lemma).toBe('relinquish');
    expect(u.phase).toBe('back');
    expect(u.counters.alreadyKnown).toBe(0);
    expect((await cards()).find((c) => c.lemma === 'relinquish')?.status).toBe('active');
    expect(await ports.uow.run((tx) => tx.knownWords.hasMany(['relinquish']))).toEqual(new Set());
  });

  it('wrong answers after a flip move on, come back after the gap, and schedule normally', async () => {
    const { app, book, cards, ports } = await imported();
    const v0 = await app.study.resumeOrStart(book.id);
    const b = await app.study.flip(v0.sessionId);
    expect(b.lookupLinks.map((l) => l.name)).toContain('Wiktionary');  // links on every back
    expect(v0.lookupLinks).toEqual([]);
    const again = await app.study.grade(v0.sessionId, 'unknown');
    expect(again.phase).toBe('front');
    expect(again.counters).toMatchObject({ reviewed: 1, wrong: 1 });
    expect(again.card?.lemma).not.toBe('relinquish');
    // walk until relinquish comes back
    let v = again;
    let seenBack = false;
    for (let i = 0; i < 20 && !v.done; i++) {
      if (v.card?.lemma === 'relinquish') { seenBack = true; break; }
      await app.study.flip(v.sessionId);
      v = await app.study.grade(v.sessionId, 'known'); // other cards retire at first sight
    }
    expect(seenBack).toBe(true);
    await app.study.flip(v.sessionId);
    const ok = await app.study.grade(v.sessionId, 'known');
    expect(ok.retired).toBe(false);
    const r = (await cards()).find((c) => c.lemma === 'relinquish')!;
    expect(r).toMatchObject({ level: 1, status: 'active' });
    expect(r.stats).toMatchObject({ correct: 1, wrong: 1, failStreak: 0 });
    const stats = await ports.uow.run((tx) => tx.achievements.getStats());
    expect(stats).toMatchObject({ correctStreak: 1, totalCorrect: 1 });
  });

  it('a wrong swipe on the front shows the back once, with links; swipes there never grade again', async () => {
    const { app, book } = await imported();
    await app.settings.update({ requireFlipBeforeGrade: false });
    const v0 = await app.study.resumeOrStart(book.id);
    const w = await app.study.grade(v0.sessionId, 'unknown');
    expect(w.phase).toBe('wrongReview');
    expect(w.card?.lemma).toBe(v0.card?.lemma);
    expect(w.lookupLinks.map((l) => l.name)).toContain('Wiktionary');
    const next = await app.study.grade(v0.sessionId, 'unknown');
    expect(next.counters.wrong).toBe(1);
    expect(next.phase).toBe('front');
  });

  it('resumes exactly where it was (C5): same card, same side, same counters', async () => {
    const { app, book } = await imported();
    const v0 = await app.study.resumeOrStart(book.id);
    await app.study.flip(v0.sessionId);
    await app.study.grade(v0.sessionId, 'unknown');
    const before = await app.study.continueAfterReview(v0.sessionId);
    await app.study.flip(v0.sessionId);
    const resumed = await app.study.resumeOrStart(book.id);
    expect(resumed.sessionId).toBe(v0.sessionId);
    expect(resumed.card?.id).toBe(before.card?.id);
    expect(resumed.phase).toBe('back');
    expect(resumed.counters).toEqual(before.counters);
  });

  it('a crash before commit leaves the previous consistent state', async () => {
    const { app, book, ports, cards } = await imported();
    const v0 = await app.study.resumeOrStart(book.id);
    await app.study.flip(v0.sessionId);
    const snapshot = JSON.stringify(ports.uow.data.cards.get(`${book.id}:relinquish`));
    ports.uow.failNextCommit = true;
    await expect(app.study.grade(v0.sessionId, 'unknown')).rejects.toThrow(/crash/);
    expect(JSON.stringify((await cards()).find((c) => c.lemma === 'relinquish'))).toBe(snapshot);
    const v = await app.study.resumeOrStart(book.id);
    expect(v).toMatchObject({ phase: 'back', counters: { reviewed: 0 } });
    expect(v.card?.lemma).toBe('relinquish');
  });

  it('edit and remove the current card (C13), with undo', async () => {
    const { app, book, cards } = await imported();
    const v0 = await app.study.resumeOrStart(book.id);
    await app.study.flip(v0.sessionId);
    const e = await app.study.editCurrent(v0.sessionId, ['aufgeben', ' aufgeben ', 'verzichten']);
    expect(e.card).toMatchObject({ lemma: 'relinquish', translations: ['aufgeben', 'verzichten'] });
    expect(e.phase).toBe('back');
    const r = await app.study.removeCurrent(v0.sessionId, 'removed');
    expect(r.card?.lemma).not.toBe('relinquish');
    expect(r.phase).toBe('front');
    expect((await cards()).find((c) => c.lemma === 'relinquish')?.status).toBe('removed');
    const u = await app.study.undo(v0.sessionId);
    expect(u.card?.lemma).toBe('relinquish');
    expect((await cards()).find((c) => c.lemma === 'relinquish')).toMatchObject({ status: 'active', edited: true });
  });

  it('daily new-card limit; retired cards do not use it up', async () => {
    const { app, book, ports } = await imported();
    await app.settings.update({ dailyNewLimit: 2 });
    const v0 = await app.study.resumeOrStart(book.id);
    expect(v0.progress.total).toBe(2);
    await app.study.flip(v0.sessionId);
    const v1 = await app.study.grade(v0.sessionId, 'known'); // retire → refill
    expect(v1.progress.total).toBe(3);
    await app.study.flip(v0.sessionId);
    await app.study.grade(v0.sessionId, 'unknown');
    await app.study.continueAfterReview(v0.sessionId);
    const stats = await app.study.finish(v0.sessionId);
    expect(stats.session).toMatchObject({ reviewed: 1, alreadyKnown: 1 });
    // next session today: one card was introduced, so only one new card
    const v2 = await app.study.resumeOrStart(book.id);
    const s = await ports.uow.run((tx) => tx.sessions.get(v2.sessionId));
    const all = await ports.uow.run((tx) => tx.cards.listByBook(book.id));
    const fresh = [s!.current!.cardId, ...s!.queue].filter((id) => all.find((c) => c.id === id)!.stats.wrong === 0);
    expect(fresh).toHaveLength(1);
  });

  it('nothing due → study ahead (C9)', async () => {
    const { app, book, ports } = await imported();
    await app.settings.update({ dailyNewLimit: 1 });
    const v0 = await app.study.resumeOrStart(book.id);
    await app.study.flip(v0.sessionId);
    await app.study.grade(v0.sessionId, 'unknown');
    await app.study.continueAfterReview(v0.sessionId);
    await app.study.flip(v0.sessionId);
    const done = await app.study.grade(v0.sessionId, 'known');
    expect(done.done).toBe(true);
    await app.study.finish(v0.sessionId);
    const empty = await app.study.resumeOrStart(book.id);
    expect(empty.nothingDue).toBe(true);
    const ahead = await app.study.resumeOrStart(book.id, { studyAhead: true });
    expect(ahead.card?.lemma).toBe('relinquish');
    await app.study.flip(ahead.sessionId);
    await app.study.grade(ahead.sessionId, 'known');
    const c = await ports.uow.run((tx) => tx.cards.get(`${book.id}:relinquish`));
    expect(c?.level).toBe(1); // no second promotion on the same day
  });

  it('achievements unlock once, persist with the grade, survive undo (G1, G4)', async () => {
    const { app, book, ports } = await imported();
    await app.settings.update({ retireOnFirstTry: false });
    const v0 = await app.study.resumeOrStart(book.id);
    let v = v0;
    const unlocked: string[] = [];
    for (let i = 0; i < 5 && !v.done; i++) {
      await app.study.flip(v0.sessionId);
      v = await app.study.grade(v0.sessionId, 'known');
      unlocked.push(...v.newAchievements.map((a) => `${a.achievementId}:${a.tier}`));
    }
    const n = (await ports.uow.run((tx) => tx.cards.listByBook(book.id))).length;
    if (n >= 5) {
      expect(unlocked).toContain('on-a-roll:bronze');
      await app.study.undo(v0.sessionId);
      expect((await ports.uow.run((tx) => tx.achievements.getStats())).correctStreak).toBe(4);
      expect((await ports.uow.run((tx) => tx.achievements.listUnlocks())).map((u) => u.achievementId)).toContain('on-a-roll');
    }
  });
});

describe('coverage (§7.5)', () => {
  const mk = (occ: Record<number, number>, level: number, status: Card['status'] = 'active') =>
    ({ occurrencesByChapter: occ, level, status }) as Card;
  it('computes exact values on 2 × 100 tokens', () => {
    const cards = [mk({ 0: 3, 1: 1 }, 0), mk({ 0: 1 }, 1), mk({ 1: 5 }, 2), mk({ 1: 4 }, 0, 'known')];
    expect(chapterCoverage({ index: 0, wordTokens: 100 }, cards)).toBeCloseTo(0.96, 10);
    expect(chapterCoverage({ index: 1, wordTokens: 100 }, cards)).toBeCloseTo(0.99, 10);
  });

  it('states, ready banner once, book finished (I3, G2)', async () => {
    const { app, book } = await imported();
    await app.settings.update({ coverageTarget: 0.99, retireOnFirstTry: true });
    const ch0 = await app.books.chapters(book.id);
    expect(ch0.map((c) => c.state)).toEqual(['excluded', 'learning', 'upcoming']);
    const v0 = await app.study.resumeOrStart(book.id);
    let v = v0;
    const banners: string[] = [];
    let finished = false;
    for (let i = 0; i < 30 && !v.done; i++) {
      await app.study.flip(v0.sessionId);
      v = await app.study.grade(v0.sessionId, 'known');
      if (v.chapterReady) banners.push(v.chapterReady.title);
      finished ||= !!v.bookFinished;
    }
    expect(banners).toEqual(['One', 'Two']);
    expect(finished).toBe(true);
    const ch1 = await app.books.chapters(book.id);
    expect(ch1.map((c) => c.state)).toEqual(['excluded', 'ready', 'ready']);
    const ach = await app.achievements.list();
    expect(ach.find((a) => a.id === `ready:${book.id}`)?.tiers[0].unlockedAt).toBeTruthy();
    expect(ach.find((a) => a.id === 'bookworm')?.tiers[0].unlockedAt).toBeTruthy();
  });

  it('counts words not in the lists per chapter (I6)', async () => {
    const { app, book } = await imported({
      toc: [{ title: 'One', depth: 0, section: 0 }, { title: 'Two', depth: 0, section: 1 }, { title: 'Three', depth: 0, section: 2 }],
      sections: [[`The lasgun and the lasgun ${filler(300)}`], [`The promethium ${filler(300)}`], [`Nothing here ${filler(300)}`]],
    });
    const chs = await app.books.chapters(book.id);
    expect(chs[0].unlisted).toEqual({ words: 1, occurrences: 2 });
    expect(chs[1].unlisted).toEqual({ words: 1, occurrences: 1 });
    expect(chs[2].unlisted).toEqual({ words: 0, occurrences: 0 });
  });
});

describe('adding by hand and re-filtering (D2, D8, B3)', () => {
  it('handles unlisted, below-level, inflected, absent and removed words; reapplyFilter keeps them', async () => {
    const s = setup({
      toc: [{ title: 'One', depth: 0, section: 0 }, { title: 'Two', depth: 0, section: 1 }, { title: 'Three', depth: 0, section: 2 }],
      sections: [[`The lasgun ${filler(300)} He strode on.`], [`The scythe and the ravine ${filler(300)}`], [`The quill ${filler(300)}`]],
    });
    const p = await s.app.books.analyse(buf);
    const b = await s.app.books.confirm(p.draftId, { includedChapters: p.includedChapters, cutoffRank: 8000 });
    await s.app.settings.update({ coverageTarget: 1 });
    const sug = await s.app.cards.suggest(b.id, 'Strode');
    expect(sug.lemma).toBe('stride');
    expect(sug.listed?.level).toBe(4);
    expect(sug.inBook?.kind).toBe('belowLevel');
    const absent = await s.app.cards.suggest(b.id, 'dagger');
    expect(absent.inBook).toBeUndefined();
    expect(absent.listed?.translations.length).toBeGreaterThan(0);

    const c1 = await s.app.cards.addWord(b.id, 'lasgun', ['Lasergewehr']);
    expect(c1).toMatchObject({ lemma: 'lasgun', origin: 'manual', translationSource: 'manual', occurrences: 1, chapterIndex: 0 });
    const c2 = await s.app.cards.addWord(b.id, 'strode', ['schreiten']);
    expect(c2).toMatchObject({ lemma: 'stride', listLevel: 4 });
    const c3 = await s.app.cards.addWord(b.id, 'dagger', ['Dolch']);
    // the hand-added "lasgun" made chapter One the learning chapter again
    expect(c3).toMatchObject({ occurrences: 0, chapterIndex: 0 });
    const cards = await s.ports.uow.run((tx) => tx.cards.listByBook(b.id));
    const minNew = Math.min(...cards.filter((c) => c.lemma !== 'dagger' && c.chapterIndex === 0).map((c) => c.firstPosition));
    expect(cards.find((c) => c.lemma === 'dagger')!.firstPosition).toBe(minNew - 1);
    const v = await s.app.study.resumeOrStart(b.id);
    expect(v.card?.lemma).toBe('dagger');
    await s.app.cards.setStatus(`${b.id}:scythe`, 'removed');
    const c4 = await s.app.cards.addWord(b.id, 'scythe', ['Sense']);
    expect(c4).toMatchObject({ status: 'active', translations: ['Sense'] });

    const after = await s.app.books.reapplyFilter(b.id, { cutoffRank: 20000 });
    expect(after.cutoffRank).toBe(20000);
    const left = (await s.ports.uow.run((tx) => tx.cards.listByBook(b.id))).map((c) => c.lemma).sort();
    expect(left).toEqual(expect.arrayContaining(['dagger', 'lasgun', 'scythe', 'stride']));
    expect(left).not.toContain('ravine'); // 12,936 ≤ 20,000 and untouched → deleted
    const back = await s.app.books.reapplyFilter(b.id, { cutoffRank: 8000 });
    expect(back.cards).toBeGreaterThan(after.cards);
  });

  it('words screen tabs (D1, D6)', async () => {
    const s = setup({ sections: [[`Gandor saw the lasgun and the lasgun and the scythe. ${filler(300)} Gandor was good.`]] });
    const p = await s.app.books.analyse(buf);
    const b = await s.app.books.confirm(p.draftId, { includedChapters: p.includedChapters, cutoffRank: 2000 });
    const unl = await s.app.cards.words(b.id, { tab: 'unlisted' });
    expect(unl[0]).toMatchObject({ lemma: 'lasgun', occurrences: 2 });
    expect(unl.some((r) => r.lemma === 'gandor')).toBe(false);
    expect((await s.app.cards.words(b.id, { tab: 'unlisted', includeNames: true })).some((r) => r.lemma === 'gandor')).toBe(true);
    await s.app.cards.ignoreUnlisted(b.id, 'lasgun');
    expect((await s.app.cards.words(b.id, { tab: 'unlisted' })).some((r) => r.lemma === 'lasgun')).toBe(false);
    expect((await s.app.cards.words(b.id, { tab: 'active', search: 'scy' })).map((r) => r.lemma)).toEqual(['scythe']);
  });
});

describe('calibration service (Epic H)', () => {
  it('runs 60 words in two stages, resumes, and saves a profile; no cognates', async () => {
    const { app } = setup();
    let v = await app.calibration.startOrResume();
    expect(v.total).toBe(60);
    const lemmas = new Set<string>();
    let n = 0;
    while (!v.result && n < 100) {
      lemmas.add(v.word!.lemma);
      expect(v.word!.lemma).toMatch(/^[a-z]{4,}$/);
      v = await app.calibration.answer(v.word!.level <= 5);
      if (n === 10) {
        const resumed = await app.calibration.startOrResume();
        expect(resumed.position).toBe(v.position);
      }
      n++;
    }
    expect(n).toBe(60);
    expect(lemmas.size).toBe(60);
    expect(v.result!.cutoffRank).toBeGreaterThanOrEqual(2000);
    expect((await app.calibration.profile())?.source).toBe('calibration');
    expect((await app.calibration.skip()).cutoffRank).toBe(8000);
  });

  it('swaps a word that is no fair test for an uncounted one of the same level', async () => {
    const { app } = setup();
    const v = await app.calibration.startOrResume();
    expect(v.word!.lookupLinks[0].name).toBe('Wiktionary');
    const swapped = await app.calibration.replaceWord();
    expect(swapped.position).toBe(v.position);
    expect(swapped.word!.level).toBe(v.word!.level);
    expect(swapped.word!.lemma).not.toBe(v.word!.lemma);
    let w = swapped;
    for (let n = 0; n < 60 && !w.result; n++) {
      expect(w.word!.lemma).not.toBe(v.word!.lemma); // never drawn again
      w = await app.calibration.answer(true);
    }
    expect(w.result).toBeDefined();
  });
});

describe('backup (F1)', () => {
  it('round-trips all data', async () => {
    const { app, book } = await imported();
    const v0 = await app.study.resumeOrStart(book.id);
    await app.study.flip(v0.sessionId);
    await app.study.grade(v0.sessionId, 'unknown');
    const data = await app.backup.export();
    const fresh = setup();
    await fresh.app.backup.import(JSON.parse(JSON.stringify(data)));
    const again = await fresh.app.backup.export();
    expect({ ...again, exportedAt: '' }).toEqual({ ...data, exportedAt: '' });
    expect((await fresh.app.books.list()).map((b) => b.title)).toEqual(['Two Chapters']);
    await expect(fresh.app.backup.import({ nope: 1 } as never)).rejects.toThrow(/backup/);
  });
});
