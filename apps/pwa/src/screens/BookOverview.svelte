<script lang="ts">
  /** Book overview: coverage (E1, I2), works and chapters (I1–I6), boxes (E2), streak and goal (E4). */
  import { onMount, untrack } from 'svelte';
  import { LEVELS, startLevel, type BookOverview, type BookProgress, type ChapterProgress } from '@vocabfirst/core';
  import { api } from '../lib/api';
  import { go } from '../lib/router.svelte';
  import { duration, fmt, pct, toast, ui } from '../lib/ui.svelte';
  import Ring from '../components/Ring.svelte';
  import Sheet from '../components/Sheet.svelte';
  import Boxes from '../components/Boxes.svelte';
  import StartStudy from '../components/StartStudy.svelte';
  import { t, tn } from '../lib/i18n/index.svelte';

  let { bookId }: { bookId: string } = $props();
  let book = $state<BookOverview>();
  let p = $state<BookProgress>();
  let daily = $state<{ streakDays: number; reviewsToday: number; dailyGoal: number }>();
  let closed = $state<Set<number>>(new Set());
  let sheet = $state<ChapterProgress>();
  let menu = $state(false);
  let refilter = $state(false);
  let cutoff = $state(8000);
  let error = $state('');
  let active = $state<{ progress: { done: number; total: number }; endsAt?: string; chapterIndex?: number } | null>(null);
  let starting = $state<{ chapter?: { index: number; title: string } }>();
  /** books imported before the reader have no stored text (Epic R) */
  let readable = $state(false);

  async function load() {
    try {
      let page;
      [page, daily, active, readable] = await Promise.all([api.books.page(bookId), api.progress.daily(1), api.study.active(bookId), api.reader.available(bookId)]);
      ({ book, progress: p } = page);
      cutoff = book.cutoffRank;
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  }
  onMount(load);
  $effect(() => { if (ui.changed) void untrack(load); });

  const stateIcon = { ready: '✓', learning: '●', upcoming: '', excluded: '–' } as const;
  const stateLabel = { ready: 'Ready to read', learning: 'Learning', upcoming: 'Upcoming', excluded: 'Not included' } as const;
  /** works with several chapters get a collapsible heading; single-chapter works are plain rows */
  function groups(bp: BookProgress): { work?: BookProgress['works'][number]; chapters: ChapterProgress[] }[] {
    const out: { work?: BookProgress['works'][number]; chapters: ChapterProgress[] }[] = [];
    for (const w of bp.works) {
      const chs = bp.chapters.filter((c) => c.workIndex === w.index);
      if (bp.works.length > 1 && chs.length > 1) out.push({ work: w, chapters: chs });
      else if (out.length && !out[out.length - 1].work) out[out.length - 1].chapters.push(...chs);
      else out.push({ chapters: chs });
    }
    return out;
  }
  function toggle(i: number) { const n = new Set(closed); if (n.has(i)) n.delete(i); else n.add(i); closed = n; }

  async function del() {
    if (!confirm(t('Delete “{title}” and all its cards? This cannot be undone.', { title: book?.title ?? '' }))) return;
    await api.books.delete(bookId);
    toast(t('Book deleted'));
    go('library');
  }
  async function applyRefilter() {
    const r = await api.books.reapplyFilter(bookId, { cutoffRank: cutoff });
    refilter = false;
    toast(t('{n} cards at level {level}', { n: fmt(r.cards), level: r.level }));
    await load();
  }
</script>

<main class="screen">
  <header class="topbar">
    <button class="iconbtn" aria-label={t('Back to library')} onclick={() => go('library')}>‹</button>
    <h1 class="t">{book?.title ?? ''}</h1>
    <button class="iconbtn" aria-label={t('Book options')} onclick={() => (menu = true)}>⋯</button>
  </header>
  {#if error}<p class="error">{t(error)}</p>{/if}
  {#if book && p}
    <section class="hero card-box">
      <Ring value={p.coverage} size={112} stroke={11} label={pct(p.coverage)} sublabel={t('estimated')} mark={p.coverageTarget}
        color={p.coverage >= p.coverageTarget ? 'var(--good)' : 'var(--accent)'} />
      <div class="stack hero-text">
        <strong data-testid="book-coverage">{p.unknownEvery ? t('about one unknown word every {n} words', { n: p.unknownEvery }) : t('no unknown words left')}</strong>
        <span class="small muted">{t("You know {known} of this book's {total} rare words.", { known: fmt(p.rareWordsKnown), total: fmt(p.rareWordsTotal) })}</span>
        {#if p.toReady.cards}
          <span class="small eta" data-testid="book-eta"><strong>{duration(p.toReady.minutes)}</strong> {t('of practice until ready to read')}
            <span class="muted">· {t('{n} words, about {days} at your daily limit', { n: fmt(p.toReady.cards), days: tn(p.toReady.days, '{n} day', '{n} days') })}</span></span>
        {/if}
        {#if p.ready}
          {#if readable}<button class="pill good readpill" onclick={() => go('read', bookId)} data-testid="ready-read">{t('Ready to read · open ›')}</button>
          {:else}<span class="pill good">{t('Ready to read')}</span>{/if}
        {/if}
      </div>
    </section>

    <div class="row actions">
      <button class="btn primary spacer" onclick={() => (active ? go('study', bookId) : (starting = {}))} data-testid="study-now">
        {#if active}{t('Continue · {done} / {total}', { done: active.progress.done, total: active.progress.total })}
        {:else if !p.ready}{t('Get ready for reading')}
        {:else}{t('Review')}{p.due ? ` · ${t('{n} due', { n: p.due })}` : ''}{/if}</button>
      {#if readable}<button class="btn" onclick={() => go('read', bookId)} data-testid="read">{t('Read')}</button>{/if}
      <button class="btn" onclick={() => go('words', bookId)}>{t('Words')}</button>
    </div>

    {#each groups(p) as g, gi (gi)}
      {#if g.work}
        <button class="work section-title" onclick={() => toggle(g.work!.index)} aria-expanded={!closed.has(g.work.index)}>{closed.has(g.work.index) ? '▸' : '▾'} {g.work.title}</button>
      {:else}<div class="section-title">{gi === 0 && p.works.length === 1 ? t('Chapters') : ''}</div>{/if}
      {#if !g.work || !closed.has(g.work.index)}
        <div class="list">
          {#each g.chapters as c (c.index)}
            <button class="list-row ch {c.state}" onclick={() => (sheet = c)} data-testid="chapter-row">
              <span class="icon" aria-hidden="true">{stateIcon[c.state]}</span>
              <span class="stack grow">
                <span class="row"><span class="spacer name">{g.work ? c.title : c.displayTitle}</span><span class="num" data-testid="chapter-to-target">{c.included ? t('{pct} to target', { pct: pct(c.toTarget, 0) }) : ''}</span></span>
                {#if c.included}
                  <span class="cbar" aria-hidden="true"><span style:width="{c.toTarget * 100}%"></span></span>
                {/if}
                <span class="small muted">{t(stateLabel[c.state])}{#if c.included}{' · '}{t('{pct} known', { pct: pct(c.coverage) })}{/if}{#if c.state === 'learning'}{' · '}{t('{n} new', { n: c.cards.unseen })}{/if}{#if c.toReady}{' · '}<span data-testid="chapter-eta">{duration(c.toReady.minutes)}</span>{/if}</span>
              </span>
            </button>
          {/each}
        </div>
      {/if}
    {/each}
    <p class="small muted" data-testid="bars-note">{t("Bars show how far each chapter is on the way to your {target} target: full = ready to read. “Known” is the estimated share of the chapter's words you know; words not in the lists count as known.", { target: pct(p.coverageTarget) })}</p>

    <div class="section-title">{t('Boxes')}</div>
    <Boxes boxes={p.boxes} />

    {#if daily}
      <div class="section-title">{t('Today')}</div>
      <div class="card-box row">
        {#if ui.achievements}<span class="flame" aria-label={t('{n} day streak', { n: daily.streakDays })}>🔥 <strong>{daily.streakDays}</strong> <span class="small muted">{t('day streak')}</span></span>
        {:else}<span class="small muted">{t('Reviews today')}</span>{/if}
        <span class="spacer"></span>
        <Ring value={daily.reviewsToday / daily.dailyGoal} size={56} stroke={6} label={String(daily.reviewsToday)} sublabel="/ {daily.dailyGoal}" color="var(--good)" />
      </div>
    {/if}
  {/if}
</main>

{#if sheet}
  {@const c = sheet}
  <Sheet label={c.displayTitle} onclose={() => (sheet = undefined)}>
    <div class="stack">
      <h2>{c.displayTitle}</h2>
      <div class="muted">{t(stateLabel[c.state])}{c.included ? ` · ${t('{pct} of the words known', { pct: pct(c.coverage) })}` : ''}{c.unknownEvery ? ` · ${t('one unknown in {n}', { n: c.unknownEvery })}` : ''}</div>
      <div class="row counts">
        <div><strong>{c.cards.unseen}</strong><span class="small muted">{t('unseen')}</span></div>
        <div><strong>{c.cards.learning}</strong><span class="small muted">{t('learning')}</span></div>
        <div><strong>{c.cards.learned}</strong><span class="small muted">{t('learned')}</span></div>
      </div>
      {#if c.toReady}
        <p class="small" data-testid="sheet-eta"><strong>{duration(c.toReady.minutes)}</strong> {t('of practice ({n} words) until this chapter is ready to read', { n: c.toReady.cards })}<span class="muted">{t(', once the chapters before it are')}</span>.</p>
      {/if}
      <p class="small muted">{t('100 % = all {n} cards learned.', { n: c.cards.unseen + c.cards.learning + c.cards.learned })}</p>
      {#if c.included}
        {@const same = active?.chapterIndex === c.index}
        <button class="btn primary" data-testid="study-chapter"
          onclick={() => { if (same) go('study', bookId); else starting = { chapter: { index: c.index, title: c.displayTitle } }; sheet = undefined; }}>
          {same && active ? t('Continue · {done} / {total}', { done: active.progress.done, total: active.progress.total }) : c.state === 'ready' ? t('Review this chapter') : t('Get this chapter ready')}</button>
      {/if}
    </div>
  </Sheet>
{/if}

{#if menu}
  <Sheet label={t('Book options')} onclose={() => (menu = false)}>
    <div class="stack">
      <button class="btn" onclick={() => { menu = false; refilter = true; }}>{t('Change level for this book…')}</button>
      <button class="btn danger" onclick={del}>{t('Delete book')}</button>
      <button class="btn" onclick={() => (menu = false)}>{t('Cancel')}</button>
    </div>
  </Sheet>
{/if}

{#if refilter}
  <Sheet label={t('Change level')} onclose={() => (refilter = false)}>
    <div class="stack">
      <h2>{t('Level {level} for this book', { level: startLevel(cutoff) })}</h2>
      <p class="small muted">{t("Listed words more common than rank {rank} won't be cards. Cards you studied, edited or added stay.", { rank: fmt(cutoff) })}</p>
      <input type="range" min="2000" max="60000" step="500" bind:value={cutoff} list="lv" aria-label={t('Cutoff rank')} />
      <datalist id="lv">{#each LEVELS as l (l.level)}<option value={l.from - 1}></option>{/each}</datalist>
      <button class="btn primary" onclick={applyRefilter}>{t('Re-filter')}</button>
    </div>
  </Sheet>
{/if}

{#if starting && p}<StartStudy {bookId} due={p.due} chapter={starting.chapter} onclose={() => (starting = undefined)} />{/if}

<style>
  .t { font-family: var(--serif); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hero { display: flex; gap: 16px; align-items: center; }
  .hero-text { gap: 6px; }
  .left { text-align: left; padding-left: 0; }
  .actions { margin: 12px 0 4px; gap: 8px; }
  .actions .btn { padding: 0 14px; white-space: nowrap; }
  /* a long label (German) wraps instead of pushing the other buttons off screen */
  .actions .btn.primary { white-space: normal; min-width: 0; line-height: 1.2; }
  .work { background: none; border: none; text-align: left; width: 100%; padding: 0; }
  .ch { align-items: flex-start; }
  .icon { width: 18px; font-weight: 800; color: var(--muted); margin-top: 2px; }
  .ready .icon { color: var(--good); }
  .learning .icon { color: var(--accent); }
  .excluded { opacity: 0.55; }
  .grow { flex: 1; gap: 4px; min-width: 0; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .num { font-variant-numeric: tabular-nums; font-weight: 600; }
  .cbar { position: relative; height: 6px; border-radius: 3px; background: var(--surface-2); display: block; }
  .cbar span { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; background: var(--accent); }
  .ready .cbar span { background: var(--good); }
  .counts { justify-content: space-around; text-align: center; }
  .counts div { display: flex; flex-direction: column; font-size: 22px; }
  .flame { font-size: 20px; }
  .readpill { border: none; cursor: pointer; align-self: flex-start; }
  .eta { margin-top: 2px; }
</style>
