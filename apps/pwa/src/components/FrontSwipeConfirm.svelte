<script lang="ts">
  /** Asked once, on the first swipe before a flip: should a swipe on the front grade right away? */
  import Sheet from './Sheet.svelte';
  let { dir, onanswer }: { dir: 1 | -1; onanswer: (gradeFromFront: boolean) => void } = $props();
</script>

<Sheet label="Grade without flipping?" onclose={() => onanswer(false)}>
  <div class="stack" data-testid="front-swipe-confirm">
    <h2>Grade without flipping?</h2>
    <p>You swiped before turning the card over. Should a swipe on the front count right away
      (right = knew it, left = didn't know)?</p>
    <p class="small muted">You can change this later in Settings › Flip before grading.</p>
    <button class="btn primary block" onclick={() => onanswer(true)}>Yes, count it as “{dir === 1 ? 'knew it' : "didn't know"}”</button>
    <button class="btn block" onclick={() => onanswer(false)}>No, I'll flip first</button>
  </div>
</Sheet>
