<script lang="ts">
  /**
   * The course card: one predict-then-run lesson at a time, docked to the
   * bottom of the landscape. Predict (answer buttons) → running (the
   * landscape is the show) → reveal (verdict + explanation + next).
   * The coach is silent while the course is active — this card narrates.
   */

  import { courseStore, raceStore, divergenceStore } from '../stores/stores';
  import { runEndStore } from '../utils/trainer';
  import { lessons, answerLesson, nextLesson, closeCourse, restartCourse } from '../utils/lessons';
  import { GraduationCap, X, ArrowRight, RotateCcw } from 'lucide-svelte';

  $: cs = $courseStore;
  $: lesson = lessons[Math.min(cs.idx, lessons.length - 1)];
  $: isCorrect = cs.answer === lesson.correctIndex;

  // Flip running → reveal when the launched run finishes (or blows up —
  // for the step-size lesson, divergence IS the observation).
  $: if (cs.active && cs.phase === 'running') {
    const raceDone = lesson.kind === 'race' && $raceStore !== null && !$raceStore.running;
    const trainDone = lesson.kind !== 'race' && $runEndStore !== null;
    if (raceDone || trainDone || $divergenceStore) {
      courseStore.update(s => (s.phase === 'running' ? { ...s, phase: 'reveal' } : s));
    }
  }
</script>

