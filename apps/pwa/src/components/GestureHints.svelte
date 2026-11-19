<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  /** Gesture hints over a flip card (C13): each hint goes away once its gesture has been used. */
  let { flipped, used, grade = true, extra = false }: {
    flipped: boolean; used: Set<string>; grade?: boolean; extra?: boolean;
  } = $props();
</script>

<!-- one word per line, as before -->
{#snippet lines(text: string)}{#each text.split(' ') as w, i (i)}{#if i}<br />{/if}{w}{/each}{/snippet}

<div class="hints" aria-hidden="true" data-testid="hints">
  {#if !flipped && !used.has('tap')}<div class="h mid">◉ {t('tap to flip')}</div>{/if}
  {#if flipped && grade}
    {#if !used.has('left')}<div class="h left" data-testid="hint-left"><span class="arrow">←</span><br />{t('swipe')}<br /><span class="sub">{@render lines(t("didn't know"))}</span></div>{/if}
    {#if !used.has('right')}<div class="h right" data-testid="hint-right"><span class="arrow">→</span><br />{t('swipe')}<br /><span class="sub">{@render lines(t('knew it'))}</span></div>{/if}
  {/if}
  {#if extra && !used.has('up')}<div class="h bottom" data-testid="hint-up">↑ {t('swipe up')}<br /><span class="sub">{t('to edit the card or end the session')}</span></div>{/if}
</div>

<style>
  .hints { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,.5) 75%); color: white; font-weight: 700; }
  .h { position: absolute; text-align: center; font-size: 15px; text-shadow: 0 1px 4px rgba(0,0,0,.6); animation: pulse 1.6s ease-in-out infinite; }
  .h.bottom { bottom: calc(var(--safe-bottom) + 40px); left: 0; right: 0; font-size: 16px; }
  .sub { font-size: 13px; font-weight: 600; }
  .h.mid { top: 70%; left: 0; right: 0; }
  /* side hints drift the way the swipe goes, so they read as a motion, not as buttons */
  .arrow { font-size: 26px; line-height: 1; }
  .h.left { left: 6px; top: 45%; font-size: 14px; animation: drift-left 1.6s ease-in-out infinite; }
  .h.right { right: 6px; top: 45%; font-size: 14px; animation: drift-right 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.55; } }
  @keyframes drift-left { 0%, 100% { transform: translateX(6px); opacity: 1; } 60% { transform: translateX(-4px); opacity: 0.5; } }
  @keyframes drift-right { 0%, 100% { transform: translateX(-6px); opacity: 1; } 60% { transform: translateX(4px); opacity: 0.5; } }
  @media (prefers-reduced-motion: reduce) { .h.left, .h.right { animation: pulse 1.6s ease-in-out infinite; } }
</style>
