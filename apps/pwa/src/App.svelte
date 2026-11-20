<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  import { router, replace } from './lib/router.svelte';
  import { isStandalone } from './lib/platform';
  import { ui } from './lib/ui.svelte';
  import { setUiLanguage, t } from './lib/i18n/index.svelte';
  import { applyTheme } from './lib/theme';
  import Overlays from './components/Overlays.svelte';
  import InstallGuide from './screens/InstallGuide.svelte';
  import Download from './screens/Download.svelte';
  import Check from './screens/Check.svelte';
  import Library from './screens/Library.svelte';
  import ImportPreview from './screens/ImportPreview.svelte';
  import BookOverview from './screens/BookOverview.svelte';
  import Study from './screens/Study.svelte';
  import Statistics from './screens/Statistics.svelte';
  import Words from './screens/Words.svelte';
  import Achievements from './screens/Achievements.svelte';
  import Reader from './screens/Reader.svelte';
  import Settings from './screens/Settings.svelte';

  let booted = $state(false);
  let fatal = $state('');
  const SETUP = new Set(['install', 'download', 'check']);
  const KNOWN = new Set([...SETUP, 'library', 'import', 'book', 'study', 'stats', 'words', 'read', 'achievements', 'settings']);

  onMount(async () => {
    try {
      const [status, profile, state, settings] = await Promise.all([api.wordLists.status({ remote: false }), api.calibration.profile(), api.appState.get(), api.settings.get()]);
      ui.achievements = settings.achievementPopups;
      setUiLanguage(settings.uiLanguage);
      applyTheme(settings.theme);
      if (status.pair) ui.pair = status.pair;
      const r = router.route;
      if (!status.installed) {
        if (r.name !== 'install' && r.name !== 'download') replace(!isStandalone() && !state.installGuideDismissed ? 'install' : 'download');
      } else if (!profile) {
        replace('check');
      } else if (!KNOWN.has(r.name) || SETUP.has(r.name)) {
        const last = state.lastRoute?.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
        if (last && KNOWN.has(last[0]) && !SETUP.has(last[0])) replace(last[0], ...last.slice(1));
        else replace('library');
      }
      booted = true;
    } catch (e) {
      fatal = e instanceof Error ? e.message : String(e);
    }
  });

  // remember the route so a relaunch resumes there (C5, §7.4)
  $effect(() => {
    const r = router.route;
    if (!booted || !KNOWN.has(r.name) || SETUP.has(r.name)) return;
    void api.appState.update({ lastRoute: '#/' + [r.name, ...r.params].map(encodeURIComponent).join('/') });
  });
</script>

{#if fatal}
  <main class="screen"><h1>{t('Something went wrong')}</h1><p class="error">{t(fatal)}</p><button class="btn" onclick={() => location.reload()}>{t('Reload')}</button></main>
{:else if booted}
  <!-- Words and the reader keep themselves across tab and chapter changes (only the URL is updated) -->
  {#key router.route.name === 'words' || router.route.name === 'read' ? `${router.route.name}/${router.route.params[0]}` : router.route.name + '/' + router.route.params.join('/')}
    {#if router.route.name === 'install'}<InstallGuide />
    {:else if router.route.name === 'download'}<Download />
    {:else if router.route.name === 'check'}<Check />
    {:else if router.route.name === 'import'}<ImportPreview draftId={router.route.params[0]} />
    {:else if router.route.name === 'book'}<BookOverview bookId={router.route.params[0]} />
    {:else if router.route.name === 'study'}<Study bookId={router.route.params[0]} chapter={router.route.params[1]} how={router.route.params[2]} />
    {:else if router.route.name === 'stats'}<Statistics sessionId={router.route.params[0]} />
    {:else if router.route.name === 'words'}<Words bookId={router.route.params[0]} tab={router.route.params[1]} chapter={router.route.params[2]} />
    {:else if router.route.name === 'read'}<Reader bookId={router.route.params[0]} chapter={router.route.params[1]} />
    {:else if router.route.name === 'achievements'}<Achievements />
    {:else if router.route.name === 'settings'}<Settings />
    {:else}<Library />
    {/if}
  {/key}
{:else}
  <main class="screen boot" aria-busy="true"><div class="logo">VocabFirst</div></main>
{/if}
<Overlays />

<style>
  .boot { display: grid; place-items: center; }
  .logo { font-family: var(--serif); font-size: 28px; font-weight: 700; opacity: 0.6; }
</style>
