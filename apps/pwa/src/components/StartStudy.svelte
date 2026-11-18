<script lang="ts">
  /** How to study (C19): Quick start, a number of cards, or a time. An open session is continued instead. */
  import Sheet from './Sheet.svelte';
  import { go } from '../lib/router.svelte';

  let { bookId, due = 0, chapter, onclose }: {
    bookId: string; due?: number; chapter?: { index: number; title: string }; onclose: () => void;
  } = $props();

  const start = (how?: string) => {
    go('study', bookId, ...(chapter ? [String(chapter.index)] : []), ...(how ? [how] : []));
    onclose();   // after go: closing clears the props this reads
  };
</script>

<Sheet label={chapter ? 'Get this chapter ready' : 'Get ready to read'} {onclose}>
  <div class="stack" data-testid="start-study">
    <h2>{chapter ? 'Get this chapter ready' : 'Get ready to read'}</h2>
    {#if chapter}<p class="muted chapter" data-testid="start-chapter">{chapter.title}</p>{/if}
    <button class="btn primary block quick" onclick={() => start()} data-testid="quick-start">
      <strong>Quick start</strong>
      <span class="small">{due ? `${due} due reviews, then` : 'Due reviews, then'} {chapter ? "this chapter's" : "today's"} new cards</span>
    </button>

    <div class="section-title">Number of cards</div>
    <div class="row choices">
      {#each [10, 20, 50] as n (n)}
        <button class="btn" onclick={() => start(`cards-${n}`)} data-testid="start-cards-{n}">{n} cards</button>
      {/each}
    </div>

    <div class="section-title">Time</div>
    <div class="row choices">
      {#each [5, 10, 20] as m (m)}
        <button class="btn" onclick={() => start(`min-${m}`)} data-testid="start-min-{m}">{m} min</button>
      {/each}
    </div>
    <p class="small muted">A chosen number or time can go past the daily limit for new cards.</p>
  </div>
</Sheet>

<style>
  .quick { display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: 64px; }
  .quick strong { font-size: 18px; }
  .quick span { opacity: 0.85; }
  .chapter { margin: -8px 0 0; overflow-wrap: anywhere; }
  .choices { gap: 8px; }
  .choices .btn { flex: 1; min-height: 48px; }
</style>
