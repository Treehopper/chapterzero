<script lang="ts">
  /** How to study (C19): Quick start, a number of cards, or a time. An open session is continued instead.
      The first time, a spoiler notice: cards show the book's sentence with the word, which can give away the story. */
  import { onMount } from 'svelte';
  import type { Settings } from '@vocabfirst/core';
  import Sheet from './Sheet.svelte';
  import { api } from '../lib/api';
  import { t } from '../lib/i18n/index.svelte';
  import { go } from '../lib/router.svelte';

  let { bookId, due = 0, chapter, onclose }: {
    bookId: string; due?: number; chapter?: { index: number; title: string }; onclose: () => void;
  } = $props();

  let spoiler = $state(false);
  let sentence = $state<Settings['bookSentence']>('both');
  onMount(async () => {
    const [app, s] = await Promise.all([api.appState.get(), api.settings.get()]);
    sentence = s.bookSentence;
    spoiler = !app.spoilerWarned;
  });
  async function setSentence(v: Settings['bookSentence']) {
    sentence = v;
    await api.settings.update({ bookSentence: v });
  }

  const start = (how?: string) => {
    if (spoiler) void api.appState.update({ spoilerWarned: true });
    go('study', bookId, ...(chapter ? [String(chapter.index)] : []), ...(how ? [how] : []));
    onclose();   // after go: closing clears the props this reads
  };
</script>

<Sheet label={chapter ? t('Get this chapter ready') : t('Get ready to read')} {onclose}>
  <div class="stack" data-testid="start-study">
    <h2>{chapter ? t('Get this chapter ready') : t('Get ready to read')}</h2>
    {#if chapter}<p class="muted chapter" data-testid="start-chapter">{chapter.title}</p>{/if}
    {#if spoiler}
      <div class="spoiler stack" data-testid="spoiler-warning">
        <strong>⚠️ {t('Spoiler alert')}</strong>
        <span class="small">{t('Cards show the sentence from the book in which the word occurs. It can give away the story, such as what happens to a character.')}</span>
        <label class="row small">{t('Sentence from the book')}<span class="spacer"></span>
          <select value={sentence} onchange={(e) => setSentence(e.currentTarget.value as Settings['bookSentence'])} data-testid="spoiler-sentence">
            <option value="both">{t('Front and back')}</option><option value="back">{t('Back only')}</option><option value="off">{t('Off')}</option>
          </select></label>
        <span class="small muted">{t('You can change this later in Settings.')}</span>
      </div>
    {/if}
    <button class="btn primary block quick" onclick={() => start()} data-testid="quick-start">
      <strong>{t('Quick start')}</strong>
      <span class="small">{due
        ? (chapter ? t('{n} due reviews, then new cards until this chapter is ready', { n: due }) : t('{n} due reviews, then new cards until the book is ready', { n: due }))
        : (chapter ? t('Due reviews, then new cards until this chapter is ready') : t('Due reviews, then new cards until the book is ready'))}</span>
    </button>

    <div class="section-title">{t('Number of cards')}</div>
    <div class="row choices">
      {#each [10, 20, 50] as n (n)}
        <button class="btn" onclick={() => start(`cards-${n}`)} data-testid="start-cards-{n}">{t('{n} cards', { n })}</button>
      {/each}
    </div>

    <div class="section-title">{t('Time')}</div>
    <div class="row choices">
      {#each [5, 10, 20] as m (m)}
        <button class="btn" onclick={() => start(`min-${m}`)} data-testid="start-min-{m}">{t('{n} min', { n: m })}</button>
      {/each}
    </div>
  </div>
</Sheet>

<style>
  .quick { display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: 64px; }
  .quick strong { font-size: 18px; }
  .quick span { opacity: 0.85; }
  .spoiler { gap: 6px; padding: 12px; border-radius: 12px; background: var(--surface-2); }
  .spoiler label { white-space: nowrap; gap: 8px; }
  .spoiler select { width: auto; min-width: 0; flex: none; }
  .chapter { margin: -8px 0 0; overflow-wrap: anywhere; }
  .choices { gap: 8px; }
  .choices .btn { flex: 1; min-height: 48px; }
</style>
