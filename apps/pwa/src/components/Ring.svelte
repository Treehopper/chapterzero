<script lang="ts">
  /** Progress ring (coverage, accuracy, daily goal). */
  let { value, size = 96, stroke = 10, color = 'var(--accent)', label = '', sublabel = '', mark }: {
    value: number; size?: number; stroke?: number; color?: string; label?: string; sublabel?: string; mark?: number;
  } = $props();
  const r = $derived((size - stroke) / 2);
  const c = $derived(2 * Math.PI * r);
  const v = $derived(Math.max(0, Math.min(1, value)));
  const markAngle = $derived(mark === undefined ? 0 : mark * 360 - 90);
</script>

<div class="ring" style:width="{size}px" style:height="{size}px" role="img" aria-label="{label} {sublabel}">
  <svg width={size} height={size} viewBox="0 0 {size} {size}">
    <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="var(--surface-2)" stroke-width={stroke} />
    <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke={color} stroke-width={stroke} stroke-linecap="round"
      stroke-dasharray="{c * v} {c}" transform="rotate(-90 {size / 2} {size / 2})" style="transition: stroke-dasharray .6s ease" />
    {#if mark !== undefined}
      <line x1={size / 2} y1={stroke / 2 - 3} x2={size / 2} y2={stroke * 1.5 + 2} stroke="var(--text)" stroke-width="2"
        transform="rotate({markAngle + 90} {size / 2} {size / 2})" />
    {/if}
  </svg>
  <div class="center">
    <strong style:font-size="{Math.round(size / 5.2)}px">{label}</strong>
    {#if sublabel}<span>{sublabel}</span>{/if}
  </div>
</div>

<style>
  .ring { position: relative; flex: none; }
  .center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; line-height: 1.1; }
  .center span { font-size: 11px; color: var(--muted); }
</style>
