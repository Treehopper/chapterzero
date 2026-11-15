<script lang="ts">
  /** Lightweight canvas confetti, under one second (README §8.2). */
  let { fire = 0 }: { fire?: number } = $props();
  let canvas: HTMLCanvasElement;

  function burst() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = devicePixelRatio || 1;
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const colors = ['#d4a72c', '#4f46e5', '#1f9d55', '#d64545', '#a8b0b8'];
    const parts = Array.from({ length: 90 }, () => ({
      x: innerWidth / 2, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 12 - 4,
      s: 4 + Math.random() * 5, c: colors[Math.floor(Math.random() * colors.length)], r: Math.random() * 6,
    }));
    const t0 = performance.now();
    const frame = (t: number) => {
      const k = (t - t0) / 900;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      if (k >= 1) return;
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.45; p.r += 0.2;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = p.c;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  $effect(() => { if (fire > 0) burst(); });
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
  canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 80; }
</style>
