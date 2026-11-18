<script lang="ts">
  /** Gesture hints over a flip card (C13): each hint goes away once its gesture has been used. */
  let { flipped, used, grade = true, extra = false }: {
    flipped: boolean; used: Set<string>; grade?: boolean; extra?: boolean;
  } = $props();
</script>

<div class="hints" aria-hidden="true" data-testid="hints">
  {#if !flipped && !used.has('tap')}<div class="h mid">◉ tap to flip</div>{/if}
  {#if flipped && grade}
    {#if !used.has('left')}<div class="h left" data-testid="hint-left">✗<br />didn't<br />know</div>{/if}
    {#if !used.has('right')}<div class="h right" data-testid="hint-right">✓<br />knew<br />it</div>{/if}
  {/if}
  {#if extra && !used.has('up')}<div class="h bottom" data-testid="hint-up">↑ swipe up for more:<br /><span class="sub">edit card · translation makes no sense · finish</span></div>{/if}
</div>

<style>
  .hints { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,.5) 75%); color: white; font-weight: 700; }
  .h { position: absolute; text-align: center; font-size: 15px; text-shadow: 0 1px 4px rgba(0,0,0,.6); animation: pulse 1.6s ease-in-out infinite; }
  .h.bottom { bottom: calc(var(--safe-bottom) + 40px); left: 0; right: 0; font-size: 16px; }
  .sub { font-size: 13px; font-weight: 600; }
  .h.mid { top: 70%; left: 0; right: 0; }
  .h.left { left: 4px; top: 45%; font-size: 13px; }
  .h.right { right: 4px; top: 45%; font-size: 13px; }
  @keyframes pulse { 50% { opacity: 0.55; } }
</style>
