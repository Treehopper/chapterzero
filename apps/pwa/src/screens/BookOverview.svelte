<script lang="ts">
  /** Book overview: coverage (E1, I2), works and chapters (I1–I6), boxes (E2), streak and goal (E4). */
  import { onMount } from 'svelte';
  import { LEVELS, startLevel, type BookOverview, type BookProgress, type ChapterProgress } from '@vocabfirst/core';
  import { api } from '../lib/api';
  import { go } from '../lib/router.svelte';
  import { fmt, pct, toast } from '../lib/ui.svelte';
  import Ring from '../components/Ring.svelte';
  import Sheet from '../components/Sheet.svelte';
  import Boxes from '../components/Boxes.svelte';
  import StartStudy from '../components/StartStudy.svelte';

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

  async function load() {
    try {
      [book, p, daily, active] = await Promise.all([api.books.get(bookId), api.progress.book(bookId), api.progress.daily(1), api.study.active(bookId)]);
      cutoff = book.cutoffRank;
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  }
  onMount(load);

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
    if (!confirm(`Delete “${book?.title}” and all its cards? This cannot be undone.`)) return;
    await api.books.delete(bookId);
    toast('Book deleted');
    go('library');
  }
  async function applyRefilter() {
    const r = await api.books.reapplyFilter(bookId, { cutoffRank: cutoff });
    refilter = false;
    toast(`${fmt(r.cards)} cards at level ${r.level}`);
    await load();
  }
</script>

