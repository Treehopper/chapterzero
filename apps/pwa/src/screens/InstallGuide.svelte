<script lang="ts">
  import { api } from '../lib/api';
  import { go } from '../lib/router.svelte';
  import { isIos } from '../lib/platform';
  const ios = isIos();
  async function cont() {
    await api.appState.update({ installGuideDismissed: true });
    go('download');
  }
</script>

<main class="screen stack">
  <h1 class="title">Install VocabFirst first</h1>
  <p>Add the app to your Home Screen <strong>before</strong> you import a book. Installed, it works offline and iOS keeps your progress;
    data entered in a Safari tab does not carry over to the installed app.</p>
  {#if ios}
    <ol class="steps card-box">
      <li>Tap the <strong>Share</strong> button <span aria-hidden="true">⎋</span> in Safari's toolbar.</li>
      <li>Choose <strong>Add to Home Screen</strong>.</li>
      <li>Open <strong>VocabFirst</strong> from your Home Screen.</li>
    </ol>
  {:else}
    <ol class="steps card-box">
      <li>Open your browser menu.</li>
      <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
      <li>Open <strong>VocabFirst</strong> from your Home Screen.</li>
    </ol>
  {/if}
  <div class="spacer"></div>
  <button class="btn block" onclick={cont}>Continue in the browser</button>
</main>

<style>
  .title { font-family: var(--serif); font-size: 30px; margin-top: 24px; }
  .steps { padding-left: 36px; line-height: 1.8; }
  main { display: flex; }
</style>
