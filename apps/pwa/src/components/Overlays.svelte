<script lang="ts">
  /** Toast (undo) host and the top pop-up for achievements / chapter banners (G4, I3). */
  import { BANNER_MS, dismissBanner, ui } from '../lib/ui.svelte';
  import Toast from './Toast.svelte';
</script>

{#if ui.banner}
  {#key ui.banner.id}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <div class="banner {ui.banner.tier ?? ''}" role="status" aria-live="polite" data-testid="banner" data-nogesture
      style:--banner-ms="{BANNER_MS}ms" onclick={dismissBanner}>
      <span class="medal" aria-hidden="true">{ui.banner.kind === 'chapter' ? '📖' : ui.banner.tier === 'gold' ? '🥇' : ui.banner.tier === 'silver' ? '🥈' : '🥉'}</span>
      <div>
        <strong class="btitle">{ui.banner.title}</strong>
        {#if ui.banner.subtitle}<div class="bsub">{ui.banner.subtitle}</div>{/if}
      </div>
    </div>
  {/key}
{/if}

{#if !ui.toastInStage}<Toast />{/if}

<style>
  .banner { position: fixed; top: calc(var(--safe-top) + 12px); left: 12px; right: 12px; margin: 0 auto; max-width: 440px; z-index: 70; cursor: pointer;
    display: flex; gap: 16px; align-items: center; padding: 20px 20px; border-radius: 22px; background: var(--surface); color: var(--text);
    box-shadow: var(--card-shadow); border: 2px solid var(--line); animation: drop var(--banner-ms) ease both; overflow: hidden; }
  .btitle { display: block; font-size: 21px; line-height: 1.25; }
  .bsub { font-size: 16px; color: var(--muted); margin-top: 4px; }
  .banner.gold::after { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255, 220, 120, 0.55) 50%, transparent 70%);
    transform: translateX(-100%); animation: shimmer 1.2s 0.3s ease; }
  .banner.gold { border-color: var(--gold); }
  .banner.silver { border-color: var(--silver); }
  .banner.bronze { border-color: var(--bronze); }
  .medal { font-size: 52px; line-height: 1; }
  @keyframes drop { 0% { transform: translateY(-120%); opacity: 0; } 6%, 94% { transform: none; opacity: 1; } 100% { transform: translateY(-120%); opacity: 0; } }
  @keyframes shimmer { to { transform: translateX(100%); } }
</style>
