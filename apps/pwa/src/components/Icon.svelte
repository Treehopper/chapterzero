<script lang="ts">
  /** Line icons drawn in the text colour, so they sit with the app's type rather than as coloured emoji. */
  let { name, size = 22 }: { name: 'trophy' | 'settings'; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'trophy'}
    <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M7 6H4.5v1A3 3 0 0 0 7.4 10" />
    <path d="M17 6h2.5v1a3 3 0 0 1-2.9 3" />
    <path d="M12 14v4" />
    <path d="M8.5 20h7" />
  {:else}
    <path d="M4 7h9" /><path d="M18 7h2" /><circle cx="15.5" cy="7" r="2.5" />
    <path d="M4 17h2" /><path d="M11 17h9" /><circle cx="8.5" cy="17" r="2.5" />
  {/if}
</svg>
