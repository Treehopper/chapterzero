<script lang="ts">
  /** Reader (Epic R): one chapter at a time in the app's serif; card words underlined, tap one for its card. */
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { headword, type ReaderBook, type ReaderCard, type ReaderChapter } from '@vocabfirst/core';
  import { api } from '../lib/api';
  import { go, replace } from '../lib/router.svelte';
  import Sheet from '../components/Sheet.svelte';
  import LookupLinks from '../components/LookupLinks.svelte';

  let { bookId, chapter: chapterParam }: { bookId: string; chapter?: string } = $props();
  let book = $state<ReaderBook>();
  let ch = $state<ReaderChapter>();
  let error = $state('');
  let contents = $state(false);
  let card = $state<ReaderCard>();
  let text = $state<HTMLElement>();

  const at = $derived(book && ch ? book.chapters.findIndex((c) => c.index === ch!.index) : -1);
  const prev = $derived(book && at > 0 ? book.chapters.slice(0, at).reverse().find((c) => c.blocks) : undefined);
  const next = $derived(book && at >= 0 ? book.chapters.slice(at + 1).find((c) => c.blocks) : undefined);
  const statusLabel: Record<string, string> = { active: 'learning', known: 'known', removed: 'removed' };

  onMount(async () => {
    try {
      book = await api.reader.open(bookId);
      const asked = untrack(() => chapterParam);
      const index = asked !== undefined && /^\d+$/.test(asked) ? Number(asked) : book.position.chapter;
      await show(index, index === book.position.chapter ? book.position.block : 0);
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  });

  async function show(index: number, block = 0) {
    contents = false;
    ch = await api.reader.chapter(bookId, index);
    replace('read', bookId, String(index));
    await tick();
    const el = text?.querySelector<HTMLElement>(`[data-b="${block}"]`);
    if (block > 0 && el) el.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
    void api.reader.savePosition(bookId, index, block);
  }

  /** the first paragraph still on screen is where you are */
  let timer: ReturnType<typeof setTimeout> | undefined;
  function onScroll() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!ch || !text) return;
      const ps = text.querySelectorAll<HTMLElement>('[data-b]');
      let lo = 0, hi = ps.length - 1, found = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (ps[mid].getBoundingClientRect().bottom > 60) { found = mid; hi = mid - 1; } else lo = mid + 1;
      }
      void api.reader.savePosition(bookId, ch.index, Number(ps[found]?.dataset.b ?? 0));
    }, 400);
  }
  onMount(() => window.addEventListener('scroll', onScroll, { passive: true }));

  // the chapter in the URL changed from outside (the reader's own changes already match)
  $effect(() => {
    const asked = chapterParam;
    if (untrack(() => ch) && asked !== undefined && /^\d+$/.test(asked) && Number(asked) !== untrack(() => ch!.index)) void show(Number(asked));
  });
  onDestroy(() => { window.removeEventListener('scroll', onScroll); clearTimeout(timer); });

  function tapWord(e: MouseEvent) {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c;
    if (id && ch?.cards[id]) card = ch.cards[id];
  }
</script>

<main class="screen reader" data-testid="reader">
  <header class="topbar bar">
    <button class="iconbtn" aria-label="Back to the book" onclick={() => go('book', bookId)}>‹</button>
    <h1 class="t">{ch?.title ?? book?.title ?? ''}</h1>
    <button class="iconbtn" aria-label="Contents" onclick={() => (contents = true)} data-testid="contents">☰</button>
  </header>
  {#if error}<p class="error">{error}</p>{/if}
  {#if ch}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <article class="text" bind:this={text} onclick={tapWord} data-testid="reader-text">
      {#each ch.blocks as b, i (i)}
        <p data-b={i} class:note={b.note}>{#each b.segs as s, j (j)}{#if typeof s === 'string'}{s}{:else}<span class="w" class:active={ch.cards[s.c]?.status === 'active'} data-c={s.c} role="button" tabindex="-1">{s.t}</span>{/if}{/each}</p>
      {:else}
        <p class="muted">This chapter has no text.</p>
      {/each}
    </article>
    <nav class="row pager">
      {#if prev}<button class="btn spacer" onclick={() => show(prev.index)}>‹ {prev.title}</button>{/if}
      {#if next}<button class="btn primary spacer" onclick={() => show(next.index)} data-testid="next-chapter">{next.title} ›</button>{/if}
    </nav>
  {/if}
</main>

{#if contents && book}
  <Sheet label="Contents" onclose={() => (contents = false)}>
    <div class="stack">
      <h2>Contents</h2>
      <div class="list">
        {#each book.chapters.filter((c) => c.blocks) as c (c.index)}
          <button class="list-row toc" class:on={c.index === ch?.index} class:muted={!c.included} onclick={() => show(c.index)} data-testid="toc-row">{c.title}</button>
        {/each}
      </div>
    </div>
  </Sheet>
{/if}

{#if card}
  {@const c = card}
  <Sheet label="Card {c.lemma}" onclose={() => (card = undefined)}>
    <div class="stack" data-testid="reader-card">
      <div class="row"><h2 class="spacer">{headword(c.lemma, c.pos)}</h2><span class="pill">{statusLabel[c.status] ?? c.status}</span></div>
      {#if c.translations.length}<div class="tr">{c.translations.join(', ')}</div>{/if}
      {#if c.definition}<p class="small muted">{c.definition}</p>{/if}
      <LookupLinks links={c.links} />
    </div>
  </Sheet>
{/if}

<style>
  .bar { position: sticky; top: 0; z-index: 2; background: var(--bg); margin: calc(-1 * var(--safe-top) - 12px) -16px 8px;
    padding: calc(var(--safe-top) + 4px) 8px 4px; border-bottom: 1px solid var(--line); }
  .bar .t { font-size: 17px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .text { font-family: var(--serif); font-size: 19px; line-height: 1.6; overflow-wrap: break-word; hyphens: auto; }
  .text p { margin: 0 0 0.9em; scroll-margin-top: 64px; }  /* below the sticky bar */
  .text .note { font-size: 15px; color: var(--muted); border-left: 2px solid var(--line); padding-left: 10px; }
  .w { cursor: pointer; }
  .w.active { text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--accent) 55%, transparent);
    text-decoration-thickness: 1.5px; text-underline-offset: 3px; }
  .pager { gap: 8px; margin-top: 24px; }
  .pager .btn { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .toc { text-align: left; width: 100%; }
  .toc.on { font-weight: 700; }
  .tr { font-family: var(--serif); font-size: 22px; }
</style>
