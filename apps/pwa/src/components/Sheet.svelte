<script lang="ts">
  import type { Snippet } from 'svelte';
  let { onclose, full = false, label, children }: { onclose: () => void; full?: boolean; label: string; children: Snippet } = $props();
</script>

<div class="sheet-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="sheet" class:full role="dialog" aria-modal="true" aria-label={label} tabindex="-1">
    {@render children()}
  </div>
</div>
