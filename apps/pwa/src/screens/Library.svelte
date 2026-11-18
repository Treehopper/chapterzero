<script lang="ts">
  /** Library (§8.1): books, import, level hint, re-filter offer (H4), backup reminder (§9). */
  import { onMount } from 'svelte';
  import type { BookOverview, VocabularyProfile } from '@vocabfirst/core';
  import { api } from '../lib/api';
  import { go } from '../lib/router.svelte';
  import { fmt, pct, toast, ui } from '../lib/ui.svelte';
  import Ring from '../components/Ring.svelte';
  import StartStudy from '../components/StartStudy.svelte';
  import Icon from '../components/Icon.svelte';

  let books = $state<BookOverview[]>([]);
  let loaded = $state(false);
  let profile = $state<VocabularyProfile>();
  let hintDismissed = $state(true);
  let backupDue = $state(false);
  let refilterHidden = $state(false);
  let analysing = $state<{ name: string; phase: string; loaded: number; total: number }>();
  let error = $state('');
  let refiltering = $state('');

  async function load() {
    const [b, p, s, daily] = await Promise.all([api.books.list(), api.calibration.profile(), api.appState.get(), api.progress.daily(60)]);
    books = b; profile = p; hintDismissed = !!s.levelHintDismissed;
    const since = s.lastExportAt ? new Date(s.lastExportAt) : undefined;
    const studyDays = daily.days.filter((d) => d.reviews > 0 && (!since || new Date(d.day) > since)).length;
    backupDue = studyDays >= 7;
    loaded = true;
  }
  onMount(load);

  const mismatched = $derived(profile ? books.filter((b) => b.cutoffRank !== profile!.cutoffRank) : []);

  async function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    error = '';
    analysing = { name: file.name, phase: 'reading', loaded: 0, total: 1 };
    try {
      const buf = await file.arrayBuffer();
      const preview = await api.books.analyse(buf, (p) => (analysing = { name: file.name, ...p }));
      go('import', preview.draftId);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      analysing = undefined;
    }
  }

  async function refilter(b: BookOverview) {
    refiltering = b.id;
    try {
      const r = await api.books.reapplyFilter(b.id, { cutoffRank: profile!.cutoffRank });
      toast(`${r.title}: ${fmt(r.cards)} cards at level ${r.level}`);
      await load();
    } finally { refiltering = ''; }
  }

  async function dismissHint() {
    hintDismissed = true;
    await api.appState.update({ levelHintDismissed: true });
  }
  const phaseLabel: Record<string, string> = { reading: 'Reading the book…', tokenising: 'Finding the words…', matching: 'Matching the word lists…', done: 'Preparing preview…' };
  let starting = $state<{ bookId: string; due: number }>();
  /** an open session continues; otherwise the start options (C19) */
  async function study(bookId: string, due = 0) {
    if (await api.study.active(bookId)) go('study', bookId); else starting = { bookId, due };
  }
</script>

