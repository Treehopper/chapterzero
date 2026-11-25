<script lang="ts">
  /** Vocabulary check (H1–H3): why it is asked, 60 words in the study card UI, then the result screen; or the level picked by hand. */
  import { onMount } from 'svelte';
  import { DEFAULT_CUTOFF, headword, levelCutoff, LEVELS, startLevel, type CalibrationView } from '@chapterzero/core';
  import { api } from '../lib/api';
  import { go } from '../lib/router.svelte';
  import { gestures } from '../lib/gestures';
  import { fmt, ui } from '../lib/ui.svelte';
  import FlipCard from '../components/FlipCard.svelte';
  import LookupLinks from '../components/LookupLinks.svelte';
  import GestureHints from '../components/GestureHints.svelte';
  import FrontSwipeConfirm from '../components/FrontSwipeConfirm.svelte';
  import { languageName, t, textAttrs } from '../lib/i18n/index.svelte';

  let view = $state<CalibrationView>();
  let flipped = $state(false);
  let dx = $state(0);
  let fly = $state<-1 | 0 | 1>(0);
  let busy = $state(false);
  let result = $state<{ cutoffRank: number; level: number }>();
  let adjust = $state(false);
  let cutoff = $state(8000);
  let books = $state(0);
  /** before the first word: what the check is for, or skip it and pick the level by hand */
  let intro = $state(false);
  let pick = $state(false);
  let picked = $state(startLevel(DEFAULT_CUTOFF));
  // the check is the first place a learner swipes, so it shows the gesture hints until each gesture was used
  let hints = $state(false);
  let used = $state<Set<string>>(new Set());
  const useHint = (h: string) => { if (!used.has(h)) used = new Set([...used, h]); };
  /** the back of this word was shown once: a swipe on the front grades (no question, no nudge) */
  let seen = $state(false);
  function flip() { flipped = !flipped; if (flipped) seen = true; useHint('tap'); }
  const showHints = $derived(hints && !['tap', 'left', 'right'].every((h) => used.has(h)));

  // a swipe before the flip grades only when "Flip before grading" is off; the first one asks (once)
  let requireFlip = $state(true);
  let frontSwipeAsked = $state(true);
  let askFront = $state<1 | -1>();
  let nudge = $state(false);
  const swipeable = $derived(flipped || seen || !requireFlip || !frontSwipeAsked);

  let error = $state('');
  onMount(async () => {
    try {
      const restart = location.hash.endsWith('/restart');
      view = restart ? await api.calibration.restart() : await api.calibration.startOrResume();
      if (restart) history.replaceState(null, '', '#/check');
      intro = !restart && view.position === 0;
      books = (await api.books.list()).length;
      const [settings, app] = await Promise.all([api.settings.get(), api.appState.get()]);
      hints = settings.gestureHints === 'everySession';
      requireFlip = settings.requireFlipBeforeGrade;
      frontSwipeAsked = !!app.frontSwipeAsked;
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  });

  function swipe(dir: 1 | -1) {
    if (flipped || seen || !requireFlip) return void answer(dir === 1, true);
    dx = 0;
    if (!frontSwipeAsked) askFront = dir;
    else { nudge = true; setTimeout(() => (nudge = false), 400); }
  }

  async function frontSwipeAnswer(yes: boolean) {
    const dir = askFront!;
    askFront = undefined;
    frontSwipeAsked = true;
    await api.appState.update({ frontSwipeAsked: true });
    if (!yes) { nudge = true; setTimeout(() => (nudge = false), 400); return; }
    requireFlip = (await api.settings.update({ requireFlipBeforeGrade: false })).requireFlipBeforeGrade;
    await answer(dir === 1, true);
  }

  async function answer(known: boolean, fromFront = false) {
    if (busy || !view?.word) return;
    if (!flipped && !seen && !(fromFront && !requireFlip)) { flip(); return; }
    useHint(known ? 'right' : 'left');
    busy = true;
    fly = known ? 1 : -1;
    const next = await api.calibration.answer(known);
    await new Promise((r) => setTimeout(r, 180));
    fly = 0; dx = 0; flipped = false; seen = false;
    view = next;
    if (next.result) { result = next.result; cutoff = next.result.cutoffRank; }
    busy = false;
  }

  /** a specialist term not even known in German: swap it for another word, uncounted */
  async function replaceWord() {
    if (busy) return;
    busy = true;
    try {
      view = await api.calibration.replaceWord();
      flipped = false; seen = false; dx = 0;
      if (view.result) { result = view.result; cutoff = view.result.cutoffRank; }
    } finally { busy = false; }
  }

  function skip() { picked = startLevel(result?.cutoffRank ?? DEFAULT_CUTOFF); pick = true; }
  async function useLevel() {
    await api.calibration.skip();
    await api.calibration.setCutoff(levelCutoff(picked));
    go('library');
  }
  async function use() {
    if (adjust && result && cutoff !== result.cutoffRank) await api.calibration.setCutoff(cutoff);
    go('library');
  }
  async function repeat() {
    result = undefined;
    view = await api.calibration.restart();
  }
  function key(e: KeyboardEvent) {
    if (result || intro || pick) return;
    if (e.key === ' ') { e.preventDefault(); flip(); }
    else if (e.key === 'ArrowRight') void answer(true);
    else if (e.key === 'ArrowLeft') void answer(false);
  }
  const level = $derived(startLevel(cutoff));
  const rankParts = $derived(t("Words more common than rank {rank} won't become cards.").split('{rank}'));
</script>

<svelte:window onkeydown={key} />

{#if pick}
  <main class="screen stack" data-testid="level-pick">
    <h1>{t('Choose your level')}</h1>
    <p>{t('Words above your level become cards; the more common ones count as known. Not sure? Start with 5.')}</p>
    <div class="levels pickable" role="radiogroup" aria-label={t('Level')}>
      {#each LEVELS as l (l.level)}
        <button role="radio" aria-checked={l.level === picked} aria-label={t('Level {n}', { n: l.level })}
          class:skip={l.level < picked} class:here={l.level === picked} onclick={() => (picked = l.level)}>{l.level}</button>
      {/each}
    </div>
    <p class="center">{rankParts[0]}<strong data-testid="pick-cutoff">{fmt(levelCutoff(picked))}</strong>{rankParts[1] ?? ''}</p>
    <p class="small muted center">{t('Too many easy cards, or too many hard ones? Change the level for a book on its page, or take the check later from Settings.')}</p>
    <div class="spacer"></div>
    <button class="btn primary block" data-testid="level-use" onclick={useLevel}>{t('Use level {n}', { n: picked })}</button>
    {#if view?.word}<button class="btn block" onclick={() => (pick = false)}>{t('Back to the check')}</button>{/if}
  </main>
{:else if intro && view?.word}
  <main class="screen stack" data-testid="check-intro">
    <h1>{t('Your level first')}</h1>
    <p>{t('Chapter 0 makes cards only for the words of a book you don’t know yet. To leave out the ones you know, it needs your level.')}</p>
    <p>{t('The check shows 60 words, from very common to rare. For each, say whether you knew it. That takes about two minutes and saves you flipping hundreds of cards you would only swipe away.')}</p>
    <p class="small muted">{t('You can change your level any time.')}</p>
    <div class="spacer"></div>
    <button class="btn primary block" data-testid="check-start" onclick={() => (intro = false)}>{t('Start the check')}</button>
    <button class="btn block" data-testid="check-own-level" onclick={skip}>{t('Set my level myself')}</button>
  </main>
{:else if result}
  <main class="screen stack result" data-testid="check-result">
    <h1 class="muted center small up">{t('Your {language} level', { language: languageName(ui.pair.source) })}</h1>
    <div class="big center">{t('You start at level')} <span data-testid="start-level">{level}</span></div>
    <div class="levels" aria-hidden="true">
      {#each LEVELS as l (l.level)}
        <span class:skip={l.level < level} class:here={l.level === level}>{l.level}</span>
      {/each}
    </div>
    <p class="center">{rankParts[0]}<strong data-testid="cutoff">{fmt(cutoff)}</strong>{rankParts[1] ?? ''}
      {#if level > 1}{t('Levels 1–{n} are skipped.', { n: level - 1 })}{/if}</p>
    <p class="center small muted">{t('Words just above it that you already know are retired after one swipe.')}</p>
    {#if adjust}
      <label class="stack small">{t('Adjust')}
        <input type="range" min="2000" max="60000" step="500" bind:value={cutoff} list="level-marks" aria-label={t('Cutoff rank')} />
        <datalist id="level-marks">{#each LEVELS as l (l.level)}<option value={l.from - 1}></option>{/each}</datalist>
      </label>
    {/if}
    <div class="spacer"></div>
    <button class="btn primary block" onclick={use}>{t('Use this')}</button>
    <div class="row">
      <button class="btn spacer" onclick={() => (adjust = !adjust)}>{adjust ? t('Hide') : t('Adjust')}</button>
      <button class="btn spacer" onclick={repeat}>{t('Repeat')}</button>
    </div>
    {#if books}<p class="small muted center">{t('Your existing books can be re-filtered from the library.')}</p>{/if}
  </main>
{:else if view?.word}
  <main class="stage" use:gestures={{ onTap: flip, onDragX: (x) => (dx = swipeable ? x : 0), onSwipeX: swipe,
    onCancel: () => (dx = 0), width: () => Math.min(innerWidth * 0.88, 440) }}>
    <header class="top">
      <span class="counter" data-testid="check-counter">{view.position + 1} / {view.total}</span>
      <button class="linkbtn" onclick={skip}>{t('Skip')}</button>
    </header>
    <div class="cardpos" class:nudge>
    {#key `${view.position}:${view.word?.lemma}`}
      <FlipCard {flipped} {dx} {fly} entering label={t('Vocabulary check word {n} of {total}', { n: view.position + 1, total: view.total })}>
        {#snippet front()}
          <div class="word" data-testid="check-word" {...textAttrs(ui.pair.source)}>{view?.word ? headword(view.word.lemma, view.word.pos, ui.pair.source) : ''}</div>
          <div class="hint muted">{flipped || showHints ? '' : t('Tap to see the translation')}</div>
        {/snippet}
        {#snippet back()}
          <div class="word small-word" {...textAttrs(ui.pair.source)}>{view?.word ? headword(view.word.lemma, view.word.pos, ui.pair.source) : ''}</div>
          <div class="tr" class:long={(view?.word?.tr.join(', ').length ?? 0) > 24} {...textAttrs(ui.pair.target)}>{view?.word?.tr.join(', ')}</div>
          {#if view?.word?.def}<p class="def small muted" {...textAttrs(ui.pair.source)}>{view.word.def}</p>{/if}
          <LookupLinks links={view?.word?.lookupLinks ?? []} />
          <div class="hint muted">{t('Swipe right if you knew it, left if not')}</div>
        {/snippet}
      </FlipCard>
    {/key}
    </div>
    {#if showHints}<GestureHints {flipped} {used} />{/if}
    <div class="sr-only">
      <button onclick={() => (flipped = !flipped)}>{t('Flip')}</button>
      <button onclick={() => answer(true)} disabled={!flipped && !seen}>{t('Knew it')}</button>
      <button onclick={() => answer(false)} disabled={!flipped && !seen}>{t("Didn't know")}</button>
    </div>
    {#if flipped}
      <div class="explain replace">
        <button class="linkbtn" onclick={replaceWord} disabled={busy} data-testid="check-replace">{t("Don't count this word")}</button>
        <span class="small muted">{t("for a specialist term you wouldn't know in {language} either", { language: languageName(ui.pair.target) })}</span>
      </div>
    {:else}
      <p class="explain small muted" data-testid="check-why">{t('Two minutes, 60 words, so your cards skip the words you already know.')}<br />
        {t("Tap, then swipe right = knew it, left = didn't.")}</p>
    {/if}
  </main>
  {#if askFront}<FrontSwipeConfirm dir={askFront} onanswer={frontSwipeAnswer} />{/if}
{:else}
  <main class="screen stack">
    {#if error}<p class="error" role="alert">{t(error)}</p><button class="btn" onclick={skip}>{t('Skip the check')}</button>
    {:else}<p class="muted">{t('Preparing the vocabulary check…')}</p>{/if}
  </main>
{/if}

<style>
  .stage { position: fixed; inset: 0; background: var(--stage); display: flex; flex-direction: column; align-items: center; justify-content: center;
    touch-action: none; overscroll-behavior: none; user-select: none; -webkit-user-select: none; }
  .top { position: absolute; top: calc(var(--safe-top) + 8px); left: 16px; right: 16px; display: flex; justify-content: space-between; align-items: center; }
  .counter { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--muted); }
  .word { font-family: var(--serif); font-size: clamp(30px, 9vw, 44px); font-weight: 700; text-align: center; margin: auto 0 8px; overflow-wrap: anywhere; }
  .small-word { font-size: 22px; margin: 0 0 16px; color: var(--muted); }
  .tr { font-size: 26px; text-align: center; }
  .tr.long { font-size: 20px; }
  .def { text-align: center; margin: 12px 0 8px; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden; flex: none; }
  .replace { display: flex; flex-direction: column; align-items: center; }
  .cardpos.nudge { animation: nudge 0.35s; }
  @keyframes nudge { 25% { transform: translateX(-8px); } 75% { transform: translateX(8px); } }
  .hint { text-align: center; margin-top: auto; font-size: 14px; flex: none; }
  .explain { position: absolute; bottom: calc(var(--safe-bottom) + 20px); padding: 0 24px; text-align: center; }
  .result .big { font-family: var(--serif); font-size: 32px; font-weight: 700; margin-top: 12px; }
  .center { text-align: center; }
  .up { text-transform: uppercase; letter-spacing: .08em; margin-top: 32px; }
  .levels { display: flex; justify-content: center; gap: 6px; }
  .levels span { width: 28px; height: 28px; border-radius: 14px; display: grid; place-items: center; font-weight: 700; font-size: 13px; background: var(--surface-2); }
  .levels .skip { opacity: 0.35; text-decoration: line-through; }
  .levels .here { background: var(--accent); color: var(--accent-ink); transform: scale(1.2); }
  .levels.pickable { flex-wrap: wrap; gap: 10px; margin: 8px 0; }
  .levels.pickable button { width: 40px; height: 40px; border-radius: 20px; border: 0; font: inherit; font-weight: 700; color: inherit; background: var(--surface-2); }
  .levels.pickable .here { color: var(--accent-ink); background: var(--accent); }
</style>
