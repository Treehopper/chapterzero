<script lang="ts">
  /** Full-screen study (C1–C18, §8.1 "Study"). Every action is persisted before the next card animates in. */
  import { onDestroy, onMount } from 'svelte';
  import { headword, type SenseOption, type SessionView, type Settings } from '@chapterzero/core';
  import { api } from '../lib/api';
  import { go, replace } from '../lib/router.svelte';
  import { gestures } from '../lib/gestures';
  import { announceUnlocks, banner, hideToast, pct, toast, ui } from '../lib/ui.svelte';
  import { vibrate } from '../lib/platform';
  import Toast from '../components/Toast.svelte';
  import FlipCard from '../components/FlipCard.svelte';
  import LookupLinks from '../components/LookupLinks.svelte';
  import GestureHints from '../components/GestureHints.svelte';
  import FrontSwipeKnown from '../components/FrontSwipeKnown.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { languageName, t, textAttrs } from '../lib/i18n/index.svelte';

  let { bookId, chapter, how: howParam }: { bookId: string; chapter?: string; how?: string } = $props();

  let view = $state<SessionView>();
  let settings = $state<Settings>();
  let error = $state('');
  let dx = $state(0);
  let fly = $state<-1 | 0 | 1>(0);
  let busy = $state(false);
  let panel = $state(false);
  /** vertical finger offset while the panel is pulled (0 when not dragging) */
  let dy = $state(0);
  let panelH = $state(220);
  /** how far the panel is out, 0–1: follows the finger, then settles */
  const openness = $derived(Math.min(1, Math.max(0, panel ? 1 - dy / panelH : -dy / panelH)));
  const CARD_LIFT = 72;
  /** the panel stays in the page while it slides out from wherever the finger left it */
  let panelShown = $state(false);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    clearTimeout(hideTimer);
    if (openness > 0) panelShown = true;
    else if (panelShown) hideTimer = setTimeout(() => (panelShown = false), 300);
  });
  let undoPill = $state<{ label: string; until: number }>();
  let undoTimer: ReturnType<typeof setTimeout> | undefined;
  let editing = $state(false);
  let editList = $state<string[]>([]);
  let editDef = $state('');
  let editPos = $state<string>();
  let senses = $state<SenseOption[]>([]);
  let used = $state<Set<string>>(new Set());
  let nudge = $state(false);
  let askFront = $state(false);
  let cardKey = $state(0);
  let live = $state('');

  const flipped = $derived(!!view?.phase && view.phase !== 'front');
  const review = $derived(view?.phase === 'wrongReview');
  const hintsOn = $derived(settings?.gestureHints === 'everySession' && !!view?.firstCard && !!view?.card);
  /** the book's language and the translations' (lang, dir) */
  const src = $derived(textAttrs(view?.pair.source ?? ui.pair.source));
  const tgt = $derived(textAttrs(view?.pair.target ?? ui.pair.target));

  onMount(async () => {
    try {
      settings = await api.settings.get();
      // params: [chapter index] [start choice from the start sheet (C19)], each optional
      const choice = (x?: string) => /^(cards|min)-(\d+(?:\.\d+)?)$/.exec(x ?? '');  // decimals: short timed sessions in e2e
      const how = choice(howParam) ?? choice(chapter);
      const chapterIndex = chapter !== undefined && /^\d+$/.test(chapter) ? Number(chapter) : undefined;
      const opts = how || chapterIndex !== undefined ? {
        ...(chapterIndex !== undefined ? { chapterIndex } : {}),
        ...(how ? (how[1] === 'cards' ? { cardLimit: Number(how[2]) } : { minutes: Number(how[2]) }) : {}),
      } : undefined;
      view = await api.study.resumeOrStart(bookId, opts);
      // the choice starts a session once; a relaunch must resume it, not restart it (C5)
      if (opts) replace('study', bookId);
      await afterView(view);
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  });
  // timed sessions (C19): the top bar counts down instead of counting cards
  let now = $state(Date.now());
  const tick = setInterval(() => (now = Date.now()), 1000);
  const left = $derived(view?.endsAt ? Math.max(0, new Date(view.endsAt).getTime() - now) : undefined);
  const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  onDestroy(() => { clearTimeout(undoTimer); clearInterval(tick); ui.toastInStage = false; });
  // while the stage is up it shows the toast itself (see Toast.svelte)
  $effect(() => { ui.toastInStage = !error && !view?.nothingDue && !!view?.card; });

  async function afterView(v: SessionView) {
    if (v.card) live = `${headword(v.card.lemma, v.card.pos, v.pair.source)}${v.phase === 'front' ? '' : ': ' + (v.card.translations.join(', ') || v.card.definition || '')}`;
    if (v.newAchievements.length) announceUnlocks(v.newAchievements, settings?.achievementPopups ?? true);
    if (v.chapterReady) banner({ kind: 'chapter', title: t('{title} is ready to read', { title: v.chapterReady.title }), subtitle: pct(v.chapterReady.coverage) });
    if (v.done && !v.nothingDue && v.sessionId) {
      await api.study.finish(v.sessionId);
      go('stats', v.sessionId);
    }
  }

  /** actions run one after another; a quick tap-then-swipe must not lose the swipe */
  let chain: Promise<unknown> = Promise.resolve();
  let pending = $state(0);
  function enqueue(fn: () => Promise<void>): Promise<boolean> {
    pending++;
    busy = true;
    const done = chain.then(fn).then(() => true, (e) => { toast(t(e instanceof Error ? e.message : String(e))); return false; })
      .finally(() => { if (--pending === 0) busy = false; });
    chain = done;
    return done;
  }

  /** a new grade or removal replaces what Undo would undo: the old offers go */
  function supersede() {
    clearTimeout(undoTimer);
    undoPill = undefined;
    if (ui.toast?.action?.run === undo) hideToast();
  }

  function run(fn: () => Promise<SessionView>, opts: { newCard?: boolean } = {}) {
    return enqueue(async () => {
      const v = await fn();
      if (opts.newCard) cardKey++;
      view = v;
      await afterView(v);
    });
  }

  function useHint(h: string) { if (!used.has(h)) used = new Set([...used, h]); }

  function flip() {
    if (!view?.card || panel || askFront) return;
    useHint('tap');
    if (review) return continueReview();
    void run(() => (view!.phase === 'wrongReview' ? api.study.continueAfterReview(view!.sessionId) : api.study.flip(view!.sessionId)));
  }

  function shake(text: string) {
    nudge = true; setTimeout(() => (nudge = false), 400);
    toast(text);
  }

  /** answer to the one-time question on the first right swipe before a flip */
  async function frontSwipeAnswer(choice: 'known' | 'grade' | 'flip') {
    askFront = false;
    if (choice === 'flip') { nudge = true; setTimeout(() => (nudge = false), 400); return; }
    settings = await api.settings.update({ frontSwipe: choice });
    if (view) view.frontSwipe = choice;
    await grade(1);
  }

  /** a right swipe on a card never turned over, with frontSwipe 'known': out for good, nothing shown */
  function markKnownFromFront() {
    return enqueue(async () => {
      if (!view?.card) return;
      const lemma = view.card.lemma;
      supersede();
      fly = 1;
      vibrate();
      try {
        const [v] = await Promise.all([api.study.removeCurrent(view.sessionId, 'known'), new Promise((r) => setTimeout(r, 260))]);
        cardKey++;
        view = v;
        if (settings?.undoAfterKnown ?? true) showUndo(t('“{word}” known · Undo', { word: lemma }));
        await afterView(v);
      } finally {
        dx = 0;
        fly = 0;
      }
    });
  }

  function continueReview() {
    void run(() => api.study.continueAfterReview(view!.sessionId), { newCard: true });
  }

  function grade(dir: 1 | -1) {
    if (!view?.card || panel) return;
    const aimed = view.card.id;
    return enqueue(async () => {
      // decided on the state after any queued flip has landed
      if (!view?.card) return;
      // a swipe during the fly-off must not act on the next card the learner has not even seen face up
      if (view.card.id !== aimed && view.phase === 'front' && !view.seenBack) { dx = 0; return; }
      if (view.phase === 'wrongReview') {
        dx = 0;
        const v = await api.study.continueAfterReview(view.sessionId);
        cardKey++;
        view = v;
        await afterView(v);
        return;
      }
      if (view.phase === 'front' && !view.seenBack) {
        // never turned over: a swipe is for words you are sure of, and never shows the back (C7)
        dx = 0;
        if (dir === -1) return shake(t('Tap to flip the card first'));
        if (view.frontSwipe === 'ask') { askFront = true; return; }
        if (view.frontSwipe === 'off') return shake(t('Tap to flip the card first (Settings › Swipe right before flipping)'));
        if (view.frontSwipe === 'known') { void markKnownFromFront(); return; }
      }
      useHint(dir === 1 ? 'right' : 'left');
      supersede();
      fly = dir;
      vibrate();
      try {
        const [v] = await Promise.all([api.study.grade(view.sessionId, dir === 1 ? 'known' : 'unknown'), new Promise((r) => setTimeout(r, 260))]);
        if (v.phase !== 'wrongReview') cardKey++;
        view = v;
        if (v.canUndo && (settings?.undoAfterGrade ?? true)) showUndo(v.retired ? t('Already known · Undo') : t('Undo'));
        await afterView(v);
      } finally {
        dx = 0;
        fly = 0;
      }
    });
  }

  function showUndo(label: string) {
    clearTimeout(undoTimer);
    undoPill = { label, until: Date.now() + 3000 };
    undoTimer = setTimeout(() => (undoPill = undefined), 3000);
  }

  function undo() {
    if (!view?.canUndo) return;
    clearTimeout(undoTimer);
    undoPill = undefined;
    void run(() => api.study.undo(view!.sessionId), { newCard: true });
  }

  /** opened without a drag (handle, keys): it slides in; closing is the transform's own transition */
  function slideIn(_: Element) {
    return { duration: dy === 0 ? 200 : 0, css: (t: number) => `transform: translateY(${(1 - t) * 100}%)` };
  }

  function vertical(dir: 1 | -1) {
    dy = 0;
    if (dir === 1) {
      panel = false;
    } else {
      useHint('up');
      panel = true;
    }
  }

  function openEdit() {
    if (!view?.card) return;
    editList = [...view.card.translations];
    if (!editList.length) editList = [''];
    editDef = view.card.definition ?? '';
    editPos = view.card.pos[0];
    senses = [];
    const id = view.card.id;
    void api.cards.senses(id).then((s) => { if (view?.card?.id === id) senses = s; });
    panel = false;
    editing = true;
  }
  /** the card back lists the translations in this order */
  function moveTranslation(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= editList.length) return;
    const next = [...editList];
    [next[i], next[j]] = [next[j], next[i]];
    editList = next;
  }
  /** take the lists' translations and definition for that part of speech */
  function pickSense(s: SenseOption) {
    editPos = s.pos;
    editList = s.translations.length ? [...s.translations] : [''];
    editDef = s.definition ?? '';
  }
  async function saveEdit() {
    // a refused edit keeps the sheet open with what was typed
    if (await run(() => api.study.editCurrent(view!.sessionId, { translations: editList, definition: editDef, pos: editPos }))) editing = false;
  }
  async function removeAs(as: 'removed' | 'known') {
    editing = false;
    panel = false;
    const lemma = view?.card?.lemma;
    supersede();
    if (!(await run(() => api.study.removeCurrent(view!.sessionId, as), { newCard: true }))) return;
    const text = as === 'known' ? t('“{word}” marked as known · won’t be repeated', { word: lemma ?? '' }) : t('“{word}” removed', { word: lemma ?? '' });
    // the last card ends the session, and a finished session has nothing to undo
    toast(text, view?.done || (as === 'known' && !(settings?.undoAfterKnown ?? true)) ? undefined : { label: t('Undo'), run: undo });
  }
  async function finish() {
    panel = false;
    if (!view) return;
    await api.study.finish(view.sessionId);
    go('stats', view.sessionId);
  }
  async function studyAhead() {
    await run(() => api.study.resumeOrStart(bookId, { studyAhead: true }), { newCard: true });
  }

  function key(e: KeyboardEvent) {
    if (editing || askFront || !view?.card) return;
    const el = e.target as HTMLElement;
    if (el.closest('input, textarea, select')) return;
    // Enter and Space on a focused button press that button
    if ((e.key === 'Enter' || e.key === ' ') && el.closest('button, a, [role="button"]')) return;
    switch (e.key) {
      case ' ': case 'Enter': e.preventDefault(); flip(); break;
      case 'ArrowRight': e.preventDefault(); void grade(1); break;
      case 'ArrowLeft': e.preventDefault(); void grade(-1); break;
      case 'ArrowDown': e.preventDefault(); vertical(1); break;
      case 'ArrowUp': e.preventDefault(); vertical(-1); break;
      case 'z': case 'Z': undo(); break;
      case 'Escape': panel = false; break;
    }
  }

  /** the example sentence with the word's forms in bold */
  function parts(example: string | undefined, forms: string[]): { t: string; b: boolean }[] {
    if (!example) return [];
    const esc = forms.filter(Boolean).sort((a, b) => b.length - a.length).map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!esc.length) return [{ t: example, b: false }];
    const re = new RegExp(`(?<![\\p{L}])(${esc.join('|')})(?:['’]s)?(?![\\p{L}])`, 'giu');
    const out: { t: string; b: boolean }[] = [];
    let last = 0;
    for (const m of example.matchAll(re)) {
      if (m.index! > last) out.push({ t: example.slice(last, m.index), b: false });
      out.push({ t: m[0], b: true });
      last = m.index! + m[0].length;
    }
    if (last < example.length) out.push({ t: example.slice(last), b: false });
    return out;
  }
