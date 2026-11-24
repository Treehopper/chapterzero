<script lang="ts">
  /** Full-screen session statistics (C14, E3, G6); milestone celebrations play here (E5). */
  import { onMount } from 'svelte';
  import type { SessionStatistics } from '@chapterzero/core';
  import { api } from '../lib/api';
  import { go } from '../lib/router.svelte';
  import { achievementName, fmt, pct, tierName, ui } from '../lib/ui.svelte';
  import { t, tn } from '../lib/i18n/index.svelte';
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
  /** one flame per day of the streak; a long one is summed up after the first rows */
  const MAX_FLAMES = 30;
  /** coverage gained, in percentage points; nothing for no gain */
  const gain = (before: number, after: number) => (after - before >= 0.0005 ? `+${pct(after - before)}` : '');
  const left = (n: number) => (n ? tn(n, '{n} card left until ready to read', '{n} cards left until ready to read') : t('Ready to read'));
  const medal = (tier?: string) => (tier === 'gold' ? '🥇' : tier === 'silver' ? '🥈' : tier === 'bronze' ? '🥉' : '🏅');
</script>

<Confetti {fire} />
<main class="screen stats" data-testid="statistics">
  {#if error}<p class="error">{t(error)}</p><button class="btn" onclick={() => go('library')} data-testid="stats-back">{t('To the library')}</button>{/if}
  {#if s}
    <h1 class="title">{t('Session complete')}</h1>
    {@const goalMet = s.overall.reviewsToday >= s.overall.dailyGoal}
    <!-- what was earned comes first: no scrolling to find it -->
    <section class="card-box stack today">
      {#if ui.achievements && s.overall.streakDays > 0}
        <div class="stack" data-testid="stat-streak">
          <div class="flames" aria-hidden="true">
            {#each Array(Math.min(s.overall.streakDays, MAX_FLAMES)) as _, i (i)}<span class="flame" class:now={i === Math.min(s.overall.streakDays, MAX_FLAMES) - 1} class:blue={goalMet && i === Math.min(s.overall.streakDays, MAX_FLAMES) - 1}>🔥</span>{/each}
            {#if s.overall.streakDays > MAX_FLAMES}<span class="more small muted">+{s.overall.streakDays - MAX_FLAMES}</span>{/if}
          </div>
          <div><strong>{t('{n}-day streak', { n: s.overall.streakDays })}</strong>
            <span class="small muted"> · {s.overall.streakDays >= s.overall.longestStreak ? t('your best yet') : t('best {n} days', { n: s.overall.longestStreak })}</span></div>
        </div>
      {/if}
      {#if goalMet}
        <div class="goal-met" data-testid="stat-goal">{t('Daily goal reached: {n} of {goal} reviews', { n: s.overall.reviewsToday, goal: s.overall.dailyGoal })}</div>
      {:else}
        <div class="stack goal" data-testid="stat-goal">
          <span class="small">{t('{n} of {goal} reviews today', { n: s.overall.reviewsToday, goal: s.overall.dailyGoal })}</span>
          <div class="progressbar"><div style:width="{(s.overall.reviewsToday / s.overall.dailyGoal) * 100}%"></div></div>
        </div>
      {/if}
    </section>
    {#if ui.achievements && s.achievements.length}
      <div class="medals" data-testid="stat-achievements">
        {#each s.achievements.slice(0, revealed) as a (a.achievementId + (a.tier ?? ''))}
          <div class="medal {a.tier}"><span>{medal(a.tier)}</span><strong>{achievementName(a)}</strong><span class="small muted">{a.tier ? tierName(a.tier) : ''}</span></div>
        {/each}
      </div>
    {/if}

    <section class="card-box stack figures">
      <div><strong class="big" data-testid="stat-reviewed">{s.session.reviewed}</strong> {tn(s.session.reviewed, 'card reviewed', 'cards reviewed')}
        <span class="small muted"> · {dur(s.session.durationSec)}</span></div>
      {#if s.session.firstTryCorrect}<div class="up" data-testid="stat-first-try">{t('{n} right on the first try', { n: s.session.firstTryCorrect })}</div>{/if}
      {#if s.session.promoted}<div class="up">{tn(s.session.promoted, '{n} card moved up a box', '{n} cards moved up a box')}</div>{/if}
      {#if s.session.removed}<div>{t('{n} removed', { n: s.session.removed })}</div>{/if}
    </section>
    {#if s.session.alreadyKnown}
      <p class="known" data-testid="stat-known">{tn(s.session.alreadyKnown, '{n} word you already knew will not be asked again.', '{n} words you already knew will not be asked again.')}</p>
    {/if}

    <div class="section-title">{t('Overall')}</div>
    <div class="card-box stack">
      <div class="row"><span class="spacer">{t('Learned in this session')}</span><strong data-testid="stat-learned">{tn(s.session.learned, '{n} card', '{n} cards')}</strong></div>
      {#if s.coverage.chapter}
        <div class="row"><span class="spacer">{s.coverage.chapter.displayTitle}</span>
          <strong>{pct(s.coverage.chapter.after)}</strong>{#if gain(s.coverage.chapter.before, s.coverage.chapter.after)}<span class="gain" data-testid="stat-chapter-gain">{gain(s.coverage.chapter.before, s.coverage.chapter.after)}</span>{/if}</div>
        {#if s.left.chapter !== undefined}<div class="small muted left" data-testid="stat-chapter-left">{left(s.left.chapter)}</div>{/if}
      {/if}
      <div class="row"><span class="spacer">{s.book.title}</span>
        <strong>{pct(s.coverage.book.after)}</strong>{#if gain(s.coverage.book.before, s.coverage.book.after)}<span class="gain" data-testid="stat-book-gain">{gain(s.coverage.book.before, s.coverage.book.after)}</span>{/if}</div>
      <div class="small muted left" data-testid="stat-book-left">{left(s.left.book)}</div>
      <div class="small muted">{t('estimated coverage')}{s.book.unknownEvery ? ` · ${t('one unknown word every {n}', { n: s.book.unknownEvery })}` : ''}</div>
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
  .today { gap: 10px; margin-bottom: 12px; }
  .flames { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 2px; font-size: 22px; line-height: 1; }
  .flame.now { font-size: 30px; }
  /* the daily goal reached: today's flame burns blue, and bigger */
  .flame.blue { font-size: 40px; filter: hue-rotate(185deg) saturate(1.6); }
  .more { align-self: center; margin-left: 4px; }
  .today strong { font-size: 20px; }
  .goal-met { font-weight: 600; }
  .goal { gap: 6px; }
  .figures { gap: 6px; }
  .figures .big { font-size: 28px; }
  .up { color: var(--good); font-weight: 600; }
  .gain { color: var(--good); font-weight: 700; margin-left: 8px; min-width: 0; }
  .left { margin-top: -6px; }
  .known { background: color-mix(in srgb, var(--good) 12%, transparent); padding: 12px 14px; border-radius: 12px; }
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
