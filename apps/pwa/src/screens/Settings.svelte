<script lang="ts">
  /** Settings (§8.1): language, level (H3), limits, behaviour toggles, lookup links (C17), backup (F1), word lists (A3), about.
      Settings that are hard to guess have an (i) with the details. */
  import { onMount } from 'svelte';
  import { DEFAULT_LOOKUP_PROVIDERS, isValidTemplate, startLevel, type BackupV1, type LookupProvider, type PackStatus, type Settings, type VocabularyProfile } from '@vocabfirst/core';
  import { api } from '../lib/api';
  import { go } from '../lib/router.svelte';
  import { download } from '../lib/platform';
  import { fmt, pct, toast, ui } from '../lib/ui.svelte';
  import { languageName, setUiLanguage, t } from '../lib/i18n/index.svelte';
  import Info from '../components/Info.svelte';

  let s = $state<Settings>();
  let packs = $state<PackStatus>();
  let profile = $state<VocabularyProfile>();
  let customName = $state('');
  let customUrl = $state('');
  let customError = $state('');
  let updating = $state(false);
  let progress = $state('');

  onMount(async () => {
    [s, profile] = await Promise.all([api.settings.get(), api.calibration.profile()]);
    packs = await api.wordLists.status();
  });

  async function save(patch: Partial<Settings>) {
    try { s = await api.settings.update(patch); ui.achievements = s.achievementPopups; setUiLanguage(s.uiLanguage); } catch (e) { toast(t(e instanceof Error ? e.message : String(e))); }
  }
  const providers = $derived([...(s?.lookupProviders ?? [])].sort((a, b) => a.order - b.order));
  function setProviders(list: LookupProvider[]) { void save({ lookupProviders: list.map((p, i) => ({ ...p, order: i + 1 })) }); }
  function move(i: number, d: -1 | 1) {
    const l = [...providers];
    const j = i + d;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    setProviders(l);
  }
  function addCustom() {
    customError = '';
    if (!customName.trim() || !isValidTemplate(customUrl.trim())) { customError = t('Give it a name and an https URL containing {word}.', { word: '{word}' }); return; }
    setProviders([...providers, { id: `custom-${Date.now()}`, name: customName.trim(), enabled: true, order: 99, urlTemplate: customUrl.trim() }]);
    customName = ''; customUrl = '';
  }
  async function exportBackup() {
    const data = await api.backup.export();
    download(`vocabfirst-backup-${data.exportedAt.slice(0, 10)}.json`, JSON.stringify(data));
    toast(t('Backup exported'));
  }
  async function importBackup(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as BackupV1;
      if (!confirm(t('Replace all data on this device with the backup?'))) return;
      await api.backup.import(data);
      const restored = await api.settings.get();
      ui.achievements = restored.achievementPopups;
      setUiLanguage(restored.uiLanguage);
      toast(t('Backup restored'));
      go('library');
    } catch (err) { toast(err instanceof Error ? t(err.message) : t('Not a valid backup file')); }
  }
  async function updatePacks() {
    updating = true;
    try {
      await api.wordLists.install((p) => (progress = `${Math.round((p.loaded / Math.max(1, p.total)) * 100)} %`));
      packs = await api.wordLists.status();
      if (packs.pair) ui.pair = packs.pair;
      toast(t('Word lists updated'));
    } catch (e) { toast(t(e instanceof Error ? e.message : String(e))); } finally { updating = false; progress = ''; }
  }
  const mb = (n: number) => `${fmt(Math.round(n / 1024 / 102.4) / 10)} MB`;
  const source = { calibration: 'calibration', manual: 'manual', default: 'default' } as const;
  /** the word lists' languages, for the texts that name them */
  const langs = $derived({ source: languageName(ui.pair.source), target: languageName(ui.pair.target) });
</script>

