<script lang="ts">
  /** Toast (undo) host and the top pop-up for achievements / chapter banners (G4, I3). */
  import { ui } from '../lib/ui.svelte';
</script>

{#if ui.banner}
  {#key ui.banner.id}
    <div class="banner {ui.banner.tier ?? ''}" role="status" aria-live="polite" data-testid="banner">
      <span class="medal" aria-hidden="true">{ui.banner.kind === 'chapter' ? '📖' : ui.banner.tier === 'gold' ? '🥇' : ui.banner.tier === 'silver' ? '🥈' : '🥉'}</span>
      <div>
        <strong>{ui.banner.title}</strong>
        {#if ui.banner.subtitle}<div class="small">{ui.banner.subtitle}</div>{/if}
      </div>
    </div>
  {/key}
{/if}

{#if ui.toast}
  <div class="toast-host">
    <div class="toast" role="status" aria-live="polite" data-testid="toast">
      <span>{ui.toast.text}</span>
      {#if ui.toast.action}
        <button onclick={() => { const act = ui.toast?.action; ui.toast = undefined; act?.run(); }}>{ui.toast.action.label}</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .banner { position: fixed; top: calc(var(--safe-top) + 8px); left: 12px; right: 12px; margin: 0 auto; max-width: 420px; z-index: 70; pointer-events: none;
    display: flex; gap: 12px; align-items: center; padding: 12px 16px; border-radius: 16px; background: var(--surface); color: var(--text);
    box-shadow: var(--card-shadow); border: 1px solid var(--line); animation: drop 2.5s ease both; overflow: hidden; }
  .banner.gold::after { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255, 220, 120, 0.55) 50%, transparent 70%);
    transform: translateX(-100%); animation: shimmer 1.2s 0.3s ease; }
  .banner.gold { border-color: var(--gold); }
  .banner.silver { border-color: var(--silver); }
  .banner.bronze { border-color: var(--bronze); }
  .medal { font-size: 28px; }
  @keyframes drop { 0% { transform: translateY(-120%); opacity: 0; } 10%, 88% { transform: none; opacity: 1; } 100% { transform: translateY(-120%); opacity: 0; } }
  @keyframes shimmer { to { transform: translateX(100%); } }
</style>
