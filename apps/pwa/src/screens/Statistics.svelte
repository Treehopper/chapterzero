<script lang="ts">
  /** Full-screen session statistics (C14, E3, G6); milestone celebrations play here (E5). */
  import { onMount } from 'svelte';
  import type { SessionStatistics } from '@vocabfirst/core';
  import { api } from '../lib/api';
  import { go } from '../lib/router.svelte';
  import { fmt, pct } from '../lib/ui.svelte';
  import Ring from '../components/Ring.svelte';
  import Boxes from '../components/Boxes.svelte';
  import Confetti from '../components/Confetti.svelte';
  import StartStudy from '../components/StartStudy.svelte';

  let { sessionId }: { sessionId: string } = $props();
  let s = $state<SessionStatistics>();
  let revealed = $state(0);
  let fire = $state(0);
  let error = $state('');
  let starting = $state(false);

  onMount(async () => {
    try {
      s = await api.study.statistics(sessionId);
      // only what was done in this session: coverage gained elsewhere (re-filter, Words) is no reason
      const graded = s.session.reviewed + s.session.alreadyKnown > 0;
      const celebrate = graded && (s.perfect || s.achievements.some((a) => a.tier === 'gold') || (s.coverage.chapter && s.coverage.chapter.before < s.book.coverageTarget && s.coverage.chapter.after >= s.book.coverageTarget));
      if (celebrate) setTimeout(() => fire++, 300);
      const t = setInterval(() => { if (!s || revealed >= s.achievements.length) clearInterval(t); else revealed++; }, 450);
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  });

  const dur = (sec: number) => (sec < 60 ? `${sec} s` : `${Math.floor(sec / 60)} min ${sec % 60} s`);
  const medal = (t?: string) => (t === 'gold' ? '🥇' : t === 'silver' ? '🥈' : t === 'bronze' ? '🥉' : '🏅');
</script>

<Confetti {fire} />
<main class="screen stats" data-testid="statistics">
  {#if error}<p class="error">{error}</p>{/if}
  {#if s}
    <h1 class="title">Session complete</h1>
    <section class="card-box hero">
      <Ring value={s.session.firstTryAccuracy} size={120} stroke={12} label={pct(s.session.firstTryAccuracy, 0)} sublabel="first try" color="var(--good)" />
      <div class="stack figures">
        <div><strong data-testid="stat-reviewed">{s.session.reviewed}</strong> {s.session.reviewed === 1 ? 'card' : 'cards'} reviewed</div>
        {#if s.session.promoted}<div class="up"><strong>{s.session.promoted}</strong> {s.session.promoted === 1 ? 'card' : 'cards'} moved up a box</div>{/if}
        {#if s.session.removed}<div><strong>{s.session.removed}</strong> removed</div>{/if}
        <div class="muted small">{dur(s.session.durationSec)}</div>
      </div>
    </section>
    {#if s.session.alreadyKnown}
      <p class="known" data-testid="stat-known">{s.session.alreadyKnown} {s.session.alreadyKnown === 1 ? 'word' : 'words'} you already knew {s.session.alreadyKnown === 1 ? 'was' : 'were'} removed.</p>
    {/if}

    <div class="section-title">Overall</div>
    <div class="card-box stack">
      {#if s.coverage.chapter}
        <div class="row"><span class="spacer">{s.coverage.chapter.displayTitle}</span>
          <strong>{pct(s.coverage.chapter.before)} → {pct(s.coverage.chapter.after)}</strong></div>
      {/if}
      <div class="row"><span class="spacer">{s.book.title}</span><strong>{pct(s.coverage.book.before)} → {pct(s.coverage.book.after)}</strong></div>
      <div class="small muted">estimated coverage{s.book.unknownEvery ? ` · one unknown word every ${s.book.unknownEvery}` : ''}</div>
    </div>
    <div class="section-title">Boxes</div>
    <Boxes boxes={s.book.boxes} moved={s.session.promoted} />
    <div class="card-box row streak">
      <span>🔥 <strong>{s.overall.streakDays}</strong> <span class="small muted">day streak · best {s.overall.longestStreak}</span></span>
      <span class="spacer"></span>
      <Ring value={s.overall.reviewsToday / s.overall.dailyGoal} size={60} stroke={6} label={String(s.overall.reviewsToday)} sublabel="/ {s.overall.dailyGoal}" color="var(--good)" />
    </div>
    <p class="small muted">{fmt(s.overall.wordsLearnedAllBooks)} words learned across all books.</p>

    {#if s.achievements.length}
      <div class="section-title">Achievements unlocked</div>
      <div class="medals">
        {#each s.achievements.slice(0, revealed) as a (a.achievementId + (a.tier ?? ''))}
          <div class="medal {a.tier}"><span>{medal(a.tier)}</span><strong>{a.name}</strong><span class="small muted">{a.tier ?? ''}</span></div>
        {/each}
      </div>
    {/if}

    <div class="cta row">
      <button class="btn spacer" onclick={() => (starting = true)} data-testid="study-more">Study more</button>
      <button class="btn primary spacer" onclick={() => go('book', s!.bookId)} data-testid="done">Done</button>
    </div>
  {:else if !error}<p class="muted">Loading…</p>{/if}
</main>

{#if starting && s}<StartStudy bookId={s.bookId} due={s.book.due} onclose={() => (starting = false)} />{/if}

<style>
  .title { font-family: var(--serif); font-size: 28px; margin: 12px 0 16px; }
  .hero { display: flex; gap: 20px; align-items: center; }
  .figures { gap: 6px; }
  .figures strong { font-size: 20px; }
  .up strong { color: var(--good); }
  .known { background: color-mix(in srgb, var(--good) 12%, transparent); padding: 12px 14px; border-radius: 12px; }
  .left { text-align: left; padding-left: 0; }
  .streak { margin-top: 12px; }
  .medals { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
  .medal { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px; border-radius: 14px; background: var(--surface);
    border: 2px solid var(--line); animation: pop .35s ease both; text-align: center; }
  .medal span:first-child { font-size: 34px; }
  .medal.gold { border-color: var(--gold); } .medal.silver { border-color: var(--silver); } .medal.bronze { border-color: var(--bronze); }
  @keyframes pop { from { transform: scale(.6); opacity: 0; } to { transform: none; opacity: 1; } }
  .cta { position: sticky; bottom: 0; margin: 20px -16px 0; padding: 12px 16px calc(var(--safe-bottom) + 8px);
    background: linear-gradient(transparent, var(--bg) 30%); }
</style>
