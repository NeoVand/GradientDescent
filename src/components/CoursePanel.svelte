<script lang="ts">
  /**
   * The course card: one lesson at a time, in four explicit steps —
   * 1 Setup (what's staged, where to look) → 2 Predict (commit to an
   * answer) → 3 Run (you launch it) → 4 Learn (the explanation).
   *
   * Fully navigable: ‹/› move between lessons, the progress dots jump
   * anywhere, and the card itself drags by its header if it's in the way.
   */

  import { courseStore, raceStore, divergenceStore } from '../stores/stores';
  import { runEndStore } from '../utils/trainer';
  import {
    lessons,
    enterLesson,
    beginPredict,
    answerLesson,
    launchLesson,
    nextLesson,
    prevLesson,
    closeCourse,
    restartCourse
  } from '../utils/lessons';
  import { GraduationCap, X, ArrowRight, RotateCcw, ChevronLeft, ChevronRight, Play, Eye } from 'lucide-svelte';

  $: cs = $courseStore;
  $: lesson = lessons[Math.min(cs.idx, lessons.length - 1)];
  $: isCorrect = cs.answer === lesson.correctIndex;

  const PHASE_STEPS = ['Setup', 'Predict', 'Run', 'Learn'] as const;
  $: phaseIndex =
    cs.phase === 'setup' ? 0 : cs.phase === 'predict' ? 1 : cs.phase === 'running' ? 2 : 3;

  // Flip running → reveal when the launched run finishes (or blows up —
  // for the step-size lesson, divergence IS the observation).
  $: if (cs.active && cs.phase === 'running') {
    const raceDone = lesson.kind === 'race' && $raceStore !== null && !$raceStore.running;
    const trainDone = lesson.kind !== 'race' && $runEndStore !== null;
    if (raceDone || trainDone || $divergenceStore) {
      courseStore.update(s => (s.phase === 'running' ? { ...s, phase: 'reveal' } : s));
    }
  }

  // ---------- drag (by the header) ----------
  let dragX = 0;
  let dragY = 0;
  let dragging = false;
  let startPointer = { x: 0, y: 0 };
  let startOffset = { x: 0, y: 0 };

  // Reopening the course brings the card home — a card dragged half out
  // of the clipped container must never be lost for good.
  let wasActive = false;
  $: {
    if (cs.active && !wasActive) {
      dragX = 0;
      dragY = 0;
    }
    wasActive = cs.active;
  }

  function onHeaderDown(e: PointerEvent) {
    // Buttons inside the header keep their clicks
    if ((e.target as HTMLElement).closest('button')) return;
    dragging = true;
    startPointer = { x: e.clientX, y: e.clientY };
    startOffset = { x: dragX, y: dragY };
  }

  function onWindowMove(e: PointerEvent) {
    if (!dragging) return;
    // Clamped to the viewport so the header always stays reachable
    const mx = Math.max(120, window.innerWidth / 2 - 120);
    const my = Math.max(80, window.innerHeight / 2 - 60);
    dragX = Math.max(-mx, Math.min(mx, startOffset.x + (e.clientX - startPointer.x)));
    dragY = Math.max(-my, Math.min(my, startOffset.y + (e.clientY - startPointer.y)));
  }

  function onWindowUp() {
    dragging = false;
  }
</script>

<svelte:window on:pointermove={onWindowMove} on:pointerup={onWindowUp} />