</script>

<svelte:window onkeydown={key} />

{#if error}
  <main class="screen"><p class="error">{t(error)}</p><button class="btn" onclick={() => go('book', bookId)}>{t('Back')}</button></main>
{:else if view?.nothingDue}
  <main class="screen stack nothing" data-testid="nothing-due">
    <h1>{t('All done for now')}</h1>
    <p class="muted">{t('Nothing is due right now and no new cards are needed. You can get ahead if you have time before reading.')}</p>
    <button class="btn primary block" onclick={studyAhead}>{t('Get ahead')}</button>
    <button class="btn block" onclick={() => go('book', bookId)}>{t('Back to the book')}</button>
  </main>
{:else if view?.card}
  {@const card = view.card}
  <main class="stage" aria-label={t('Study')} data-testid="study-stage" data-word={card.lemma} data-phase={view.phase} data-busy={busy}
    use:gestures={{ onTap: () => (panel ? (panel = false) : flip()), onDragX: (x) => { if (!fly && !panel) dx = x; },
      onDragY: (y) => { if (!fly) dy = panel ? Math.max(0, y) : Math.min(0, y); },
      onSwipeX: (d) => grade(d), onSwipeY: vertical, onCancel: () => { dx = 0; dy = 0; }, width: () => Math.min(innerWidth * 0.88, 440) }}>

    <div class="topbar">
      {#if left !== undefined && view.endsAt}
        {@const total = new Date(view.endsAt).getTime() - new Date(view.startedAt).getTime()}
        <div class="progress" data-testid="progress" aria-label={t('{time} left', { time: clock(left) })}>
          <div class="track"><div style:width="{(1 - left / Math.max(1, total)) * 100}%"></div></div>
          <span data-testid="time-left">{left > 0 ? t('{time} left', { time: clock(left) }) : t('last card')}</span>
        </div>
      {:else}
        <div class="progress" data-testid="progress" aria-label={t('{done} of {total} cards done', { done: view.progress.done, total: view.progress.total })}>
          <div class="track"><div style:width="{(view.progress.done / Math.max(1, view.progress.total)) * 100}%"></div></div>
          <span>{view.progress.done} / {view.progress.total}</span>
        </div>
      {/if}
    </div>

    <div class="cardpos" class:nudge class:dragging={dy !== 0} style:translate="0 {-CARD_LIFT * openness}px">
      {#key cardKey}
        <FlipCard {flipped} {dx} {fly} dim={openness > 0.5} {review} entering={!review} label={t('Card {word}', { word: card.lemma })}>
          {#snippet front()}
            <div class="lvl small muted">{card.listLevel ? t('Level {level}', { level: card.listLevel }) : t('Added by hand')}</div>
            <div class="word" data-testid="card-word" {...src}>{headword(card.lemma, card.pos, src.lang)}</div>
            {#if card.example && (settings?.bookSentence ?? 'both') === 'both'}
              <p class="ex" {...src}>{#each parts(card.example, [...card.forms, card.lemma]) as p, i (i)}{#if p.b}<b>{p.t}</b>{:else}{p.t}{/if}{/each}</p>
            {/if}
            <div class="foot small muted">{flipped || hintsOn ? '' : t('tap to flip')}</div>
          {/snippet}
          {#snippet back()}
            <div class="row head">
              <span class="small-word" {...src}>{review ? '✗ ' : ''}{headword(card.lemma, card.pos, src.lang)}</span>
              <span class="spacer"></span>
              {#if card.pos.length}<span class="small muted">{card.pos.slice(0, 2).join(' · ')}</span>{/if}
            </div>
            <div class="tr" data-testid="card-back" {...(card.translations.length ? tgt : src)}>
              {#if card.translations.length}{card.translations.join(', ')}
              {:else}<span class="en">{src.lang.toUpperCase()}</span> {card.definition}{/if}
            </div>
            {#if card.translations.length && card.definition}<p class="def" {...src}>{card.definition}</p>{/if}
            {#if card.example && (settings?.bookSentence ?? 'both') !== 'off'}
              <p class="ex small" {...src}>{#each parts(card.example, [...card.forms, card.lemma]) as p, i (i)}{#if p.b}<b>{p.t}</b>{:else}{p.t}{/if}{/each}</p>
            {/if}
            {#if settings?.showLookupLinks ?? true}<div class="links" data-testid="card-links"><LookupLinks links={view!.lookupLinks} /></div>
            <!-- without links, the free space below balances the space above: the translation stays centred -->
            {:else}<div class="balance" aria-hidden="true"></div>{/if}
            {#if review}
              <div class="foot small muted">{t('tap or swipe to continue')}</div>
            {:else if settings?.showBoxLevel && card.box > 0}
              <div class="dots" aria-label={t('Box {box} of 8', { box: card.box })} data-testid="box-dots">{#each Array(8) as _, i (i)}<i class:on={i < card.box}></i>{/each}</div>
            {/if}
          {/snippet}
        </FlipCard>
      {/key}
    </div>

    {#if hintsOn}<GestureHints {flipped} {used} grade={!review} extra />{/if}

    {#if !panel}
      <button class="grab" onclick={() => vertical(-1)} aria-label={t('Card options')} data-testid="grab" data-nogesture><span></span></button>
    {/if}

    {#if undoPill && !panel}
      <button class="undo" onclick={undo} data-testid="undo">{undoPill.label}</button>
    {/if}

    {#if panelShown}
      <div class="panel" class:dragging={dy !== 0} in:slideIn inert={!panel} data-testid="panel" bind:offsetHeight={panelH} style:transform="translateY({(1 - openness) * 100}%)">
        <button class="pbtn" onclick={openEdit}>{t('Edit card')}</button>
        <button class="pbtn" onclick={() => removeAs('known')} data-testid="panel-known">{t('Mark as known')}</button>
        <button class="pbtn" onclick={() => go('settings', 'study', bookId)} data-testid="panel-settings">{t('Settings')}</button>
        <button class="pbtn cancel" onclick={finish} data-testid="finish">{t('Cancel session')}</button>
      </div>
    {/if}

    <div class="sr-only" aria-live="polite">{live}{hintsOn ? '. ' + t('Tap to flip, swipe right if you knew it, left if not, up to edit the card or end the session.') : ''}</div>
    <div class="sr-only">
      <button onclick={flip}>{t('Flip')}</button>
      <button onclick={() => grade(1)}>{t('Knew it')}</button>
      <button onclick={() => grade(-1)}>{t("Didn't know")}</button>
      <button onclick={() => vertical(-1)}>{t('Card options')}</button>
      {#if view.canUndo}<button onclick={undo}>{t('Undo')}</button>{/if}
    </div>
    <Toast inStage />
  </main>
{:else if view && !view.done}
  <main class="screen"><p class="muted">{t('Loading…')}</p></main>
{/if}

{#if askFront && view?.card}<FrontSwipeKnown word={view.card.lemma} onanswer={frontSwipeAnswer} />{/if}

{#if editing && view?.card}
  <Sheet full label={t('Edit card')} onclose={() => (editing = false)}>
    <div class="stack">
      <div class="row"><h2 class="spacer" {...src}>{headword(view.card.lemma, editPos ? [editPos] : view.card.pos, src.lang)}</h2><button class="linkbtn" onclick={() => (editing = false)}>{t('Cancel')}</button></div>
      {#if senses.length > 1}
        <div class="section-title">{t('Part of speech')}</div>
        <div class="row senses" role="radiogroup" aria-label={t('Part of speech')}>
          {#each senses as s (s.pos)}
            <button class="chip" class:on={editPos === s.pos} role="radio" aria-checked={editPos === s.pos} onclick={() => pickSense(s)} data-testid="sense-{s.pos}">{s.pos}</button>
          {/each}
        </div>
        <p class="small muted">{t("Picking one fills in the lists' translations and definition for it.")}</p>
      {/if}
      <div class="section-title">{t('Translations')}</div>
      {#each editList as _, i (i)}
        <div class="row">
          <input type="text" bind:value={editList[i]} aria-label={t('Translation {n}', { n: i + 1 })} {...tgt} />
          {#if editList.length > 1}
            <button class="iconbtn" aria-label={t('Move translation {n} up', { n: i + 1 })} disabled={i === 0} onclick={() => moveTranslation(i, -1)}>↑</button>
            <button class="iconbtn" aria-label={t('Move translation {n} down', { n: i + 1 })} disabled={i === editList.length - 1} onclick={() => moveTranslation(i, 1)}>↓</button>
          {/if}
          <button class="iconbtn" aria-label={t('Remove translation')} onclick={() => (editList = editList.filter((__, j) => j !== i))}>×</button>
        </div>
      {/each}
      {#if editList.length < 4}<button class="linkbtn" onclick={() => (editList = [...editList, ''])}>＋ {t('Add translation')}</button>{/if}
      <label class="stack small">{t('{language} definition', { language: languageName(src.lang) })}
        <textarea rows="3" bind:value={editDef} aria-label={t('Definition')} data-testid="edit-definition" {...src}></textarea></label>
      <button class="btn primary block" onclick={saveEdit} data-testid="save-edit">{t('Save')}</button>
      <div class="section-title">{t('Other actions')}</div>
      <button class="btn block danger" onclick={() => removeAs('removed')}>{t('Remove card')}</button>
    </div>
  </Sheet>
{/if}

<style>
  .stage { position: fixed; inset: 0; background: var(--stage); display: flex; align-items: center; justify-content: center;
    touch-action: none; overscroll-behavior: none; user-select: none; -webkit-user-select: none; overflow: hidden; }
  .cardpos { position: relative; transition: translate 0.25s ease-out; }
  .cardpos.dragging, .panel.dragging { transition: none; }
  .cardpos.nudge { animation: nudge 0.35s; }
  @keyframes nudge { 25% { transform: translateX(-8px); } 75% { transform: translateX(8px); } }
  .lvl { text-align: center; }
  .word { font-family: var(--serif); font-size: clamp(32px, 10vw, 48px); font-weight: 700; text-align: center; margin: auto 0 12px; overflow-wrap: anywhere; }
  .ex { font-family: var(--serif); font-size: 17px; line-height: 1.45; color: var(--muted); text-align: center; margin: 0 0 auto; }
  .ex b { color: var(--text); }
  .ex.small { font-size: 15px; text-align: left; margin: 12px 0 0; flex: none; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; line-clamp: 4; overflow: hidden; }
  .foot { text-align: center; margin-top: auto; padding-top: 8px; flex: none; }
  .links + .foot { margin-top: 0; }
  .head { margin-bottom: 12px; }
  .small-word { font-family: var(--serif); font-size: 20px; font-weight: 700; color: var(--muted); }
  .tr { font-size: clamp(24px, 7vw, 32px); font-weight: 600; line-height: 1.25; margin-top: auto; }
  .en { font-size: 12px; font-weight: 800; padding: 2px 6px; border-radius: 6px; background: var(--surface-2); color: var(--muted); vertical-align: middle; }
  .def { font-size: 14px; color: var(--muted); margin: 8px 0 0; flex: none; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden; }
  .balance { flex: none; margin-top: auto; }
  .links { flex: none; margin-top: auto; border-top: 1px solid var(--line); padding-top: 8px; }
  .dots { display: flex; gap: 6px; justify-content: center; align-items: center; flex: none; padding-top: 10px; }
  .dots i { width: 8px; height: 8px; border-radius: 4px; box-sizing: border-box; border: 1.5px solid var(--muted); opacity: 0.45; }
  .dots i.on { border: none; opacity: 1; }
  .dots i.on { background: var(--good); }
  .topbar { position: absolute; top: var(--safe-top); left: 16px; right: 16px; min-height: 44px; display: flex; align-items: center; gap: 8px; }
  .progress { flex: 1; display: flex; align-items: center; gap: 8px; pointer-events: none; }
  .track { flex: 1; height: 3px; background: color-mix(in srgb, var(--text) 15%, transparent); border-radius: 2px; overflow: hidden; }
  .track div { height: 100%; background: var(--accent); }
  .progress span { font-size: 12px; font-variant-numeric: tabular-nums; color: var(--muted); }
  /* a handle that says "something is below": tap it or swipe up */
  .grab { position: absolute; bottom: calc(var(--safe-bottom) + 6px); left: 50%; transform: translateX(-50%); width: 88px; height: 32px;
    border: none; background: none; padding: 0; display: flex; align-items: center; justify-content: center; }
  .grab span { width: 40px; height: 5px; border-radius: 3px; background: color-mix(in srgb, var(--text) 30%, transparent); }
  .senses { gap: 8px; flex-wrap: wrap; }
  .chip { border: 1px solid var(--line); background: var(--surface); color: var(--text); border-radius: 999px; padding: 0 14px; min-height: 36px; font-weight: 600; }
  .chip.on { background: var(--text); color: var(--bg); border-color: var(--text); }
  textarea { width: 100%; font: inherit; font-size: 16px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--text); resize: vertical; }
  .undo { position: absolute; bottom: calc(var(--safe-bottom) + 44px); left: 50%; transform: translateX(-50%); border: none; border-radius: 999px;
    padding: 10px 18px; min-height: 44px; background: var(--text); color: var(--bg); font-weight: 700; box-shadow: var(--card-shadow); }
  .panel { position: absolute; left: 0; right: 0; bottom: 0; padding: 12px 16px calc(var(--safe-bottom) + 16px); background: var(--surface);
    border-radius: 20px 20px 0 0; box-shadow: var(--card-shadow); display: flex; flex-direction: column; gap: 8px; transition: transform .25s ease-out; }
  .pbtn { min-height: 56px; border-radius: 14px; border: 1px solid var(--line); background: var(--bg); color: var(--text); font-size: 17px; font-weight: 600; }
  .pbtn.cancel { color: var(--bad); }
  .nothing { justify-content: center; }
</style>
