<script lang="ts">
  /** Achievements (G5): unlocked tiers with date, locked ones with progress. */
  import { onMount } from 'svelte';
  import type { AchievementView } from '@vocabfirst/core';
  import { api } from '../lib/api';
  import { go } from '../lib/router.svelte';
  let list = $state<AchievementView[]>([]);
  onMount(async () => { list = await api.achievements.list(); });
  const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : '');
  const icon = { bronze: '🥉', silver: '🥈', gold: '🥇' } as const;
</script>

<main class="screen">
  <header class="topbar"><button class="iconbtn" aria-label="Back" onclick={() => go('library')}>‹</button><h1>Achievements</h1></header>
  <div class="grid">
    {#each list as a (a.id)}
      {@const top = [...a.tiers].reverse().find((t) => t.unlockedAt)}
      <article class="tile card-box" class:locked={!top} data-testid="achievement">
        {#if a.bookId && a.coverDataUrl}<img src={a.coverDataUrl} alt="" class="cover" />{/if}
        <div class="medal" aria-hidden="true">{top ? icon[top.tier] : '🔒'}</div>
        <strong>{a.name}</strong>
        <span class="small muted">{a.description}</span>
        <div class="tiers">
          {#each a.tiers as t (t.tier)}
            <span class="tier {t.tier}" class:on={!!t.unlockedAt} title={t.unlockedAt ? `${t.tier} · ${date(t.unlockedAt)}` : `${t.threshold}`}>
              {a.tiers.length > 1 ? t.threshold : ''}{t.unlockedAt ? ' ✓' : ''}
            </span>
          {/each}
        </div>
        {#if a.next}
          <div class="progressbar"><div style:width="{Math.min(100, (a.value / a.next.threshold) * 100)}%"></div></div>
          <span class="small muted">{Math.min(a.value, a.next.threshold)} / {a.next.threshold}</span>
        {:else if top}<span class="small muted">{date(top.unlockedAt)}</span>{/if}
      </article>
    {/each}
  </div>
</main>

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
  .tile { display: flex; flex-direction: column; gap: 6px; align-items: center; text-align: center; }
  .locked { opacity: 0.6; }
  .locked .medal { filter: grayscale(1); }
  .medal { font-size: 40px; }
  .cover { width: 40px; height: 60px; object-fit: cover; border-radius: 4px; }
  .tiers { display: flex; gap: 4px; }
  .tier { font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 999px; background: var(--surface-2); color: var(--muted); min-width: 20px; min-height: 18px; }
  .tier.on.bronze { background: var(--bronze); color: white; }
  .tier.on.silver { background: var(--silver); color: #111; }
  .tier.on.gold { background: var(--gold); color: #111; }
  .progressbar { width: 100%; }
</style>
