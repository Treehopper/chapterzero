<script lang="ts">
  /** Words (Epic D): not in the lists / active / known / removed / skipped, search, chapter filter, add by hand. */
  import { onMount, untrack } from 'svelte';
  import { headword, type ChapterProgress, type WordRow, type WordsTab, type WordSuggestion } from '@vocabfirst/core';
  import { api } from '../lib/api';
  import { go, replace } from '../lib/router.svelte';
  import { dataChanged, fmt, toast } from '../lib/ui.svelte';
  import Sheet from '../components/Sheet.svelte';
  import LookupLinks from '../components/LookupLinks.svelte';

  let { bookId, tab: tabParam, chapter: chapterParam }: { bookId: string; tab?: string; chapter?: string } = $props();
  const TABS: { id: WordsTab; label: string }[] = [
    { id: 'active', label: 'Active' }, { id: 'known', label: 'Known' }, { id: 'removed', label: 'Removed' },
    { id: 'skipped', label: 'Skipped' }, { id: 'unlisted', label: 'Not in lists' },
  ];
  // the screen is re-created per route, so the initial props are all it needs
  let tab = $state<WordsTab>(untrack(() => TABS.find((t) => t.id === tabParam)?.id ?? 'active'));
  let chapterIndex = $state<number | undefined>(untrack(() => (chapterParam ? Number(chapterParam) : undefined)));
  let search = $state('');
  let names = $state(false);
  let rows = $state<WordRow[]>([]);
  let loading = $state(true);
  let counts = $state<Record<string, number>>({});
  let chapters = $state<ChapterProgress[]>([]);
  let limit = $state(100);

  // add sheet
  let adding = $state<{ editable: boolean; row?: WordRow }>();
  let typed = $state('');
  let translation = $state('');
  let suggestion = $state<WordSuggestion>();
  let addError = $state('');
  let error = $state('');
  let suggestSeq = 0;
  // edit sheet for active cards
  let editingRow = $state<WordRow>();
  let editText = $state('');

  // lists per query, so switching back to a tab shows it at once; a change to the words clears them
  const cache = new Map<string, WordRow[]>();
  let seq = 0;
  /** bumped by every change: a list fetched before it must not land in the cleared cache */
  let generation = 0;
  async function show() {
    const query = { tab, search, chapterIndex, includeNames: names };
    const key = JSON.stringify(query);
    const hit = cache.get(key);
    if (hit) { rows = hit; loading = false; return; }
    const mine = ++seq;
    rows = [];                     // never show the previous tab's words under this tab
    loading = true;
    const gen = generation;
    const r = await api.cards.words(bookId, query);
    if (gen === generation) cache.set(key, r);
    if (mine === seq) { rows = r; loading = false; }
  }
  /** after a change to the words: counts and lists are stale */
  async function load() {
    generation++;
    cache.clear();
    const [, c] = await Promise.all([show(), api.cards.counts(bookId)]);
    counts = c;
  }
  onMount(async () => {
    try {
      chapters = (await api.books.chapters(bookId)).filter((c) => c.included);
      await load();
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  });

  function setTab(t: WordsTab) {
    tab = t; limit = 100;
    replace('words', bookId, t, ...(chapterIndex !== undefined ? [String(chapterIndex)] : []));
    void show();
  }

  async function suggest(text: string) {
    const mine = ++suggestSeq;
    if (!text.trim()) { suggestion = undefined; return; }
    const s = await api.cards.suggest(bookId, text);
    if (mine !== suggestSeq) return;
    suggestion = s;
    if (!translation && s.listed?.translations.length) translation = s.listed.translations.join(', ');
  }

  function openAdd(row?: WordRow) {
    adding = { editable: !row, row };
    typed = row?.lemma ?? '';
    translation = row?.translations?.join(', ') ?? '';
    addError = '';
    suggestion = undefined;
    if (typed) void suggest(typed);
  }

  async function add() {
    addError = '';
    try {
      const ts = translation.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
      const c = await api.cards.addWord(bookId, typed, ts);
      adding = undefined;
      toast(`“${c.lemma}” added as a card`);
      await load();
    } catch (e) { addError = e instanceof Error ? e.message : String(e); }
  }

  async function ignore(row: WordRow) {
    adding = undefined;
    await api.cards.ignoreUnlisted(bookId, row.lemma, true);
    toast(`“${row.lemma}” hidden`, { label: 'Undo', run: async () => { await api.cards.ignoreUnlisted(bookId, row.lemma, false); dataChanged(); await load(); } });
    await load();
  }

  async function setStatus(row: WordRow, status: 'active' | 'removed' | 'known') {
    if (!row.card) return;
    const before = row.card.status;
    await api.cards.setStatus(row.card.id, status);
    const label = status === 'removed' ? 'removed' : status === 'known' ? 'marked as known' : 'restored';
    toast(`“${row.lemma}” ${label}`, { label: 'Undo', run: async () => { await api.cards.setStatus(row.card!.id, before); dataChanged(); await load(); } });
    editingRow = undefined;
    await load();
  }

  async function saveTranslation() {
    if (!editingRow?.card) return;
    try {
      await api.cards.editTranslation(editingRow.card.id, editText.split(/[,;]/).map((t) => t.trim()).filter(Boolean));
      editingRow = undefined;
      await load();
    } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
  }

  function tapRow(r: WordRow) {
    if (tab === 'unlisted' || tab === 'skipped' || (tab === 'known' && !r.card)) openAdd(r);
    else { editingRow = r; editText = r.translations?.join(', ') ?? ''; }
  }

  // swipe a row left: remove (cards) or ignore (not in the lists)
  let swipe = $state<{ lemma: string; x: number }>();
  let startX = 0;
  function rowDown(e: PointerEvent, r: WordRow) { startX = e.clientX; swipe = { lemma: r.lemma, x: 0 }; }
  function rowMove(e: PointerEvent) { if (swipe) swipe = { ...swipe, x: Math.min(0, e.clientX - startX) }; }
  function rowUp(r: WordRow) {
    const x = swipe?.x ?? 0;
    swipe = undefined;
    if (x < -90) {
      if (tab === 'unlisted') void ignore(r);
      else if (tab === 'active') void setStatus(r, 'removed');
    }
  }

  const status = $derived.by(() => {
    const s = suggestion;
    if (!s || !s.lemma) return '';
    const parts: string[] = [];
    if (s.existingCardId) parts.push(s.existingStatus === 'active' ? 'already a card' : `a ${s.existingStatus} card (adding restores it)`);
    if (s.listed) {
      parts.push(`in the lists, level ${s.listed.level}`);
      if (s.inBook?.kind === 'belowLevel') parts.push('skipped as below your level');
      if (s.inBook?.kind === 'cognate') parts.push('skipped as nearly the same in German');
    } else parts.push('not in the lists');
    parts.push(s.inBook ? `appears ${s.inBook.occurrences}× in this book` : 'not in this book');
    return parts.join(' · ');
  });
</script>

<main class="screen">
  <header class="topbar">
    <button class="iconbtn" aria-label="Back to the book" onclick={() => go('book', bookId)}>‹</button>
    <h1>Words</h1>
    <button class="iconbtn" aria-label="Add a word" onclick={() => openAdd()} data-testid="add-word">＋</button>
  </header>
  {#if error}<p class="error">{error}</p>{/if}
  <div class="tabs" role="tablist">
    {#each TABS as t (t.id)}
      <button role="tab" aria-selected={tab === t.id} class:on={tab === t.id} onclick={() => setTab(t.id)}>
        {t.label}{#if counts[t.id] !== undefined}{' '}<span class="c">{fmt(counts[t.id])}</span>{/if}
      </button>
    {/each}
  </div>
  <div class="row filters">
    <input type="search" placeholder="Search" bind:value={search} oninput={() => show()} aria-label="Search words" />
    <select bind:value={chapterIndex} onchange={() => show()} aria-label="Chapter">
      <option value={undefined}>All chapters</option>
      {#each chapters as c (c.index)}<option value={c.index}>{c.displayTitle}</option>{/each}
    </select>
  </div>
  {#if tab === 'unlisted'}
    <label class="row small names"><input type="checkbox" bind:checked={names} onchange={() => show()} /> Show names ({fmt(counts.names ?? 0)})</label>
  {/if}

  <div class="list" data-testid="word-list">
    {#each rows.slice(0, limit) as r (r.lemma)}
      <button class="list-row word" onclick={() => tapRow(r)} onpointerdown={(e) => rowDown(e, r)} onpointermove={rowMove} onpointerup={() => rowUp(r)}
        onpointercancel={() => (swipe = undefined)} style:transform={swipe?.lemma === r.lemma ? `translateX(${swipe.x}px)` : ''} data-testid="word-row" data-word={r.lemma}>
        <span class="stack grow">
          <span class="row"><strong class="spacer">{headword(r.lemma, r.pos)}{#if r.name} <span class="pill">name</span>{/if}</strong>
            {#if r.occurrences}<span class="muted small">×{r.occurrences}</span>{/if}
            {#if r.chapterTitle}<span class="muted small ch">{r.chapterTitle}</span>{/if}</span>
          {#if r.translations?.length || r.definition}<span class="small">{r.translations?.length ? r.translations.join(', ') : r.definition}</span>{/if}
          {#if r.example}<span class="small muted ex">“{r.example}”</span>{/if}
        </span>
      </button>
    {:else}
      {#if !loading}<div class="list-row muted">Nothing here.</div>{/if}
    {/each}
  </div>
  {#if rows.length > limit}<button class="btn block more" onclick={() => (limit += 200)}>Show more ({fmt(rows.length - limit)})</button>{/if}
  {#if tab === 'active' || tab === 'unlisted'}<p class="small muted">Swipe a row left to {tab === 'unlisted' ? 'hide it' : 'remove the card'}.</p>{/if}
</main>

{#if adding}
  <Sheet label="Add a word" onclose={() => (adding = undefined)}>
    <div class="stack" data-testid="add-sheet">
      <h2>Add a word</h2>
      {#if adding.editable}
        <input type="text" bind:value={typed} oninput={() => suggest(typed)} placeholder="Type a word" aria-label="Word" autocapitalize="off" autocomplete="off" />
      {:else}<div class="big">{typed}</div>{/if}
      {#if status}<div class="small muted" data-testid="suggest-status">{suggestion?.lemma && suggestion.lemma !== typed.trim().toLowerCase() ? `→ ${suggestion.lemma} · ` : ''}{status}</div>{/if}
      {#if suggestion?.inBook?.example || adding.row?.example}<div class="small ex">“{suggestion?.inBook?.example ?? adding.row?.example}”</div>{/if}
      {#if suggestion?.listed?.definition}<div class="small muted">{suggestion.listed.definition}</div>{/if}
      <label class="stack small">Translation
        <input type="text" bind:value={translation} placeholder="e.g. Lasergewehr" aria-label="Translation" />
      </label>
      {#if suggestion?.lookupLinks.length}<LookupLinks links={suggestion.lookupLinks} />{/if}
      {#if addError}<div class="error small" role="alert">{addError}</div>{/if}
      <div class="row">
        <button class="btn primary spacer" onclick={add} disabled={!typed.trim()} data-testid="add-card">Add card</button>
        {#if adding.row && adding.row.kind === 'unlisted'}<button class="btn" onclick={() => ignore(adding!.row!)}>Ignore</button>{/if}
      </div>
    </div>
  </Sheet>
{/if}

{#if editingRow?.card}
  {@const r = editingRow}
  <Sheet label="Card {r.lemma}" onclose={() => (editingRow = undefined)}>
    <div class="stack">
      <h2>{headword(r.lemma, r.pos)}</h2>
      {#if r.card?.status === 'active'}
        <label class="stack small">Translations (comma separated)<input type="text" bind:value={editText} /></label>
        <button class="btn primary" onclick={saveTranslation}>Save</button>
        <button class="btn danger" onclick={() => setStatus(r, 'removed')}>Remove card</button>
        <button class="btn" onclick={() => setStatus(r, 'known')}>Mark as known</button>
      {:else}
        <button class="btn primary" onclick={() => setStatus(r, 'active')}>Restore card</button>
      {/if}
    </div>
  </Sheet>
{/if}

<style>
  .tabs { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin-bottom: 8px; }
  .tabs button { flex: none; border: 1px solid var(--line); background: var(--surface); border-radius: 999px; padding: 0 14px; min-height: 36px; font-size: 14px; font-weight: 600; }
  .tabs button.on { background: var(--text); color: var(--bg); }
  .c { opacity: 0.6; font-weight: 500; }
  .filters { margin-bottom: 8px; }
  .filters select { max-width: 44%; }
  .names { margin: 0 4px 8px; }
  .word { align-items: flex-start; touch-action: pan-y; transition: transform .15s; }
  .grow { flex: 1; gap: 2px; min-width: 0; }
  .ch { max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ex { font-family: var(--serif); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .more { margin-top: 8px; }
  .big { font-family: var(--serif); font-size: 26px; font-weight: 700; }
</style>
