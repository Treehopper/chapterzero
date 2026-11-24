<script lang="ts">
  /** A2: first-run word-list download with bytes / percent; resumes after a failure. Starts on a tap only, so nobody
      downloads over mobile data by accident. */
  import { onMount } from 'svelte';
  import type { PackStatus } from '@chapterzero/core';
  import { api } from '../lib/api';
  import { go } from '../lib/router.svelte';
  import { requestPersistence } from '../lib/platform';
  import { ui } from '../lib/ui.svelte';
  import { i18n, languageName, t } from '../lib/i18n/index.svelte';

  let status = $state<PackStatus>();
  let progress = $state<{ loaded: number; total: number; phase: string }>();
  let error = $state('');
  let running = $state(false);
  const mb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB`
    : `${(n / 1024 / 1024).toLocaleString(i18n.locale === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`);
  const langs = $derived({ source: languageName(ui.pair.source), target: languageName(ui.pair.target) });
  const total = $derived(status?.available?.reduce((n, p) => n + p.bytes, 0) ?? 0);

  onMount(async () => { status = await api.wordLists.status(); });

  async function start() {
    error = '';
    running = true;
    try {
      await api.wordLists.install((p) => (progress = p));
      await requestPersistence();
      ui.pair = (await api.wordLists.status()).pair ?? ui.pair;
      const profile = await api.calibration.profile();
      go(profile ? 'library' : 'check');
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      running = false;
    }
  }
</script>

<main class="screen stack">
  <h1 class="title">{t('Word lists')}</h1>
  <p>{t('Chapter 0 ships graded lists of rare {source} words with {target} translations, built from Wiktionary, FreeDict and wordfreq.', langs)}
    {t('They are downloaded once and then work offline.')}</p>
  <p class="muted small" data-testid="wifi-hint">📶 {t('Best done on Wi-Fi.')}</p>
  <div class="card-box stack">
    <div class="row"><strong>{status?.name ?? `${langs.source} → ${langs.target}`}</strong><span class="spacer"></span><span class="muted small">{total ? `${mb(total)}` : ''}</span></div>
    <div class="progressbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress && progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0}>
      <div style:width="{progress && progress.total ? (progress.loaded / progress.total) * 100 : 0}%"></div>
    </div>
    <div class="row small muted" data-testid="download-progress">
      {#if progress}
        <span>{progress.phase === 'installing' ? t('Installing…') : progress.phase === 'done' ? t('Done') : t('Downloading…')}</span>
        <span class="spacer"></span>
        <span>{mb(progress.loaded)} / {mb(progress.total)} · {progress.total ? Math.round((progress.loaded / progress.total) * 100) : 100} %</span>
      {:else}<span>{t('Not downloaded yet')}</span>{/if}
    </div>
  </div>
  {#if error}<p class="error" role="alert">{t(error)}</p>{/if}
  {#if !running && !status?.installed}
    <button class="btn primary block" onclick={start} disabled={!status} data-testid="download-start">
      {error ? t('Try again') : progress ? t('Continue download') : total ? t('Download {size}', { size: mb(total) }) : t('Download')}
    </button>
  {/if}
</main>

<style>
  .title { font-family: var(--serif); font-size: 30px; margin-top: 24px; }
</style>
