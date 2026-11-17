<script lang="ts">
  /** Lightweight canvas confetti, about two seconds (README §8.2). */
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
    const parts = Array.from({ length: 180 }, () => ({
      x: innerWidth / 2, y: innerHeight * 0.4, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 5,
      s: 8 + Math.random() * 9, c: colors[Math.floor(Math.random() * colors.length)], r: Math.random() * 6,
    }));
    const t0 = performance.now();
    const frame = (t: number) => {
      const k = (t - t0) / 1800;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      if (k >= 1) return;
      for (const p of parts) {
        p.x += p.vx * 0.75; p.y += p.vy * 0.75; p.vy += 0.22; p.vx *= 0.99; p.r += 0.12;
        ctx.globalAlpha = k < 0.6 ? 1 : (1 - k) / 0.4;
        ctx.fillStyle = p.c;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  $effect(() => { if (fire > 0) burst(); });
</script>

<canvas bind:this={canvas} aria-hidden="true" data-testid="confetti" data-fired={fire}></canvas>

<style>
  canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 80; }
</style>
