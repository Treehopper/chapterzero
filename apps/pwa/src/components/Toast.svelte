<script lang="ts">
  /** The toast (undo) itself. `inStage`: drawn inside the study stage instead of floating over the page —
      Safari tints its bottom bar from fixed elements at the edge, and an extra fixed strip there turns it white. */
  import { ui } from '../lib/ui.svelte';

  let { inStage = false }: { inStage?: boolean } = $props();
</script>

{#if ui.toast}
  <div class="toast-host" class:in-stage={inStage} data-nogesture>
    <div class="toast" role="status" aria-live="polite" data-testid="toast">
      <span>{ui.toast.text}</span>
      {#if ui.toast.action}
        <button onclick={() => { const act = ui.toast?.action; ui.toast = undefined; act?.run(); }}>{ui.toast.action.label}</button>
      {/if}
    </div>
  </div>
{/if}
