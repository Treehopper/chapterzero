<script lang="ts">
  /** Cards per learning box as shelves filling up (E2). */
  import { t } from '../lib/i18n/index.svelte';
  let { boxes, moved = 0 }: { boxes: number[]; moved?: number } = $props();
  const max = $derived(Math.max(1, ...boxes));
  const days = (i: number) => (i === 0 ? t('new / missed') : t('{n} d', { n: 2 ** (i - 1) }));
</script>

<div class="shelves card-box" role="list" aria-label={t('Cards per box')}>
  {#each boxes as n, i (i)}
    <div class="shelf" role="listitem" aria-label={t('Box {i}: {n} cards', { i, n })}>
      <span class="lbl small muted">{i === boxes.length - 1 ? t('mastered') : days(i)}</span>
      <span class="fill"><span style:width="{(n / max) * 100}%" class:up={moved > 0 && i > 0}></span></span>
      <span class="n">{n}</span>
    </div>
  {/each}
</div>

<style>
  .shelves { display: flex; flex-direction: column-reverse; gap: 6px; }
  .shelf { display: grid; grid-template-columns: 84px 1fr 40px; align-items: center; gap: 8px; }
  .fill { height: 14px; border-radius: 4px; background: var(--surface-2); overflow: hidden; border-bottom: 2px solid var(--line); }
  .fill span { display: block; height: 100%; background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 60%, var(--good))); transition: width .6s ease; }
  .fill span.up { animation: rise .8s ease both; }
  @keyframes rise { from { transform: translateY(10px); opacity: 0; } to { transform: none; opacity: 1; } }
  .n { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
</style>
