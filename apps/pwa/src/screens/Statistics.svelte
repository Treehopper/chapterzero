<script lang="ts">
  /** Full-screen session statistics (C14, E3, G6); milestone celebrations play here (E5). */
  import { onMount } from 'svelte';
  import type { SessionStatistics } from '@vocabfirst/core';
  import { api } from '../lib/api';
  import { go } from '../lib/router.svelte';
  import { achievementName, fmt, pct, tierName, ui } from '../lib/ui.svelte';
  import { t, tn } from '../lib/i18n/index.svelte';
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
      const celebrate = graded && (s.perfect || (ui.achievements && s.achievements.some((a) => a.tier === 'gold')) || (s.coverage.chapter && s.coverage.chapter.before < s.book.coverageTarget && s.coverage.chapter.after >= s.book.coverageTarget));
      if (celebrate) setTimeout(() => fire++, 300);
      const timer = setInterval(() => { if (!s || revealed >= s.achievements.length) clearInterval(timer); else revealed++; }, 450);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      // a relaunch must not come back to a dead end
      void api.appState.update({ lastRoute: '' });   // not undefined: that would not survive the trip to the worker
    }
  });

  const dur = (sec: number) => (sec < 60 ? `${sec} s` : `${Math.floor(sec / 60)} min ${sec % 60} s`);
  const medal = (tier?: string) => (tier === 'gold' ? '🥇' : tier === 'silver' ? '🥈' : tier === 'bronze' ? '🥉' : '🏅');
</script>

<Confetti {fire} />
<main class="screen stats" data-testid="statistics">
  {#if error}<p class="error">{t(error)}</p><button class="btn" onclick={() => go('library')} data-testid="stats-back">{t('To the library')}</button>{/if}
  {#if s}
    <h1 class="title">{t('Session complete')}</h1>
    {#if ui.achievements}
      <!-- what was earned comes first: no scrolling to find it -->
      {#if s.overall.streakDays > 0}
        <section class="card-box row streak" data-testid="stat-streak">
          <span class="flame">🔥</span>
          <span class="stack"><strong>{t('{n}-day streak', { n: s.overall.streakDays })}</strong>
            <span class="small muted">{s.overall.streakDays >= s.overall.longestStreak ? t('your best yet') : t('best {n} days', { n: s.overall.longestStreak })}</span></span>
        </section>
      {/if}
      {#if s.achievements.length}
        <div class="medals" data-testid="stat-achievements">
          {#each s.achievements.slice(0, revealed) as a (a.achievementId + (a.tier ?? ''))}
            <div class="medal {a.tier}"><span>{medal(a.tier)}</span><strong>{achievementName(a)}</strong><span class="small muted">{a.tier ? tierName(a.tier) : ''}</span></div>
          {/each}
        </div>
      {/if}
    {/if}
    <section class="card-box hero">
      <Ring value={s.session.firstTryAccuracy} size={120} stroke={12} label={pct(s.session.firstTryAccuracy, 0)} sublabel={t('first try')} color="var(--good)" />
      <div class="stack figures">
        <div><strong data-testid="stat-reviewed">{s.session.reviewed}</strong> {tn(s.session.reviewed, 'card reviewed', 'cards reviewed')}</div>
        {#if s.session.promoted}<div class="up"><strong>{s.session.promoted}</strong> {tn(s.session.promoted, 'card moved up a box', 'cards moved up a box')}</div>{/if}
        {#if s.session.removed}<div><strong>{s.session.removed}</strong> {t('removed')}</div>{/if}
        <div class="muted small">{dur(s.session.durationSec)}</div>
      </div>
    </section>
    {#if s.session.alreadyKnown}
      <p class="known" data-testid="stat-known">{tn(s.session.alreadyKnown, '{n} word you already knew was removed.', '{n} words you already knew were removed.')}</p>
    {/if}

    <div class="section-title">{t('Overall')}</div>
    <div class="card-box stack">
      {#if s.coverage.chapter}
        <div class="row"><span class="spacer">{s.coverage.chapter.displayTitle}</span>
          <strong>{pct(s.coverage.chapter.before)} → {pct(s.coverage.chapter.after)}</strong></div>
      {/if}
      <div class="row"><span class="spacer">{s.book.title}</span><strong>{pct(s.coverage.book.before)} → {pct(s.coverage.book.after)}</strong></div>
      <div class="small muted">{t('estimated coverage')}{s.book.unknownEvery ? ` · ${t('one unknown word every {n}', { n: s.book.unknownEvery })}` : ''}</div>
    </div>
    <div class="section-title">{t('Boxes')}</div>
    <Boxes boxes={s.book.boxes} moved={s.session.promoted} />
    <div class="card-box row goal">
      <span class="small muted">{t('Reviews today')}</span>
      <span class="spacer"></span>
      <Ring value={s.overall.reviewsToday / s.overall.dailyGoal} size={60} stroke={6} label={String(s.overall.reviewsToday)} sublabel="/ {s.overall.dailyGoal}" color="var(--good)" />
    </div>
    <p class="small muted">{t('{n} words learned across all books.', { n: fmt(s.overall.wordsLearnedAllBooks) })}</p>

    <div class="cta row">
      <button class="btn spacer" onclick={() => (starting = true)} data-testid="study-more">{t('Keep going')}</button>
      <button class="btn primary spacer" onclick={() => go('book', s!.bookId)} data-testid="done">{t('Done')}</button>
    </div>
  {:else if !error}<p class="muted">{t('Loading…')}</p>{/if}
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
  .streak { gap: 14px; margin-bottom: 12px; border-color: color-mix(in srgb, var(--bronze) 60%, var(--line)); }
  .streak .flame { font-size: 34px; }
  .streak strong { font-size: 20px; }
  .goal { margin-top: 12px; }
  .medals { margin-bottom: 12px; }
  .medals { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
  .medal { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px; border-radius: 14px; background: var(--surface);
    border: 2px solid var(--line); animation: pop .35s ease both; text-align: center; }
  .medal span:first-child { font-size: 34px; }
  .medal.gold { border-color: var(--gold); } .medal.silver { border-color: var(--silver); } .medal.bronze { border-color: var(--bronze); }
  @keyframes pop { from { transform: scale(.6); opacity: 0; } to { transform: none; opacity: 1; } }
  .cta { position: sticky; bottom: 0; margin: 20px -16px 0; padding: 12px 16px calc(var(--safe-bottom) + 8px);
    background: linear-gradient(transparent, var(--bg) 30%); }
</style>
