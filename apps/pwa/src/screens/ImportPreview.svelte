<script lang="ts">
  /** Import preview (B7, B11, B12): works and chapters with ticks; counts update live. */
  import { onMount } from 'svelte';
  import type { ImportPreview } from '@vocabfirst/core';
  import { api } from '../lib/api';
  import { go, replace } from '../lib/router.svelte';
  import { fmt, pct, ui } from '../lib/ui.svelte';
  import { languageName, t } from '../lib/i18n/index.svelte';

  let { draftId }: { draftId: string } = $props();
  let preview = $state<ImportPreview>();
  let included = $state<Set<number>>(new Set());
  let open = $state<Set<number>>(new Set());
  let error = $state('');
  let creating = $state(false);
  let seq = 0;

  onMount(async () => {
    try {
      preview = await api.books.preview(draftId);
      included = new Set(preview.includedChapters);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  });

  async function refresh() {
    const mine = ++seq;
    const p = await api.books.preview(draftId, { includedChapters: [...included] });
    if (mine === seq) preview = p;
  }
  function toggleChapter(i: number) {
    const next = new Set(included);
    if (next.has(i)) next.delete(i); else next.add(i);
    included = next;
    void refresh();
  }
  function toggleWork(w: ImportPreview['works'][number]) {
    const next = new Set(included);
    const all = w.chapters.every((c) => next.has(c.index));
    for (const c of w.chapters) if (all) next.delete(c.index); else next.add(c.index);
    included = next;
    void refresh();
  }
  function toggleOpen(i: number) {
    const next = new Set(open);
    if (next.has(i)) next.delete(i); else next.add(i);
    open = next;
  }
  async function create() {
    creating = true;
    try {
      const b = await api.books.confirm(draftId, { includedChapters: [...included], cutoffRank: preview!.cutoffRank });
      replace('book', b.id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      creating = false;
    }
  }
  async function discard() {
    await api.books.discard(draftId);
    go('library');
  }
  const words = (w: ImportPreview['works'][number]) => w.chapters.reduce((n, c) => n + c.wordTokens, 0);
  const kindLabel = { frontMatter: 'front matter', backMatter: 'back matter', story: '' } as const;
</script>

<main class="screen">
  <header class="topbar">
    <button class="iconbtn" aria-label={t('Cancel import')} onclick={discard}>‹</button>
    <h1>{t('Import')}</h1>
  </header>
  {#if error}<p class="error" role="alert">{t(error)}</p>{/if}
  {#if preview}
    {#if preview.otherLanguage}
      <p class="error" role="alert" data-testid="language-warning">{t('This book seems to be in {book}, but your word lists are for {lists}. The cards will not fit.', { book: languageName(preview.otherLanguage), lists: languageName(preview.language) })}</p>
    {/if}
    <section class="card-box stack head">
      <div class="row">
        {#if preview.coverDataUrl}<img src={preview.coverDataUrl} alt="" class="cover" />{/if}
        <div>
          <h2 class="title" data-testid="preview-title">{preview.title}</h2>
          {#if preview.author}<div class="muted">{preview.author}</div>{/if}
        </div>
      </div>
      <div class="big" data-testid="preview-cards">{t('Level {level} · {n} cards', { level: preview.level, n: fmt(preview.counts.cards) })}</div>
      <div class="muted">{t('estimated coverage now {pct}', { pct: pct(preview.coverageBefore) })}</div>
    </section>

    <div class="section-title">{t('Works and chapters')}</div>
    <div class="list" data-testid="chapter-list">
      {#each preview.works as w (w.index)}
        {#if preview.works.length > 1 && w.chapters.length > 1}
          {@const all = w.chapters.every((c) => included.has(c.index))}
          {@const some = w.chapters.some((c) => included.has(c.index))}
          <div class="list-row">
            <input type="checkbox" checked={all} indeterminate={some && !all} onchange={() => toggleWork(w)} aria-label={t('Include {title}', { title: w.title })} />
            <button class="grow" onclick={() => toggleOpen(w.index)} aria-expanded={open.has(w.index)}>
              <strong>{w.title}</strong> <span class="muted">{open.has(w.index) ? '▾' : '▸'}</span>
            </button>
            <span class="muted small num">{fmt(words(w))}</span>
          </div>
          {#if open.has(w.index)}
            {#each w.chapters as c (c.index)}
              <label class="list-row sub">
                <input type="checkbox" checked={included.has(c.index)} onchange={() => toggleChapter(c.index)} />
                <span class="grow">{c.title} {#if kindLabel[c.kind]}<span class="pill">{t(kindLabel[c.kind])}</span>{/if}</span>
                <span class="muted small num">{fmt(c.wordTokens)}</span>
              </label>
            {/each}
          {/if}
        {:else}
          {#each w.chapters as c (c.index)}
            <label class="list-row">
              <input type="checkbox" checked={included.has(c.index)} onchange={() => toggleChapter(c.index)} />
              <span class="grow">{preview.works.length > 1 && w.title !== c.title ? `${w.title} · ` : ''}{c.title}
                {#if kindLabel[c.kind]}<span class="pill">{t(kindLabel[c.kind])}</span>{/if}</span>
              <span class="muted small num">{fmt(c.wordTokens)}</span>
            </label>
          {/each}
        {/if}
      {/each}
    </div>

    <div class="section-title">{t('Words')}</div>
    <div class="card-box stack small" data-testid="preview-counts">
      <div class="row"><span class="spacer">{t('Distinct words')}</span><strong>{fmt(preview.counts.distinctWords)}</strong></div>
      <div class="row"><span class="spacer">{t('Cards')}</span><strong>{fmt(preview.counts.cards)}</strong></div>
      <div class="row muted"><span class="spacer">{t('Common words')}</span><span>{fmt(preview.counts.common)}</span></div>
      <div class="row muted"><span class="spacer">{t('Below your level')}</span><span>{fmt(preview.counts.belowLevel)}</span></div>
      <div class="row muted"><span class="spacer">{t('Already known')}</span><span>{fmt(preview.counts.known)}</span></div>
      <div class="row muted"><span class="spacer">{t('Nearly the same in {language}', { language: languageName(ui.pair.target) })}</span><span>{fmt(preview.counts.cognates)}</span></div>
      <div class="row muted"><span class="spacer">{t('Names skipped')}</span><span>{fmt(preview.counts.names)}</span></div>
      <div class="row muted"><span class="spacer">{t('Not in the lists')}</span><span>{fmt(preview.counts.unlisted)}</span></div>
      {#if Object.keys(preview.cardsPerListLevel).length}
        <div class="levels" aria-label={t('Cards per list level')}>
          {#each Object.entries(preview.cardsPerListLevel) as [lv, n] (lv)}<span class="pill">L{lv}: {n}</span>{/each}
        </div>
      {/if}
    </div>
    <p class="small muted">{t('{unlisted} words are not in the lists · {names} names skipped. You can add any of them by hand later.', { unlisted: fmt(preview.counts.unlisted), names: fmt(preview.counts.names) })}</p>
    <div class="cta">
      <button class="btn primary block" onclick={create} disabled={creating || included.size === 0} data-testid="create-cards">
        {creating ? t('Creating…') : t('Create {n} cards', { n: fmt(preview.counts.cards) })}
      </button>
    </div>
  {:else if !error}
    <p class="muted">{t('Loading preview…')}</p>
  {/if}
</main>

<style>
  .title { font-family: var(--serif); font-size: 22px; overflow-wrap: anywhere; }
  .cover { width: 48px; height: 72px; object-fit: cover; border-radius: 6px; }
  .big { font-size: 20px; font-weight: 700; }
  .grow { flex: 1; text-align: left; background: none; border: none; padding: 0; min-height: 28px; }
  .num { font-variant-numeric: tabular-nums; }
  .sub { padding-left: 40px; }
  .levels { display: flex; flex-wrap: wrap; gap: 6px; }
  .cta { position: sticky; bottom: 0; margin: 16px -16px 0; padding: 12px 16px calc(var(--safe-bottom) + 8px);
    background: linear-gradient(transparent, var(--bg) 30%); }
</style>
