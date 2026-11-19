<script lang="ts">
  /** Vocabulary check (H2): asked once, on the first swipe before a flip: should a swipe on the front answer right away? */
  import Sheet from './Sheet.svelte';
  import { t } from '../lib/i18n/index.svelte';
  let { dir, onanswer }: { dir: 1 | -1; onanswer: (gradeFromFront: boolean) => void } = $props();
</script>

<Sheet label={t('Grade without flipping?')} onclose={() => onanswer(false)}>
  <div class="stack" data-testid="front-swipe-confirm">
    <h2>{t('Grade without flipping?')}</h2>
    <p>{t("You swiped before turning the card over. Should a swipe on the front count right away (right = knew it, left = didn't know)?")}</p>
    <p class="small muted">{t('You can change this later in Settings › Vocabulary check: flip before answering.')}</p>
    <button class="btn primary block" onclick={() => onanswer(true)}>{t('Yes, count it as “{answer}”', { answer: dir === 1 ? t('knew it') : t("didn't know") })}</button>
    <button class="btn block" onclick={() => onanswer(false)}>{t("No, I'll flip first")}</button>
  </div>
</Sheet>
