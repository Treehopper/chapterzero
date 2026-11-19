<script lang="ts">
  /** Settings (§8.1): word lists (A3), level (H3), limits, behaviour toggles, lookup links (C17), backup (F1), about. */
  import { onMount } from 'svelte';
  import { DEFAULT_LOOKUP_PROVIDERS, isValidTemplate, startLevel, type BackupV1, type LookupProvider, type PackStatus, type Settings, type VocabularyProfile } from '@vocabfirst/core';
  import { api } from '../lib/api';
  import { go } from '../lib/router.svelte';
  import { download } from '../lib/platform';
  import { fmt, toast, ui } from '../lib/ui.svelte';

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
    try { s = await api.settings.update(patch); ui.achievements = s.achievementPopups; } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
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
    if (!customName.trim() || !isValidTemplate(customUrl.trim())) { customError = 'Give it a name and an https URL containing {word}.'; return; }
    setProviders([...providers, { id: `custom-${Date.now()}`, name: customName.trim(), enabled: true, order: 99, urlTemplate: customUrl.trim() }]);
    customName = ''; customUrl = '';
  }
  async function exportBackup() {
    const data = await api.backup.export();
    download(`vocabfirst-backup-${data.exportedAt.slice(0, 10)}.json`, JSON.stringify(data));
    toast('Backup exported');
  }
  async function importBackup(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as BackupV1;
      if (!confirm('Replace all data on this device with the backup?')) return;
      await api.backup.import(data);
      ui.achievements = (await api.settings.get()).achievementPopups;
      toast('Backup restored');
      go('library');
    } catch (err) { toast(err instanceof Error ? err.message : 'Not a valid backup file'); }
  }
  async function updatePacks() {
    updating = true;
    try {
      await api.wordLists.install((p) => (progress = `${Math.round((p.loaded / Math.max(1, p.total)) * 100)} %`));
      packs = await api.wordLists.status();
      toast('Word lists updated');
    } catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { updating = false; progress = ''; }
  }
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
</script>

