<script lang="ts">
  /**
   * One clean call-to-action per guide chapter. Where a chapter has a guided
   * lesson, that's the primary action (filled, with the predict → run → learn
   * tagline so it's self-explaining) and the one-click demo becomes a quiet
   * "just watch a quick demo" link beneath it. Chapters with only a demo show
   * a single labelled button. No two competing buttons.
   */
  import { GraduationCap, Play } from 'lucide-svelte';

  export let lessonId: string | null = null;
  export let onLesson: (() => void) | null = null;
  export let demo: (() => void) | null = null;
  export let demoLabel = 'Watch a quick demo';
</script>

<div class="ch-cta" class:has-lesson={lessonId}>
  {#if lessonId && onLesson}
    <button class="ch-cta-primary" on:click={onLesson}>
      <GraduationCap size={15} strokeWidth={2.4} />
      <span>Learn by doing</span>
    </button>
    {#if demo}
      <button class="ch-cta-demo" on:click={demo}>
        <Play size={12} strokeWidth={2.5} /> just watch a quick demo
      </button>
    {/if}
  {:else if demo}
    <button class="ch-cta-solo" on:click={demo}>
      <Play size={13} strokeWidth={2.5} /> <span>{demoLabel}</span>
    </button>
  {/if}
</div>

<style>
  .ch-cta {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    margin-top: 1.1rem;
  }

  /* Primary "Learn by doing" — a single-line, vibrant emerald pill with
     near-black text. Bright in both modes (so it never reads "dark" in day
     mode) while keeping high contrast — the same treatment as the app's Train
     button in light mode. */
  .ch-cta-primary {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 9px;
    background: #10b981;
    color: #04130d;
    font-size: 0.875rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
    transition: background 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
  }
  .ch-cta-primary:hover { background: #34d399; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35); }
  .ch-cta-primary:active { transform: scale(0.98); }

  .ch-cta-demo {
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .ch-cta-demo:hover { color: #10b981; }

  .ch-cta-solo {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.8rem;
    border: 1px solid rgba(16, 185, 129, 0.45);
    border-radius: 8px;
    background: rgba(16, 185, 129, 0.1);
    color: #10b981;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }
  .ch-cta-solo:hover { background: rgba(16, 185, 129, 0.22); border-color: #10b981; transform: translateY(-1px); }
</style>