<main class="screen">
  <header class="topbar">
    <h1>Library</h1>
    {#if ui.achievements}<button class="iconbtn" aria-label="Achievements" onclick={() => go('achievements')}><Icon name="trophy" /></button>{/if}
    <button class="iconbtn" aria-label="Settings" onclick={() => go('settings')}><Icon name="settings" /></button>
  </header>

  {#if profile?.source === 'default' && !hintDismissed}
    <div class="note card-box row" data-testid="level-hint">
      <span class="spacer">Check your level for better word selection.</span>
      <button class="linkbtn" onclick={() => go('check')}>Check</button>
      <button class="iconbtn" aria-label="Dismiss" onclick={dismissHint}>×</button>
    </div>
  {/if}

  {#if mismatched.length && !refilterHidden}
    <div class="note card-box stack" data-testid="refilter-offer">
      <strong>Your level changed</strong>
      <span class="small muted">Re-filter your books to the new cutoff (rank {fmt(profile!.cutoffRank)})? Cards you studied, edited or added stay.</span>
      {#each mismatched as b (b.id)}
        <div class="row"><span class="spacer">{b.title}</span>
          <button class="btn" disabled={refiltering === b.id} onclick={() => refilter(b)}>{refiltering === b.id ? 'Re-filtering…' : 'Re-filter'}</button></div>
      {/each}
      <button class="linkbtn" onclick={() => (refilterHidden = true)}>Not now</button>
    </div>
  {/if}

  {#if backupDue}
    <div class="note card-box row" data-testid="backup-reminder">
      <span class="spacer">You studied on 7 days since your last backup. Export one to keep your progress safe.</span>
      <button class="linkbtn" onclick={() => go('settings')}>Back up</button>
    </div>
  {/if}

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if loaded && books.length === 0}
    <div class="empty stack">
      <div class="art" aria-hidden="true">📚</div>
      <h2>Import your first book</h2>
      <p class="muted">Pick an EPUB from the Files app. VocabFirst finds its rare words and turns them into cards, chapter by chapter,
        so you can read without stopping.</p>
    </div>
  {/if}

  <div class="books">
    {#each books as b (b.id)}
      <article class="tile card-box" data-testid="book-tile">
        <button class="open" onclick={() => go('book', b.id)} aria-label="Open {b.title}">
          {#if b.coverDataUrl}<img src={b.coverDataUrl} alt="" class="cover" />{:else}<div class="cover placeholder" aria-hidden="true">{b.title.slice(0, 1)}</div>{/if}
          <div class="meta">
            <strong class="title">{b.title}</strong>
            {#if b.author}<span class="small muted">{b.author}</span>{/if}
            {#if b.learningChapter}
              <span class="small">{b.learningChapter.displayTitle} · {pct(b.learningChapter.coverage)}</span>
            {:else if b.finishedAt}<span class="small good">Ready to read</span>{/if}
            <span class="row small">
              {#if b.due}<span class="pill accent" data-testid="due-badge">{b.due} due</span>{/if}
              <span class="pill">Level {b.level}</span><span class="pill">{fmt(b.cards)} cards</span>
            </span>
          </div>
          <Ring value={b.coverage} size={64} stroke={7} label={(b.coverage * 100).toFixed(1)} sublabel="%" mark={0.98} />
        </button>
        <button class="btn primary block" onclick={() => study(b.id, b.due)}>Study</button>
      </article>
    {/each}
  </div>

  {#if loaded}<label class="btn block import" class:primary={books.length === 0}>
    <input type="file" accept=".epub,application/epub+zip" onchange={pick} class="sr-only" data-testid="file-input" />
    ＋ Import EPUB
  </label>{/if}
</main>

{#if analysing}
  <div class="busy" role="status" aria-live="polite" data-testid="analysing">
    <div class="card-box stack">
      <strong class="filename" title={analysing.name} data-testid="analysing-name">{analysing.name}</strong>
      <span class="muted">{phaseLabel[analysing.phase] ?? 'Working…'}</span>
      <div class="progressbar"><div style:width="{analysing.total ? (analysing.loaded / analysing.total) * 100 : 0}%"></div></div>
    </div>
  </div>
{/if}

{#if starting}<StartStudy bookId={starting.bookId} due={starting.due} onclose={() => (starting = undefined)} />{/if}

<style>
  .note { margin-bottom: 12px; }
  .books { display: grid; gap: 12px; margin-bottom: 16px; }
  .tile { display: flex; flex-direction: column; gap: 12px; }
  .open { display: flex; gap: 12px; align-items: center; background: none; border: none; padding: 0; text-align: left; width: 100%; }
  .cover { width: 56px; height: 84px; border-radius: 6px; object-fit: cover; flex: none; background: var(--surface-2); }
  .placeholder { display: grid; place-items: center; font-family: var(--serif); font-size: 28px; font-weight: 700; color: var(--muted); }
  .meta { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
  .title { font-family: var(--serif); font-size: 18px; overflow-wrap: anywhere; }
  .good { color: var(--good); font-weight: 600; }
  .empty { text-align: center; padding: 40px 8px; }
  .art { font-size: 56px; }
  .import { position: relative; }
  .busy { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); display: grid; grid-template-columns: minmax(0, 420px); place-content: center; padding: 24px; z-index: 50; }
  .busy .card-box { min-width: 0; }
  .filename { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