<main class="screen">
  <header class="topbar"><button class="iconbtn" aria-label="Back" onclick={() => go('library')}>‹</button><h1>Settings</h1></header>
  {#if s}
    <div class="section-title">Vocabulary level</div>
    <div class="list">
      <div class="list-row"><span class="spacer">Level {startLevel(profile?.cutoffRank ?? 8000)} · cutoff rank {fmt(profile?.cutoffRank ?? 8000)}</span>
        <span class="small muted">{profile?.source ?? 'default'}</span></div>
      <button class="list-row" onclick={() => go('check', 'restart')}>Repeat the vocabulary check</button>
    </div>

    <div class="section-title">Practice</div>
    <div class="list">
      <label class="list-row"><span class="spacer">New cards per day</span>
        <input class="num" type="number" min="1" max="200" value={s.dailyNewLimit} onchange={(e) => save({ dailyNewLimit: +e.currentTarget.value })} /></label>
      <label class="list-row"><span class="spacer">Daily goal (reviews)</span>
        <input class="num" type="number" min="1" max="500" value={s.dailyGoal} onchange={(e) => save({ dailyGoal: +e.currentTarget.value })} /></label>
      <label class="list-row stack-row"><span class="row"><span class="spacer">Coverage target</span><strong>{(s.coverageTarget * 100).toFixed(1)} %</strong></span>
        <input type="range" min="0.95" max="1" step="0.005" value={s.coverageTarget} onchange={(e) => save({ coverageTarget: +e.currentTarget.value })} aria-label="Coverage target" /></label>
      <label class="list-row"><span class="spacer">First-try correct
        <span class="small muted block">{s.retireOnFirstTry ? 'Retire the card' : 'Schedule normally'}</span></span>
        <input type="checkbox" checked={s.retireOnFirstTry} onchange={(e) => save({ retireOnFirstTry: e.currentTarget.checked })} /></label>
      <label class="list-row"><span class="spacer">Swipe right before flipping
        <span class="small muted block">A swipe on a card you haven't turned over never shows its back</span></span>
        <select value={s.frontSwipe} onchange={(e) => save({ frontSwipe: e.currentTarget.value as Settings['frontSwipe'] })} data-testid="set-frontswipe" aria-label="Swipe right before flipping">
          <option value="ask">Ask</option><option value="known">Mark as known</option><option value="grade">Count as “knew it”</option><option value="off">Not allowed</option>
        </select></label>
      <label class="list-row"><span class="spacer">Vocabulary check: flip before answering</span>
        <input type="checkbox" checked={s.requireFlipBeforeGrade} onchange={(e) => save({ requireFlipBeforeGrade: e.currentTarget.checked })} /></label>
      <label class="list-row"><span class="spacer">Gesture hints every session</span>
        <input type="checkbox" checked={s.gestureHints === 'everySession'} onchange={(e) => save({ gestureHints: e.currentTarget.checked ? 'everySession' : 'off' })} /></label>
      <label class="list-row"><span class="spacer">Achievements and streaks
        <span class="small muted block">Pop-ups, the trophy, streaks and medals</span></span>
        <input type="checkbox" checked={s.achievementPopups} onchange={(e) => save({ achievementPopups: e.currentTarget.checked })} /></label>
      <label class="list-row"><span class="spacer">Undo button after swiping
        <span class="small muted block">Without it, a swipe can only be undone with the Z key</span></span>
        <input type="checkbox" checked={s.undoAfterGrade} onchange={(e) => save({ undoAfterGrade: e.currentTarget.checked })} data-testid="set-undo" /></label>
      <label class="list-row"><span class="spacer">Undo button after “Mark as known”</span>
        <input type="checkbox" checked={s.undoAfterKnown} onchange={(e) => save({ undoAfterKnown: e.currentTarget.checked })} data-testid="set-undo-known" /></label>
      <label class="list-row"><span class="spacer">Box level on the card back
        <span class="small muted block">Dots: how many times in a row you knew the card</span></span>
        <input type="checkbox" checked={s.showBoxLevel} onchange={(e) => save({ showBoxLevel: e.currentTarget.checked })} data-testid="set-boxlevel" /></label>
    </div>

    <div class="section-title">Word selection (new imports and re-filtering)</div>
    <div class="list">
      <label class="list-row"><span class="spacer">Use English definitions when no German translation exists</span>
        <input type="checkbox" checked={s.useEnglishDefinitions} onchange={(e) => save({ useEnglishDefinitions: e.currentTarget.checked })} /></label>
      <label class="list-row"><span class="spacer">Skip words nearly identical in German</span>
        <input type="checkbox" checked={s.skipCognates} onchange={(e) => save({ skipCognates: e.currentTarget.checked })} /></label>
    </div>

    <div class="section-title">Lookup links</div>
    <div class="list">
      {#each providers as p, i (p.id)}
        <div class="list-row">
          <input type="checkbox" checked={p.enabled} aria-label="Show {p.name}" onchange={(e) => setProviders(providers.map((x) => (x.id === p.id ? { ...x, enabled: e.currentTarget.checked } : x)))} />
          <span class="spacer">{p.name}</span>
          <button class="iconbtn" aria-label="Move {p.name} up" onclick={() => move(i, -1)}>↑</button>
          <button class="iconbtn" aria-label="Move {p.name} down" onclick={() => move(i, 1)}>↓</button>
          {#if !DEFAULT_LOOKUP_PROVIDERS.some((d) => d.id === p.id)}
            <button class="iconbtn" aria-label="Delete {p.name}" onclick={() => setProviders(providers.filter((x) => x.id !== p.id))}>×</button>
          {/if}
        </div>
      {/each}
      <div class="list-row stack-row">
        <input type="text" placeholder="Name" bind:value={customName} aria-label="Custom link name" />
        <input type="url" placeholder={'https://example.com/?q={word}'} bind:value={customUrl} aria-label="Custom link URL" />
        {#if customError}<span class="error small">{customError}</span>{/if}
        <button class="btn" onclick={addCustom}>Add link</button>
      </div>
    </div>

    <div class="section-title">Backup</div>
    <div class="list">
      <button class="list-row" onclick={exportBackup} data-testid="export">Export all data (JSON)</button>
      <label class="list-row">Import a backup…<input type="file" accept="application/json,.json" class="sr-only" onchange={importBackup} /></label>
    </div>

    <div class="section-title">Word lists</div>
    <div class="list">
      {#if packs}
        {#each packs.packs as p (p.id)}
          <div class="list-row stack-row small">
            <strong>{p.id} · {p.version}</strong>
            <span class="muted">{fmt(p.entryCount)} entries · {mb(p.bytes)} · {p.licence}</span>
            {#each p.sources as src (src)}<span class="muted src">{src}</span>{/each}
          </div>
        {/each}
        <button class="list-row" onclick={updatePacks} disabled={updating}>
          {updating ? `Updating… ${progress}` : packs.updateAvailable ? 'Update available — install' : 'Check for updates'}
        </button>
      {/if}
    </div>

    <div class="section-title">About</div>
    <div class="card-box small stack about">
      <p><strong>VocabFirst</strong> — learn a book's rare words before you read it.</p>
      <p>Word data: <a href="https://en.wiktionary.org/" target="_blank" rel="noopener noreferrer">Wiktionary</a> contributors (CC BY-SA 4.0),
        extracted with <a href="https://kaikki.org/" target="_blank" rel="noopener noreferrer">Wiktextract / kaikki.org</a>;
        German supplement from <a href="https://freedict.org/" target="_blank" rel="noopener noreferrer">FreeDict eng-deu</a> (GPL, derived from TU Chemnitz “Ding”);
        word frequencies from <a href="https://github.com/rspeer/wordfreq" target="_blank" rel="noopener noreferrer">wordfreq</a> by Robyn Speer (CC BY-SA 4.0), used to rank the lists.</p>
      <p>Spaced repetition inspired by jMemorize. See LICENSES.md for all attributions.</p>
    </div>
  {/if}
</main>

<style>
  .num { width: 84px; text-align: right; }
  .stack-row { flex-direction: column; align-items: stretch; gap: 8px; }
  .block { display: block; }
  .src { word-break: break-all; }
  .about p { margin: 0; }
</style>
