<script lang="ts">
  /** Asked on the first right swipe on a card never turned over (C7): mark it as known, or just count "knew it"? */
  import Sheet from './Sheet.svelte';
  let { word, onanswer }: { word: string; onanswer: (choice: 'known' | 'grade' | 'flip') => void } = $props();
</script>

<Sheet label="Mark as known?" onclose={() => onanswer('flip')}>
  <div class="stack" data-testid="front-swipe-confirm">
    <h2>Mark “{word}” as known?</h2>
    <p>You swiped right without turning the card over. Known words leave your cards for good, so you won't see them again.</p>
    <button class="btn primary block" onclick={() => onanswer('known')} data-testid="front-known">Yes, mark as known</button>
    <button class="btn block" onclick={() => onanswer('grade')} data-testid="front-grade">No, count it as “knew it” and keep reviewing it</button>
    <button class="btn block" onclick={() => onanswer('flip')}>Cancel, I'll flip first</button>
    <p class="small muted">Your choice is used for later swipes too; change it in Settings › Swipe right before flipping.</p>
  </div>
</Sheet>
