<script lang="ts">
  /** Asked on the first right swipe on a card never turned over (C7): mark it as known, or just count "knew it"? */
  import Sheet from './Sheet.svelte';
  import { t } from '../lib/i18n/index.svelte';
  let { word, onanswer }: { word: string; onanswer: (choice: 'known' | 'grade' | 'flip') => void } = $props();
</script>

<Sheet label={t('Mark as known?')} onclose={() => onanswer('flip')}>
  <div class="stack" data-testid="front-swipe-confirm">
    <h2>{t('Mark “{word}” as known?', { word })}</h2>
    <p>{t("You swiped right without turning the card over. Known words leave your cards for good, so you won't see them again.")}</p>
    <button class="btn primary block" onclick={() => onanswer('known')} data-testid="front-known">{t('Yes, mark as known')}</button>
    <button class="btn block" onclick={() => onanswer('grade')} data-testid="front-grade">{t('No, count it as “knew it” and keep reviewing it')}</button>
    <button class="btn block" onclick={() => onanswer('flip')}>{t("Cancel, I'll flip first")}</button>
    <p class="small muted">{t('Your choice is used for later swipes too; change it in Settings › Swipe right before flipping.')}</p>
  </div>
</Sheet>