{#if cs.active}
  <div
    class="course-card"
    class:dragging
    style="transform: translate(-50%, -50%) translate({dragX}px, {dragY}px);"
    role="dialog"
    aria-label="Course lesson"
  >
    {#if cs.phase === 'done'}
      <div class="card-head" role="group" on:pointerdown={onHeaderDown}>
        <span class="badge done-badge"><GraduationCap size={13} strokeWidth={2.4} /> Course</span>
        <span class="title">That's the whole story</span>
        <button class="close-x" on:click={closeCourse} aria-label="Close course"><X size={15} strokeWidth={2.4} /></button>
      </div>
      <p class="body-text">
        Slope → step size → traps → plateaus → momentum → SGD → conditioning →
        adaptivity → saddles — and it all ran on a real (tiny) neural network at the end.
        Everything bigger is these ideas, repeated billions of times.
      </p>
      <div class="card-footer">
        <div class="dots" aria-hidden="true">
          {#each lessons as _l, i (i)}
            <button class="dot done" on:click={() => enterLesson(i)} title={lessons[i].title}></button>
          {/each}
        </div>
        <button class="next-btn" on:click={restartCourse}>
          <RotateCcw size={13} strokeWidth={2.4} />
          <span>Start over</span>
        </button>
      </div>
    {:else}
      <div class="card-head" class:grab={!dragging} role="group" on:pointerdown={onHeaderDown} title="Drag to move">
        <span class="badge">Lesson {cs.idx + 1}/{lessons.length}</span>
        <span class="title">{lesson.title}</span>
        <button class="close-x" on:click={closeCourse} aria-label="Close course"><X size={15} strokeWidth={2.4} /></button>
      </div>

      <!-- The four steps, always visible: you can see where you are -->
      <div class="steps" aria-hidden="true">
        {#each PHASE_STEPS as step, i (step)}
          <span class="step" class:current={i === phaseIndex} class:past={i < phaseIndex}>
            <span class="step-n">{i + 1}</span>
            <span>{step}</span>
          </span>
          {#if i < PHASE_STEPS.length - 1}<span class="step-sep"></span>{/if}
        {/each}
      </div>

      {#if cs.phase === 'setup'}
        <p class="body-text">{lesson.intro}</p>
        <div class="cta-row">
          <button class="next-btn" on:click={beginPredict}>
            <Eye size={13} strokeWidth={2.4} />
            <span>Make a prediction</span>
          </button>
        </div>
      {:else}
        <p class="body-text question">{lesson.question}</p>

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

        {#if cs.phase === 'predict'}
          <div class="cta-row">
            <button class="next-btn" disabled={cs.answer === null} on:click={launchLesson}>
              <Play size={13} strokeWidth={2.6} />
              <span>{cs.answer === null ? 'Pick an answer first' : lesson.kind === 'race' ? 'Start the race' : 'Run it'}</span>
            </button>
          </div>
        {/if}

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
      {/if}

      <div class="card-footer">
        <button
          class="nav-btn"
          disabled={cs.idx === 0}
          on:click={prevLesson}
          title="Previous lesson"
          aria-label="Previous lesson"
        >
          <ChevronLeft size={15} strokeWidth={2.4} />
        </button>
        <div class="dots">
          {#each lessons as l, i (i)}
            <button
              class="dot"
              class:done={i < cs.idx}
              class:current={i === cs.idx}
              on:click={() => enterLesson(i)}
              title="Lesson {i + 1}: {l.title}"
              aria-label="Jump to lesson {i + 1}: {l.title}"
            ></button>
          {/each}
        </div>
        {#if cs.phase === 'reveal'}
          <button class="next-btn" on:click={nextLesson}>
            <span>{cs.idx === lessons.length - 1 ? 'Finish' : 'Next'}</span>
            <ArrowRight size={13} strokeWidth={2.6} />
          </button>
        {:else}
          <button
            class="nav-btn"
            disabled={cs.idx === lessons.length - 1}
            on:click={nextLesson}
            title="Skip to next lesson"
            aria-label="Next lesson"
          >
            <ChevronRight size={15} strokeWidth={2.4} />
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* App-level overlay: centered, above everything, never clipped */
  .course-card {
    position: fixed;
    top: 50%;
    left: 50%;
    width: min(94vw, 480px);
    border-radius: 12px;
    border: 1px solid var(--color-border);
    padding: 0.7rem 0.85rem 0.6rem;
    z-index: 500;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(10px);
    animation: cardIn 0.25s ease;
  }

  .course-card.dragging {
    user-select: none;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
  }

  @keyframes cardIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  :global([data-theme='light']) .course-card {
    background: rgba(255, 255, 255, 0.94);
    color: #1e293b;
  }

  :global([data-theme='dark']) .course-card {
    background: rgba(10, 16, 28, 0.93);
    color: #e2e8f0;
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.45rem;
    touch-action: none;
  }

  .card-head.grab {
    cursor: grab;
  }

  .course-card.dragging .card-head {
    cursor: grabbing;
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

  /* ---------- The four-step breadcrumb ---------- */
  .steps {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.55rem;
  }

  .step {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.42;
    white-space: nowrap;
  }

  .step.past {
    opacity: 0.6;
    color: #10b981;
  }

  .step.current {
    opacity: 1;
    color: #10b981;
  }

  .step-n {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.4px solid currentColor;
    font-size: 0.5625rem;
    font-family: 'SF Mono', Monaco, monospace;
  }

  .step.current .step-n {
    background: #10b981;
    border-color: #10b981;
    color: #fff;
  }

  .step-sep {
    flex: 1;
    height: 1px;
    background: var(--color-border);
    min-width: 6px;
  }

  .body-text {
    margin: 0 0 0.55rem;
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .question {
    font-weight: 500;
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
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.1);
    opacity: 1;
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

  .option.selected .opt-mark {
    background: #10b981;
    color: #fff;
  }

  .option.correct .opt-mark {
    background: #10b981;
    color: #fff;
  }

  .cta-row {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.55rem;
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
    gap: 0.6rem;
    margin-top: 0.55rem;
    min-height: 24px;
  }

  .nav-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    opacity: 0.7;
    cursor: pointer;
    padding: 0;
    transition: all 0.15s ease;
  }

  .nav-btn:hover:not(:disabled) {
    opacity: 1;
    border-color: #10b981;
    color: #10b981;
  }

  .nav-btn:disabled {
    opacity: 0.25;
    cursor: default;
  }

  .dots {
    display: flex;
    gap: 5px;
    align-items: center;
    flex: 1;
    justify-content: center;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: transparent;
    border: 1px solid var(--color-border);
    padding: 0;
    cursor: pointer;
    transition: transform 0.12s ease, background 0.12s ease;
  }

  .dot:hover {
    transform: scale(1.45);
    border-color: #10b981;
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

  .next-btn:hover:not(:disabled) {
    background: #059669;
  }

  .next-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .next-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  @media (max-width: 768px) {
    .course-card { width: 96%; padding: 0.55rem 0.65rem 0.5rem; }
    .body-text { font-size: 0.75rem; }
    .option { font-size: 0.7188rem; }
    .steps { gap: 0.25rem; }
    .step span:not(.step-n) { display: none; }
  }
</style>
