<script lang="ts">
  /** Vocabulary check (H1–H3): 60 words in the study card UI, then the result screen. */
  import { onMount } from 'svelte';
  import { headword, LEVELS, startLevel, type CalibrationView } from '@vocabfirst/core';
  import { api } from '../lib/api';
  import { go } from '../lib/router.svelte';
  import { gestures } from '../lib/gestures';
  import { fmt } from '../lib/ui.svelte';
  import FlipCard from '../components/FlipCard.svelte';

  let view = $state<CalibrationView>();
  let flipped = $state(false);
  let dx = $state(0);
  let fly = $state<-1 | 0 | 1>(0);
  let busy = false;
  let result = $state<{ cutoffRank: number; level: number }>();
  let adjust = $state(false);
  let cutoff = $state(8000);
  let books = $state(0);

  let error = $state('');
  onMount(async () => {
    try {
      const restart = location.hash.endsWith('/restart');
      view = restart ? await api.calibration.restart() : await api.calibration.startOrResume();
      if (restart) history.replaceState(null, '', '#/check');
      books = (await api.books.list()).length;
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  });

  async function answer(known: boolean) {
    if (busy || !view?.word) return;
    if (!flipped) { flipped = true; return; }
    busy = true;
    fly = known ? 1 : -1;
    const next = await api.calibration.answer(known);
    await new Promise((r) => setTimeout(r, 180));
    fly = 0; dx = 0; flipped = false;
    view = next;
    if (next.result) { result = next.result; cutoff = next.result.cutoffRank; }
    busy = false;
  }

  async function skip() {
    await api.calibration.skip();
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
    if (result) return;
    if (e.key === ' ') { e.preventDefault(); flipped = !flipped; }
    else if (e.key === 'ArrowRight') void answer(true);
    else if (e.key === 'ArrowLeft') void answer(false);
  }
  const level = $derived(startLevel(cutoff));
</script>

<svelte:window onkeydown={key} />

{#if result}
  <main class="screen stack result" data-testid="check-result">
    <h1 class="muted center small up">Your English level</h1>
    <div class="big center">You start at level <span data-testid="start-level">{level}</span></div>
    <div class="levels" aria-hidden="true">
      {#each LEVELS as l (l.level)}
        <span class:skip={l.level < level} class:here={l.level === level}>{l.level}</span>
      {/each}
    </div>
    <p class="center">Words more common than rank <strong data-testid="cutoff">{fmt(cutoff)}</strong> won't become cards.
      {#if level > 1}Levels 1–{level - 1} are skipped.{/if}</p>
    <p class="center small muted">Words just above it that you already know are retired after one swipe.</p>
    {#if adjust}
      <label class="stack small">Adjust
        <input type="range" min="2000" max="60000" step="500" bind:value={cutoff} list="level-marks" aria-label="Cutoff rank" />
        <datalist id="level-marks">{#each LEVELS as l (l.level)}<option value={l.from - 1}></option>{/each}</datalist>
      </label>
    {/if}
    <div class="spacer"></div>
    <button class="btn primary block" onclick={use}>Use this</button>
    <div class="row">
      <button class="btn spacer" onclick={() => (adjust = !adjust)}>{adjust ? 'Hide' : 'Adjust'}</button>
      <button class="btn spacer" onclick={repeat}>Repeat</button>
    </div>
    {#if books}<p class="small muted center">Your existing books can be re-filtered from the library.</p>{/if}
  </main>
{:else if view?.word}
  <main class="stage" use:gestures={{ onTap: () => (flipped = !flipped), onDragX: (x) => (dx = flipped ? x : 0), onSwipeX: (d) => (flipped ? answer(d === 1) : (dx = 0)),
    onCancel: () => (dx = 0), width: () => Math.min(innerWidth * 0.88, 440) }}>
    <header class="top">
      <span class="counter" data-testid="check-counter">{view.position + 1} / {view.total}</span>
      <button class="linkbtn" onclick={skip}>Skip</button>
    </header>
    {#key view.position}
      <FlipCard {flipped} {dx} {fly} entering label="Vocabulary check word {view.position + 1} of {view.total}">
        {#snippet front()}
          <div class="word" data-testid="check-word">{view?.word ? headword(view.word.lemma, view.word.pos) : ''}</div>
          <div class="hint muted">{flipped ? '' : 'Tap to see the translation'}</div>
        {/snippet}
        {#snippet back()}
          <div class="word small-word">{view?.word ? headword(view.word.lemma, view.word.pos) : ''}</div>
          <div class="de">{view?.word?.de.join(', ')}</div>
          <div class="hint muted">Swipe right if you knew it, left if not</div>
        {/snippet}
      </FlipCard>
    {/key}
    <div class="sr-only">
      <button onclick={() => (flipped = !flipped)}>Flip</button>
      <button onclick={() => answer(true)} disabled={!flipped}>Knew it</button>
      <button onclick={() => answer(false)} disabled={!flipped}>Didn't know</button>
    </div>
    <p class="explain small muted" data-testid="check-why">Two minutes, 60 words, so your cards skip the words you already know.<br />
      Tap, then swipe right = knew it, left = didn't.</p>
  </main>
{:else}
  <main class="screen stack">
    {#if error}<p class="error" role="alert">{error}</p><button class="btn" onclick={skip}>Skip the check</button>
    {:else}<p class="muted">Preparing the vocabulary check…</p>{/if}
  </main>
{/if}

<style>
  .stage { position: fixed; inset: 0; background: var(--stage); display: flex; flex-direction: column; align-items: center; justify-content: center;
    touch-action: none; overscroll-behavior: none; user-select: none; -webkit-user-select: none; }
  .top { position: absolute; top: calc(var(--safe-top) + 8px); left: 16px; right: 16px; display: flex; justify-content: space-between; align-items: center; }
  .counter { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--muted); }
  .word { font-family: var(--serif); font-size: clamp(30px, 9vw, 44px); font-weight: 700; text-align: center; margin: auto 0 8px; overflow-wrap: anywhere; }
  .small-word { font-size: 22px; margin: 0 0 16px; color: var(--muted); }
  .de { font-size: 26px; text-align: center; margin-bottom: auto; }
  .hint { text-align: center; margin-top: auto; font-size: 14px; }
  .explain { position: absolute; bottom: calc(var(--safe-bottom) + 20px); padding: 0 24px; text-align: center; }
  .result .big { font-family: var(--serif); font-size: 32px; font-weight: 700; margin-top: 12px; }
  .center { text-align: center; }
  .up { text-transform: uppercase; letter-spacing: .08em; margin-top: 32px; }
  .levels { display: flex; justify-content: center; gap: 6px; }
  .levels span { width: 28px; height: 28px; border-radius: 14px; display: grid; place-items: center; font-weight: 700; font-size: 13px; background: var(--surface-2); }
  .levels .skip { opacity: 0.35; text-decoration: line-through; }
  .levels .here { background: var(--accent); color: var(--accent-ink); transform: scale(1.2); }
</style>
