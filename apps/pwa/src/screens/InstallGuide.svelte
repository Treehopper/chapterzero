<script lang="ts">
  import { api } from '../lib/api';
  import { go } from '../lib/router.svelte';
  import { isIos } from '../lib/platform';
  import { t } from '../lib/i18n/index.svelte';
  const ios = isIos();
  async function cont() {
    await api.appState.update({ installGuideDismissed: true });
    go('download');
  }
  /** a translated sentence split around its {placeholders}, which are shown in bold */
  const parts = (s: string) => s.split(/(\{\w+\})/).filter(Boolean).map((p) => (/^\{\w+\}$/.test(p) ? { key: p.slice(1, -1) } : { text: p }));
</script>

{#snippet rich(s: string, bold: Record<string, string>)}{#each parts(s) as p, i (i)}{#if p.key !== undefined}<strong>{bold[p.key] ?? ''}</strong>{:else}{p.text}{/if}{/each}{/snippet}

<main class="screen stack">
  <h1 class="title">{t('Install Chapter 0 first')}</h1>
  <p>{@render rich(t('Add the app to your Home Screen {before} you import a book.'), { before: t('before') })} {t('Installed, it works offline and iOS keeps your progress; data entered in a Safari tab does not carry over to the installed app.')}</p>
  {#if ios}
    <ol class="steps card-box">
      <li>{@render rich(t('Tap the {share} button'), { share: t('Share') })} <span aria-hidden="true">⎋</span> {t("in Safari's toolbar.")}</li>
      <li>{@render rich(t('Choose {option}.'), { option: t('Add to Home Screen') })}</li>
      <li>{@render rich(t('Open {app} from your Home Screen.'), { app: 'Chapter 0' })}</li>
    </ol>
  {:else}
    <ol class="steps card-box">
      <li>{t('Open your browser menu.')}</li>
      <li>{@render rich(t('Choose {install} or {add}.'), { install: t('Install app'), add: t('Add to Home screen') })}</li>
      <li>{@render rich(t('Open {app} from your Home Screen.'), { app: 'Chapter 0' })}</li>
    </ol>
  {/if}
  <div class="spacer"></div>
  <button class="btn block" onclick={cont}>{t('Continue in the browser')}</button>
</main>

<style>
  .title { font-family: var(--serif); font-size: 30px; margin-top: 24px; }
  .steps { padding-left: 36px; line-height: 1.8; }
  main { display: flex; }
</style>
