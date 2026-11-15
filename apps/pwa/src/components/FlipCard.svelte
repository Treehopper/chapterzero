<script lang="ts">
  /** The study card: 3D flip, drag with rotation and green/red tint (C1, C2, §8.1). */
  import type { Snippet } from 'svelte';
  let { flipped, dx = 0, fly = 0, dim = false, review = false, entering = false, front, back, label = '' }: {
    flipped: boolean; dx?: number; fly?: -1 | 0 | 1; dim?: boolean; review?: boolean; entering?: boolean;
    front: Snippet; back: Snippet; label?: string;
  } = $props();
  const width = () => Math.min(innerWidth * 0.88, 440);
  const tint = $derived(Math.max(-1, Math.min(1, dx / (width() * 0.3))));
  const x = $derived(fly ? fly * (innerWidth + 200) : dx);
  const rot = $derived(x * 0.05);
</script>

<div class="wrap" class:dim class:entering style:transform="translateX({x}px) rotate({rot}deg)" class:dragging={dx !== 0 && !fly} class:flying={fly !== 0}
  aria-label={label}>
  <div class="inner" class:flipped>
    <div class="face front" class:review>{@render front()}</div>
    <div class="face back" class:review>{@render back()}</div>
  </div>
  {#if tint !== 0}
    <div class="tint" style:opacity={Math.abs(tint) * 0.9} class:good={tint > 0} class:bad={tint < 0} aria-hidden="true">
      <span>{tint > 0 ? '✓' : '✗'}</span>
    </div>
  {/if}
</div>

<style>
  .wrap { position: relative; width: min(88vw, 440px); height: min(62dvh, 560px); transition: transform 0.28s cubic-bezier(.2,.8,.2,1), opacity 0.2s;
    will-change: transform; touch-action: none; }
  .wrap.dragging { transition: none; }
  .wrap.flying { transition: transform 0.3s ease-in; }
  .wrap.dim { opacity: 0.4; }
  .wrap.entering { animation: enter 0.25s ease-out; }
  @keyframes enter { from { transform: scale(0.92); opacity: 0.4; } to { transform: none; opacity: 1; } }
  .inner { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform 0.3s ease; }
  .inner.flipped { transform: rotateY(180deg); }
  .face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; background: var(--card); border-radius: 24px;
    box-shadow: var(--card-shadow); padding: 28px 24px; display: flex; flex-direction: column; overflow: hidden; }
  .front { transform: rotateY(0deg); }
  .back { transform: rotateY(180deg); }
  /* swap faces at the 90° midpoint of the flip, independent of backface-visibility support */
  .front, .back { transition: visibility 0s linear 0.15s; }
  .back, .inner.flipped .front { visibility: hidden; }
  .inner.flipped .back { visibility: visible; }
  .face.review { border-top: 6px solid var(--bad); }
  .tint { position: absolute; inset: 0; border-radius: 24px; display: grid; place-items: center; pointer-events: none; font-size: 72px; font-weight: 800; color: white; }
  .tint.good { background: color-mix(in srgb, var(--good) 55%, transparent); }
  .tint.bad { background: color-mix(in srgb, var(--bad) 55%, transparent); }
  @media (prefers-reduced-motion: reduce) {
    .inner { transition: none; }
    .inner.flipped { transform: none; }
    .inner.flipped .front { opacity: 0; }
    .front { transform: none; }
    .back { transform: none; opacity: 0; }
    .inner.flipped .back { opacity: 1; }
  }
</style>