<main class="screen">
  <header class="topbar"><button class="iconbtn" aria-label={t('Back')} onclick={() => go('library')}>‹</button><h1>{t('Settings')}</h1></header>
  {#if s}
    <div class="section-title">{t('Language')}</div>
    <div class="list">
      <label class="list-row"><span class="spacer">{t('App language')}</span>
        <select value={s.uiLanguage} onchange={(e) => save({ uiLanguage: e.currentTarget.value as Settings['uiLanguage'] })} class="fit" data-testid="set-language" aria-label={t('App language')}>
          <option value="auto">{t('Like the device')}</option><option value="en">English</option><option value="de">Deutsch</option>
        </select></label>
    </div>

    <div class="section-title">{t('Vocabulary level')}</div>
    <div class="list">
      <div class="list-row"><span class="spacer">{t('Level {level} · cutoff rank {rank}', { level: startLevel(profile?.cutoffRank ?? 8000), rank: fmt(profile?.cutoffRank ?? 8000) })}
        <Info text={t('Every word in the lists has a rank: how common it is. Words more common than your cutoff rank count as known and never become cards. The vocabulary check sets the cutoff; repeat it if your cards feel too easy or too hard.')} /></span>
        <span class="small muted">{t(source[profile?.source ?? 'default'])}</span></div>
      <button class="list-row" onclick={() => go('check', 'restart')}>{t('Repeat the vocabulary check')}</button>
    </div>

    <div class="section-title">{t('Practice')}</div>
    <div class="list">
      <label class="list-row" for="setting-1"><span class="spacer">{t('New cards per day')}
        <Info text={t('How many cards you see for the first time each day. Cards you have already seen come back when they are due, on top of these.')} /></span>
        <input id="setting-1" class="num" type="number" min="1" max="200" value={s.dailyNewLimit} onchange={(e) => save({ dailyNewLimit: +e.currentTarget.value })} /></label>
      <label class="list-row"><span class="spacer">{t('Daily goal (reviews)')}</span>
        <input class="num" type="number" min="1" max="500" value={s.dailyGoal} onchange={(e) => save({ dailyGoal: +e.currentTarget.value })} /></label>
      <label class="list-row stack-row" for="setting-2"><span class="row"><span class="spacer">{t('Coverage target')}
        <Info text={t('The share of a chapter’s words you should know before you read it. At 98 % you meet about one unknown word in 50, which most readers find comfortable. A chapter that reaches the target is ready to read; a higher target means more cards.')} /></span><strong>{pct(s.coverageTarget)}</strong></span>
        <input id="setting-2" type="range" min="0.95" max="1" step="0.005" value={s.coverageTarget} onchange={(e) => save({ coverageTarget: +e.currentTarget.value })} aria-label={t('Coverage target')} /></label>
      <label class="list-row" for="setting-3"><span class="spacer">{t('First-try correct')}
        <Info text={t('If you know a new card the very first time, you probably knew the word before. On: the card is retired at once and not shown again. Off: it is scheduled like every other card and comes back later.')} />
        <span class="small muted block">{s.retireOnFirstTry ? t('Retire the card') : t('Schedule normally')}</span></span>
        <input id="setting-3" type="checkbox" checked={s.retireOnFirstTry} onchange={(e) => save({ retireOnFirstTry: e.currentTarget.checked })} /></label>
      <label class="list-row stack-row" for="setting-4"><span class="spacer">{t('Swipe right before flipping')}
        <Info text={t('What a right swipe does on a card you haven’t turned over. Ask: you are asked once, and your answer is kept. Mark as known: the card is taken out for good. Count as “knew it”: it is graded like a normal right swipe and comes back later. Not allowed: turn the card over first.')} />
        <span class="small muted block">{t('A swipe on a card you haven’t turned over never shows its back')}</span></span>
        <select id="setting-4" value={s.frontSwipe} onchange={(e) => save({ frontSwipe: e.currentTarget.value as Settings['frontSwipe'] })} data-testid="set-frontswipe" aria-label={t('Swipe right before flipping')}>
          <option value="ask">{t('Ask')}</option><option value="known">{t('Mark as known')}</option><option value="grade">{t('Count as “knew it”')}</option><option value="off">{t('Not allowed')}</option>
        </select></label>
      <label class="list-row" for="setting-5"><span class="spacer">{t('Vocabulary check: flip before answering')}
        <Info text={t('Only for the vocabulary check. On: you see the translation before you answer, which keeps the result honest. Off: you can swipe a word straight away.')} /></span>
        <input id="setting-5" type="checkbox" checked={s.requireFlipBeforeGrade} onchange={(e) => save({ requireFlipBeforeGrade: e.currentTarget.checked })} /></label>
      <label class="list-row"><span class="spacer">{t('Gesture hints every session')}</span>
        <input type="checkbox" checked={s.gestureHints === 'everySession'} onchange={(e) => save({ gestureHints: e.currentTarget.checked ? 'everySession' : 'off' })} /></label>
      <label class="list-row"><span class="spacer">{t('Achievements and streaks')}
        <span class="small muted block">{t('Pop-ups, the trophy, streaks and medals')}</span></span>
        <input type="checkbox" checked={s.achievementPopups} onchange={(e) => save({ achievementPopups: e.currentTarget.checked })} /></label>
      <label class="list-row"><span class="spacer">{t('Undo button after swiping')}
        <span class="small muted block">{t('Without it, a swipe can only be undone with the Z key')}</span></span>
        <input type="checkbox" checked={s.undoAfterGrade} onchange={(e) => save({ undoAfterGrade: e.currentTarget.checked })} data-testid="set-undo" /></label>
      <label class="list-row"><span class="spacer">{t('Undo button after “Mark as known”')}</span>
        <input type="checkbox" checked={s.undoAfterKnown} onchange={(e) => save({ undoAfterKnown: e.currentTarget.checked })} data-testid="set-undo-known" /></label>
      <label class="list-row" for="setting-6"><span class="spacer">{t('Box level on the card back')}
        <Info text={t('Each card moves through 8 boxes. When you know it, it moves up a box and comes back after a longer break; when you don’t, it starts again at the first box. The dots show which box the card is in.')} />
        <span class="small muted block">{t('Dots: how many times in a row you knew the card')}</span></span>
        <input id="setting-6" type="checkbox" checked={s.showBoxLevel} onchange={(e) => save({ showBoxLevel: e.currentTarget.checked })} data-testid="set-boxlevel" /></label>
    </div>

    <div class="section-title">{t('Word selection (new imports and re-filtering)')}</div>
    <div class="list">
      <label class="list-row" for="setting-7"><span class="spacer">{t('Use {source} definitions when no {target} translation exists', langs)}
        <Info text={t('For some rare words the lists have no {target} translation, only a definition in {source}. On: such words become cards that show the definition. Off: they count as not in the lists. Applies to books you import or re-filter from now on.', langs)} /></span>
        <input id="setting-7" type="checkbox" checked={s.useDefinitions} onchange={(e) => save({ useDefinitions: e.currentTarget.checked })} /></label>
      <label class="list-row" for="setting-8"><span class="spacer">{t('Skip words nearly identical in {target}', langs)}
        <Info text={t('Words that look and mean almost the same in {target} are easy to understand while reading. On: they don’t become cards. Applies to books you import or re-filter from now on.', langs)} /></span>
        <input id="setting-8" type="checkbox" checked={s.skipCognates} onchange={(e) => save({ skipCognates: e.currentTarget.checked })} /></label>
    </div>

    <div class="section-title">{t('Lookup links')}</div>
    <div class="list">
      <label class="list-row" for="setting-9"><span class="spacer">{t('Links on the card back')}
        <Info text={t('Buttons on the back of a card that open the word in an online dictionary. Only the dictionaries for your word lists’ languages appear.')} /></span>
        <input id="setting-9" type="checkbox" checked={s.showLookupLinks} onchange={(e) => save({ showLookupLinks: e.currentTarget.checked })} data-testid="set-links" /></label>
      {#if s.showLookupLinks}
      {#each providers as p, i (p.id)}
        <div class="list-row">
          <input type="checkbox" checked={p.enabled} aria-label={t('Show {name}', { name: p.name })} onchange={(e) => setProviders(providers.map((x) => (x.id === p.id ? { ...x, enabled: e.currentTarget.checked } : x)))} />
          <span class="spacer">{p.name}</span>
          <button class="iconbtn" aria-label={t('Move {name} up', { name: p.name })} onclick={() => move(i, -1)}>↑</button>
          <button class="iconbtn" aria-label={t('Move {name} down', { name: p.name })} onclick={() => move(i, 1)}>↓</button>
          {#if !DEFAULT_LOOKUP_PROVIDERS.some((d) => d.id === p.id)}
            <button class="iconbtn" aria-label={t('Delete {name}', { name: p.name })} onclick={() => setProviders(providers.filter((x) => x.id !== p.id))}>×</button>
          {/if}
        </div>
      {/each}
      <div class="list-row stack-row">
        <span>{t('Your own dictionary')}
          <Info text={t('Add any online dictionary: copy the address of a search for some word and write {word} where that word was, for example https://www.duden.de/suchen/dudenonline/{word}. Only https addresses work.', { word: '{word}' })} /></span>
        <input type="text" placeholder={t('Name')} bind:value={customName} aria-label={t('Custom link name')} />
        <input type="url" placeholder={'https://example.com/?q={word}'} bind:value={customUrl} aria-label={t('Custom link URL')} />
        {#if customError}<span class="error small">{customError}</span>{/if}
        <button class="btn" onclick={addCustom}>{t('Add link')}</button>
      </div>
      {/if}
    </div>

    <div class="section-title">{t('Backup')}</div>
    <div class="list">
      <button class="list-row" onclick={exportBackup} data-testid="export">{t('Export all data (JSON)')}</button>
      <label class="list-row">{t('Import a backup…')}<input type="file" accept="application/json,.json" class="sr-only" onchange={importBackup} /></label>
    </div>

    <div class="section-title">{t('Word lists')}</div>
    <div class="list">
      {#if packs}
        {#if packs.name}<div class="list-row"><strong>{packs.name}</strong></div>{/if}
        {#each packs.packs as p (p.id)}
          <div class="list-row stack-row small">
            <strong>{p.id} · {p.version}</strong>
            <span class="muted">{t('{n} entries', { n: fmt(p.entryCount) })} · {mb(p.bytes)} · {p.licence}</span>
            {#each p.sources as src (src)}<span class="muted src">{src}</span>{/each}
          </div>
        {/each}
        <button class="list-row" onclick={updatePacks} disabled={updating}>
          {updating ? t('Updating… {progress}', { progress }) : packs.updateAvailable ? t('Update available — install') : t('Check for updates')}
        </button>
      {/if}
    </div>

    <div class="section-title">{t('About')}</div>
    <div class="card-box small stack about">
      <p><strong>VocabFirst</strong> — {t('learn a book’s rare words before you read it.')}</p>
      <p>{t('Word data:')} <a href="https://en.wiktionary.org/" target="_blank" rel="noopener noreferrer">Wiktionary</a> {t('contributors (CC BY-SA 4.0), extracted with')}
        <a href="https://kaikki.org/" target="_blank" rel="noopener noreferrer">Wiktextract / kaikki.org</a>;
        {t('German supplement from')} <a href="https://freedict.org/" target="_blank" rel="noopener noreferrer">FreeDict eng-deu</a> {t('(GPL, derived from TU Chemnitz “Ding”);')}
        {t('word frequencies from')} <a href="https://github.com/rspeer/wordfreq" target="_blank" rel="noopener noreferrer">wordfreq</a> {t('by Robyn Speer (CC BY-SA 4.0), used to rank the lists.')}</p>
      <p>{t('Spaced repetition inspired by jMemorize. See LICENSES.md for all attributions.')}</p>
    </div>
  {/if}
</main>

<style>
  .num { width: 84px; text-align: right; }
  /* as wide as its longest option, so the label beside it stays on one line */
  .fit { width: auto; flex: none; }
  .stack-row { flex-direction: column; align-items: stretch; gap: 8px; }
  .block { display: block; }
  .src { word-break: break-all; }
  .about p { margin: 0; }
</style>
