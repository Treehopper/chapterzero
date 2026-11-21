<script lang="ts">
  /** Reader (Epic R): one chapter at a time in the app's serif; card words underlined, tap one for its card.
      Names are marked too: a tap shows the first sentences of the book in which they appear. */
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { headword, type ReaderBook, type ReaderCard, type ReaderChapter, type ReaderName } from '@vocabfirst/core';
  import { api } from '../lib/api';
  import { go, replace } from '../lib/router.svelte';
  import Sheet from '../components/Sheet.svelte';
  import LookupLinks from '../components/LookupLinks.svelte';
  import { t, textAttrs } from '../lib/i18n/index.svelte';
  import { ui } from '../lib/ui.svelte';

  let { bookId, chapter: chapterParam }: { bookId: string; chapter?: string } = $props();
  let book = $state<ReaderBook>();
  let ch = $state<ReaderChapter>();
  let error = $state('');
  let contents = $state(false);
  let card = $state<ReaderCard>();
  let name = $state<ReaderName>();
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
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-c], [data-n]');
    const id = el?.dataset.c, n = el?.dataset.n;
    if (id && ch?.cards[id]) card = ch.cards[id];
    else if (n && ch?.names[n]) name = ch.names[n];
  }

  /** a sentence with the name in bold */
  function marked(sentence: string, spelled: string): { t: string; b: boolean }[] {
    const out: { t: string; b: boolean }[] = [];
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${spelled.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu');
    let last = 0;
    for (const m of sentence.matchAll(re)) {
      if (m.index! > last) out.push({ t: sentence.slice(last, m.index), b: false });
      out.push({ t: m[0], b: true });
      last = m.index! + m[0].length;
    }
    if (last < sentence.length) out.push({ t: sentence.slice(last), b: false });
    return out;
  }
</script>

<main class="screen reader" data-testid="reader">
  <header class="topbar bar">
    <button class="iconbtn" aria-label={t('Back to the book')} onclick={() => go('book', bookId)}>‹</button>
    <h1 class="t">{ch?.title ?? book?.title ?? ''}</h1>
    <button class="iconbtn" aria-label={t('Contents')} onclick={() => (contents = true)} data-testid="contents">☰</button>
  </header>
  {#if error}<p class="error">{t(error)}</p>{/if}
  {#if ch}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <article class="text" bind:this={text} onclick={tapWord} data-testid="reader-text" {...textAttrs(book?.language ?? ui.pair.source)}>
      {#each ch.blocks as b, i (i)}
        <p data-b={i} class:note={b.note}>{#each b.segs as s, j (j)}{#if typeof s === 'string'}{s}{:else if 'n' in s}<span class="nm" data-n={s.n} role="button" tabindex="-1">{s.t}</span>{:else}<span class="w" class:active={ch.cards[s.c]?.status === 'active'} data-c={s.c} role="button" tabindex="-1">{s.t}</span>{/if}{/each}</p>
      {:else}
        <p class="muted">{t('This chapter has no text.')}</p>
      {/each}
    </article>
    <nav class="row pager">
      {#if prev}<button class="btn spacer" onclick={() => show(prev.index)}>‹ {prev.title}</button>{/if}
      {#if next}<button class="btn primary spacer" onclick={() => show(next.index)} data-testid="next-chapter">{next.title} ›</button>{/if}
    </nav>
  {/if}
</main>

{#if contents && book}
  <Sheet label={t('Contents')} onclose={() => (contents = false)}>
    <div class="stack">
      <h2>{t('Contents')}</h2>
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
  <Sheet label={t('Card {word}', { word: c.lemma })} onclose={() => (card = undefined)}>
    <div class="stack" data-testid="reader-card">
      <div class="row"><h2 class="spacer" {...textAttrs(book?.language ?? ui.pair.source)}>{headword(c.lemma, c.pos, book?.language)}</h2><span class="pill">{statusLabel[c.status] ? t(statusLabel[c.status]) : c.status}</span></div>
      {#if c.translations.length}<div class="tr" {...textAttrs(ui.pair.target)}>{c.translations.join(', ')}</div>{/if}
      {#if c.definition}<p class="small muted" {...textAttrs(book?.language ?? ui.pair.source)}>{c.definition}</p>{/if}
      <LookupLinks links={c.links} />
    </div>
  </Sheet>
{/if}

{#if name}
  {@const n = name}
  <Sheet label={n.name} onclose={() => (name = undefined)}>
    <div class="stack" data-testid="reader-name">
      <div class="row"><h2 class="spacer" {...textAttrs(book?.language ?? ui.pair.source)}>{n.name}</h2><span class="pill">{t('name')}</span></div>
      <div class="section-title">{t('First appearances')}</div>
      {#each n.first as sentence, i (i)}
        <p class="first" {...textAttrs(book?.language ?? ui.pair.source)}>{#each marked(sentence, n.name) as p, j (j)}{#if p.b}<b>{p.t}</b>{:else}{p.t}{/if}{/each}</p>
      {/each}
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
  .nm { cursor: pointer; text-decoration: underline dotted; text-decoration-color: color-mix(in srgb, var(--muted) 70%, transparent);
    text-decoration-thickness: 1.5px; text-underline-offset: 3px; }
  .first { font-family: var(--serif); font-size: 17px; line-height: 1.5; margin: 0; padding-left: 10px; border-left: 2px solid var(--line); }
  .pager { gap: 8px; margin-top: 24px; }
  .pager .btn { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .toc { text-align: left; width: 100%; }
  .toc.on { font-weight: 700; }
  .tr { font-family: var(--serif); font-size: 22px; }
</style>
