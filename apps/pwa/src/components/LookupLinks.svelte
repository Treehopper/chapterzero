<script lang="ts">
  /** Dictionary links (C16, D9): real anchors, greyed out offline. */
  import { ui } from '../lib/ui.svelte';
  let { links }: { links: { name: string; url: string }[] } = $props();
</script>

<div class="links" data-nogesture>
  {#each links as l (l.url)}
    <a href={ui.online ? l.url : undefined} target="_blank" rel="noopener noreferrer" class:off={!ui.online} aria-disabled={!ui.online}>{l.name} ↗</a>
  {/each}
</div>
{#if !ui.online}<div class="small muted">offline — lookup links need a connection</div>{/if}

<style>
  /* flex: none — as a scrolling flex item it could otherwise be squeezed and clip the buttons on a full card */
  .links { flex: none; display: flex; gap: 8px; overflow-x: auto; padding: 4px 0; scrollbar-width: none; }
  a { flex: none; display: inline-flex; align-items: center; min-height: 44px; padding: 0 14px; border-radius: 22px; background: var(--surface-2);
    color: var(--text); text-decoration: none; font-weight: 600; font-size: 15px; }
  a.off { opacity: 0.4; pointer-events: none; }
</style>