{#if cs.active}
  <div class="course-card" role="dialog" aria-label="Course lesson">
    {#if cs.phase === 'done'}
      <div class="card-head">
        <span class="badge done-badge"><GraduationCap size={13} strokeWidth={2.4} /> Course</span>
        <span class="title">That's the whole story</span>
        <button class="close-x" on:click={closeCourse} aria-label="Close course"><X size={15} strokeWidth={2.4} /></button>
      </div>
      <p class="question">
        Slope → step size → traps → plateaus → momentum → SGD → conditioning →
        adaptivity → saddles — and it all ran on a real (tiny) neural network at the end.
        Everything bigger is these ideas, repeated billions of times.
      </p>
      <div class="card-footer">
        <div class="dots" aria-hidden="true">
          {#each lessons as _l, i (i)}
            <span class="dot done"></span>
          {/each}
        </div>
        <button class="next-btn" on:click={restartCourse}>
          <RotateCcw size={13} strokeWidth={2.4} />
          <span>Start over</span>
        </button>
      </div>
    {:else}
      <div class="card-head">
        <span class="badge">Lesson {cs.idx + 1}/{lessons.length}</span>
        <span class="title">{lesson.title}</span>
        <button class="close-x" on:click={closeCourse} aria-label="Close course"><X size={15} strokeWidth={2.4} /></button>
      </div>

      <p class="question">{lesson.question}</p>

      <div class="options">
        {#each lesson.options as opt, i (i)}
          <button
            class="option"
            class:selected={cs.answer === i}
            class:correct={cs.phase === 'reveal' && i === lesson.correctIndex}
            class:wrong={cs.phase === 'reveal' && cs.answer === i && i !== lesson.correctIndex}
            disabled={cs.phase !== 'predict'}
            on:click={() => answerLesson(i)}
          >
            <span class="opt-mark">
              {cs.phase === 'reveal' && i === lesson.correctIndex ? '✓' : String.fromCharCode(65 + i)}
            </span>
            <span>{opt}</span>
          </button>
        {/each}
      </div>

      {#if cs.phase === 'running'}
        <div class="running-note">
          <span class="pulse" aria-hidden="true"></span>
          <span>Running — watch the landscape…</span>
        </div>
      {/if}

      {#if cs.phase === 'reveal'}
        <p class="explain" class:explain-correct={isCorrect}>
          <strong>{isCorrect ? 'Correct.' : 'Not quite — see the highlighted answer.'}</strong>
          {lesson.explain}
        </p>
      {/if}

      <div class="card-footer">
        <div class="dots" aria-hidden="true">
          {#each lessons as _l, i (i)}
            <span class="dot" class:done={i < cs.idx} class:current={i === cs.idx}></span>
          {/each}
        </div>
        {#if cs.phase === 'reveal'}
          <button class="next-btn" on:click={nextLesson}>
            <span>{cs.idx === lessons.length - 1 ? 'Finish' : 'Next'}</span>
            <ArrowRight size={13} strokeWidth={2.6} />
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .course-card {
    position: absolute;
    bottom: 6px;
    left: 50%;
    transform: translateX(-50%);
    width: min(94%, 470px);
    border-radius: 12px;
    border: 1px solid var(--color-border);
    padding: 0.7rem 0.85rem 0.6rem;
    z-index: 6;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(8px);
    animation: cardIn 0.25s ease;
  }

  @keyframes cardIn {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  :global([data-theme='light']) .course-card {
    background: rgba(255, 255, 255, 0.93);
    color: #1e293b;
  }

  :global([data-theme='dark']) .course-card {
    background: rgba(10, 16, 28, 0.92);
    color: #e2e8f0;
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.45rem;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    flex-shrink: 0;
    font-size: 0.625rem;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #10b981;
    background: rgba(16, 185, 129, 0.14);
    border-radius: 6px;
    padding: 0.16rem 0.45rem;
    font-family: 'SF Mono', Monaco, monospace;
  }

  .title {
    font-size: 0.875rem;
    font-weight: 700;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .close-x {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    opacity: 0.55;
    cursor: pointer;
    padding: 0;
  }

  .close-x:hover { opacity: 1; }

  .question {
    margin: 0 0 0.55rem;
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    text-align: left;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font-size: 0.7813rem;
    line-height: 1.35;
    padding: 0.42rem 0.55rem;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease, opacity 0.15s ease;
  }

  .option:not(:disabled):hover {
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.07);
  }

  .option:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .option.selected {
    border-color: rgba(16, 185, 129, 0.55);
    opacity: 0.9;
  }

  .option.correct {
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.13);
    opacity: 1;
  }

  .option.wrong {
    border-color: rgba(239, 68, 68, 0.65);
    background: rgba(239, 68, 68, 0.08);
    opacity: 0.95;
  }

  .opt-mark {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    font-size: 0.625rem;
    font-weight: 800;
    font-family: 'SF Mono', Monaco, monospace;
    background: rgba(148, 163, 184, 0.18);
  }

  .option.correct .opt-mark {
    background: #10b981;
    color: #fff;
  }

  .running-note {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin-top: 0.55rem;
    font-size: 0.75rem;
    font-weight: 600;
    opacity: 0.8;
  }

  .pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #10b981;
    animation: coursePulse 1s ease-in-out infinite;
  }

  @keyframes coursePulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.75); }
  }

  .explain {
    margin: 0.55rem 0 0;
    padding: 0.45rem 0.6rem;
    font-size: 0.75rem;
    line-height: 1.5;
    border-left: 3px solid rgba(239, 68, 68, 0.7);
    border-radius: 4px;
    background: rgba(148, 163, 184, 0.08);
  }

  .explain.explain-correct {
    border-left-color: #10b981;
  }

  .explain strong {
    font-weight: 700;
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: 0.55rem;
    min-height: 22px;
  }

  .dots {
    display: flex;
    gap: 5px;
    align-items: center;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: transparent;
    border: 1px solid var(--color-border);
  }

  .dot.done {
    background: #10b981;
    border-color: #10b981;
  }

  .dot.current {
    border-color: #10b981;
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.25);
  }

  .next-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border: none;
    border-radius: 8px;
    background: #10b981;
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.34rem 0.7rem;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.1s ease;
  }

  .next-btn:hover {
    background: #059669;
  }

  .next-btn:active {
    transform: scale(0.97);
  }

  @media (max-width: 768px) {
    .course-card { width: 96%; padding: 0.55rem 0.65rem 0.5rem; }
    .question { font-size: 0.75rem; }
    .option { font-size: 0.7188rem; }
  }
</style>
