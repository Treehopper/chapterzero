<script lang="ts">
  /** A small (i) after a setting's name: a tap shows the details right below it (Settings, §8.1). */
  import { t } from '../lib/i18n/index.svelte';

  let { text }: { text: string } = $props();
  let open = $state(false);
  const id = `info-${Math.random().toString(36).slice(2, 8)}`;
</script>

<button type="button" class="i" class:open aria-label={t('Details')} aria-expanded={open} aria-controls={id}
  onclick={(e) => { e.preventDefault(); e.stopPropagation(); open = !open; }} data-testid="info">i</button>
{#if open}<span class="details small" {id} data-testid="info-text">{text}</span>{/if}

<style>
  .i { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; margin-left: 6px; padding: 0;
    border-radius: 50%; border: 1.5px solid var(--muted); background: none; color: var(--muted); font: italic 700 12px/1 var(--serif);
    vertical-align: 1px; cursor: pointer; position: relative; }
  /* a finger-sized target around the small circle */
  .i::after { content: ''; position: absolute; inset: -12px; }
  .i.open { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
  .details { display: block; margin-top: 6px; color: var(--muted); font-weight: 400; line-height: 1.4; white-space: normal; }
</style>