<main class="screen">
  <header class="topbar">
    <button class="iconbtn" aria-label="Back to library" onclick={() => go('library')}>‹</button>
    <h1 class="t">{book?.title ?? ''}</h1>
    <button class="iconbtn" aria-label="Book options" onclick={() => (menu = true)}>⋯</button>
  </header>
  {#if error}<p class="error">{error}</p>{/if}
  {#if book && p}
    <section class="hero card-box">
      <Ring value={p.coverage} size={112} stroke={11} label={pct(p.coverage)} sublabel="estimated" mark={p.coverageTarget}
        color={p.coverage >= p.coverageTarget ? 'var(--good)' : 'var(--accent)'} />
      <div class="stack hero-text">
        <strong data-testid="book-coverage">{p.unknownEvery ? `about one unknown word every ${p.unknownEvery} words` : 'no unknown words left'}</strong>
        <span class="small muted">You know {fmt(p.rareWordsKnown)} of this book's {fmt(p.rareWordsTotal)} rare words.</span>
        {#if p.finishedAt}<span class="pill good">Ready to read</span>{/if}
        {#if p.unlisted.words}<button class="linkbtn small left" onclick={() => go('words', bookId, 'unlisted')}>{fmt(p.unlisted.words)} words not in the lists (not counted)</button>{/if}
      </div>
    </section>

    <div class="row actions">
      <button class="btn primary spacer" onclick={() => (active ? go('study', bookId) : (starting = {}))} data-testid="study-now">
        {active ? `Continue · ${active.progress.done} / ${active.progress.total}` : `Study now${p.due ? ` · ${p.due} due` : ''}`}</button>
      <button class="btn" onclick={() => go('words', bookId)}>Words</button>
    </div>

    {#each groups(p) as g, gi (gi)}
      {#if g.work}
        <button class="work section-title" onclick={() => toggle(g.work!.index)} aria-expanded={!closed.has(g.work.index)}>{closed.has(g.work.index) ? '▸' : '▾'} {g.work.title}</button>
      {:else}<div class="section-title">{gi === 0 && p.works.length === 1 ? 'Chapters' : ''}</div>{/if}
      {#if !g.work || !closed.has(g.work.index)}
        <div class="list">
          {#each g.chapters as c (c.index)}
            <button class="list-row ch {c.state}" onclick={() => (sheet = c)} data-testid="chapter-row">
              <span class="icon" aria-hidden="true">{stateIcon[c.state]}</span>
              <span class="stack grow">
                <span class="row"><span class="spacer name">{g.work ? c.title : c.displayTitle}</span><span class="num" data-testid="chapter-to-target">{c.included ? `${pct(c.toTarget, 0)} to target` : ''}</span></span>
                {#if c.included}
                  <span class="cbar" aria-hidden="true"><span style:width="{c.toTarget * 100}%"></span></span>
                {/if}
                <span class="small muted">{stateLabel[c.state]}{#if c.included}{' · '}{pct(c.coverage)} known{/if}{#if c.state === 'learning'}{' · '}{c.cards.unseen} new{/if}{#if c.included && c.unlisted.words}{' · '}{c.unlisted.words} not in lists{/if}</span>
              </span>
            </button>
          {/each}
        </div>
      {/if}
    {/each}
    <p class="small muted" data-testid="bars-note">Bars show how far each chapter is on the way to your {pct(p.coverageTarget)} target: full = ready to read. “Known” is the estimated share of the chapter's words you know; words not in the lists count as known.</p>

    <div class="section-title">Boxes</div>
    <Boxes boxes={p.boxes} />

    {#if daily}
      <div class="section-title">Today</div>
      <div class="card-box row">
        <span class="flame" aria-label="{daily.streakDays} day streak">🔥 <strong>{daily.streakDays}</strong> <span class="small muted">day streak</span></span>
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
      <div class="muted">{stateLabel[c.state]} · {c.included ? `${pct(c.coverage)} of the words known` : 'not included'}{c.unknownEvery ? ` · one unknown in ${c.unknownEvery}` : ''}</div>
      <div class="row counts">
        <div><strong>{c.cards.unseen}</strong><span class="small muted">unseen</span></div>
        <div><strong>{c.cards.learning}</strong><span class="small muted">learning</span></div>
        <div><strong>{c.cards.learned}</strong><span class="small muted">learned</span></div>
      </div>
      <p class="small muted">100 % = all {c.cards.unseen + c.cards.learning + c.cards.learned} cards learned.</p>
      {#if c.unlisted.words}
        <button class="linkbtn small left" onclick={() => go('words', bookId, 'unlisted', String(c.index))} data-testid="chapter-unlisted">{c.unlisted.words} words not in the lists (not counted, nothing to do)</button>
      {/if}
      {#if c.included}
        {@const same = active?.chapterIndex === c.index}
        <button class="btn primary" data-testid="study-chapter"
          onclick={() => { if (same) go('study', bookId); else starting = { chapter: { index: c.index, title: c.displayTitle } }; sheet = undefined; }}>
          {same && active ? `Continue · ${active.progress.done} / ${active.progress.total}` : 'Study this chapter'}</button>
      {/if}
    </div>
  </Sheet>
{/if}

{#if menu}
  <Sheet label="Book options" onclose={() => (menu = false)}>
    <div class="stack">
      <button class="btn" onclick={() => { menu = false; refilter = true; }}>Change level for this book…</button>
      <button class="btn danger" onclick={del}>Delete book</button>
      <button class="btn" onclick={() => (menu = false)}>Cancel</button>
    </div>
  </Sheet>
{/if}

{#if refilter}
  <Sheet label="Change level" onclose={() => (refilter = false)}>
    <div class="stack">
      <h2>Level {startLevel(cutoff)} for this book</h2>
      <p class="small muted">Listed words more common than rank {fmt(cutoff)} won't be cards. Cards you studied, edited or added stay.</p>
      <input type="range" min="2000" max="60000" step="500" bind:value={cutoff} list="lv" aria-label="Cutoff rank" />
      <datalist id="lv">{#each LEVELS as l (l.level)}<option value={l.from - 1}></option>{/each}</datalist>
      <button class="btn primary" onclick={applyRefilter}>Re-filter</button>
    </div>
  </Sheet>
{/if}

{#if starting && p}<StartStudy {bookId} due={p.due} chapter={starting.chapter} onclose={() => (starting = undefined)} />{/if}

<style>
  .t { font-family: var(--serif); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hero { display: flex; gap: 16px; align-items: center; }
  .hero-text { gap: 6px; }
  .left { text-align: left; padding-left: 0; }
  .actions { margin: 12px 0 4px; }
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
</style>
