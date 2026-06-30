<script lang="ts">
  /**
   * The guided-course player: a floating, draggable panel launched from the
   * guide. It opens on a welcome screen explaining the predict → run → learn
   * loop, then walks one lesson at a time through four explicit steps —
   * 1 Setup (what's staged, where to look) → 2 Predict (commit to an answer)
   * → 3 Run (you launch it) → 4 Learn (the explanation). The teaching happens
   * on the live landscape behind the card — the panel drags by its header so
   * you can watch it.
   */

  import { courseStore, raceStore, divergenceStore } from '../stores/stores';
  import { runEndStore } from '../utils/trainer';
  import {
    lessons,
    enterLesson,
    beginCourse,
    beginPredict,
    answerLesson,
    launchLesson,
    nextLesson,
    prevLesson,
    closeCourse,
    restartCourse
  } from '../utils/lessons';
  import { GraduationCap, X, ArrowRight, RotateCcw, ChevronLeft, ChevronRight, Play, Eye } from 'lucide-svelte';
  import { fly } from 'svelte/transition';

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
  // of view must never be lost for good.
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
    // Clamped so a good chunk of the card — and its header — always stays
    // on screen (the panel is wide, so leave generous margins).
    const mx = Math.max(100, window.innerWidth / 2 - 180);
    const my = Math.max(70, window.innerHeight / 2 - 140);
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
    aria-label="Guided course"
  >
    {#if cs.phase === 'welcome'}
      <!-- ─────────────── Welcome / front door ─────────────── -->
      <div class="card-head" class:grab={!dragging} role="group" on:pointerdown={onHeaderDown} title="Drag to move">
        <span class="badge"><GraduationCap size={13} strokeWidth={2.4} /> Guided course</span>
        <span class="title">Welcome</span>
        <button class="close-x" on:click={closeCourse} aria-label="Close course"><X size={16} strokeWidth={2.4} /></button>
      </div>

      <div class="welcome">
        <p class="welcome-lead">
          Ten short lessons on how optimizers actually move across a loss
          landscape — slopes, traps, plateaus, momentum, noise, saddles, and a
          real (tiny) neural network at the end.
        </p>

        <div class="loop" aria-hidden="true">
          <span class="loop-step">
            <span class="loop-ic"><Eye size={16} strokeWidth={2.2} /></span>
            <b>Predict</b><small>guess what happens</small>
          </span>
          <ArrowRight size={15} class="loop-arrow" />
          <span class="loop-step">
            <span class="loop-ic"><Play size={16} strokeWidth={2.4} /></span>
            <b>Run</b><small>watch the real landscape</small>
          </span>
          <ArrowRight size={15} class="loop-arrow" />
          <span class="loop-step">
            <span class="loop-ic"><GraduationCap size={16} strokeWidth={2.2} /></span>
            <b>Learn</b><small>see why</small>
          </span>
        </div>

        <p class="welcome-note">
          Each lesson stages a scenario on the live app, so keep an eye on the
          plots behind this panel — you can drag it aside any time.
        </p>

        <div class="welcome-cta">
          {#if cs.idx > 0}
            <button class="next-btn big" on:click={beginCourse}>
              <Play size={14} strokeWidth={2.6} />
              <span>Resume — Lesson {cs.idx + 1}</span>
            </button>
            <button class="text-link" on:click={() => enterLesson(0)}>Start over</button>
          {:else}
            <button class="next-btn big" on:click={beginCourse}>
              <Play size={14} strokeWidth={2.6} />
              <span>Start the course</span>
            </button>
          {/if}
        </div>
      </div>
    {:else if cs.phase === 'done'}
      <!-- ─────────────── Completion ─────────────── -->
      <div class="card-head" role="group" on:pointerdown={onHeaderDown}>
        <span class="badge"><GraduationCap size={13} strokeWidth={2.4} /> Course</span>
        <span class="title">That's the whole story</span>
        <button class="close-x" on:click={closeCourse} aria-label="Close course"><X size={16} strokeWidth={2.4} /></button>
      </div>
      <p class="body-text done-text">
        Slope → step size → traps → plateaus → momentum → SGD → conditioning →
        adaptivity → saddles — and it all ran on a real (tiny) neural network at
        the end. Everything bigger is these same ideas, repeated billions of times.
      </p>
      <div class="card-footer">
        <div class="dots" aria-hidden="true">
          {#each lessons as _l, i (i)}
            <button class="dot done" on:click={() => enterLesson(i)} title={lessons[i].title} aria-label="Lesson {i + 1}"></button>
          {/each}
        </div>
        <button class="next-btn" on:click={restartCourse}>
          <RotateCcw size={13} strokeWidth={2.4} />
          <span>Start over</span>
        </button>
      </div>
    {:else}
      <!-- ─────────────── A lesson ─────────────── -->
      <div class="card-head" class:grab={!dragging} role="group" on:pointerdown={onHeaderDown} title="Drag to move">
        <span class="badge">Lesson {cs.idx + 1}/{lessons.length}</span>
        <span class="title">{lesson.title}</span>
        <button class="close-x" on:click={closeCourse} aria-label="Close course"><X size={16} strokeWidth={2.4} /></button>
      </div>

      <!-- The four steps, always visible: you can see where you are -->
      <div class="steps" aria-hidden="true">
        {#each PHASE_STEPS as step, i (step)}
          <span class="step" class:current={i === phaseIndex} class:past={i < phaseIndex}>
            <span class="step-n">{i + 1}</span>
            <span class="step-lbl">{step}</span>
          </span>
          {#if i < PHASE_STEPS.length - 1}<span class="step-sep"></span>{/if}
        {/each}
      </div>

      {#key cs.idx}
        <div class="lesson-body" in:fly={{ y: 10, duration: 260 }}>
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
        </div>
      {/key}

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
    width: min(94vw, 460px);
    max-height: min(90vh, 600px);
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    border: 1px solid var(--color-border);
    padding: 0.95rem 1.1rem 0.85rem;
    z-index: 500;
    box-shadow: 0 22px 60px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(12px);
    animation: cardIn 0.25s ease;
  }

  .course-card.dragging {
    user-select: none;
    box-shadow: 0 16px 44px rgba(0, 0, 0, 0.45);
  }

  @keyframes cardIn {
    from { opacity: 0; transform: translate(-50%, -50%) scale(0.98); }
    to   { opacity: 1; }
  }

  :global([data-theme='light']) .course-card {
    background: rgba(255, 255, 255, 0.95);
    color: #1e293b;
  }

  :global([data-theme='dark']) .course-card {
    background: rgba(10, 16, 28, 0.94);
    color: #e2e8f0;
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    margin-bottom: 0.6rem;
    flex-shrink: 0;
    touch-action: none;
  }

  .card-head.grab { cursor: grab; }
  .course-card.dragging .card-head { cursor: grabbing; }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
    flex-shrink: 0;
    font-size: 0.625rem;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #10b981;
    background: rgba(16, 185, 129, 0.14);
    border-radius: 6px;
    padding: 0.2rem 0.5rem;
    font-family: 'SF Mono', Monaco, monospace;
  }

  .title {
    font-size: 1rem;
    font-weight: 700;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .close-x {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
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
    gap: 0.5rem;
    margin-bottom: 0.85rem;
    flex-shrink: 0;
  }

  .step {
    display: inline-flex;
    align-items: center;
    gap: 0.34rem;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.42;
    white-space: nowrap;
  }

  .step.past { opacity: 0.6; color: #10b981; }
  .step.current { opacity: 1; color: #10b981; }

  .step-n {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
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
    min-width: 8px;
  }

  /* ---------- Lesson body (single column; the live landscape is the plot) ---------- */
  .lesson-body {
    overflow: auto;
    min-height: 0;
    flex: 1;
  }

  .body-text {
    margin: 0 0 0.7rem;
    font-size: 0.9375rem;
    line-height: 1.6;
  }

  .question { font-weight: 500; }
  .done-text { font-size: 0.9375rem; }

  .options {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    text-align: left;
    border: 1px solid var(--color-border);
    border-radius: 9px;
    background: transparent;
    color: inherit;
    font-size: 0.875rem;
    line-height: 1.4;
    padding: 0.55rem 0.7rem;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease, opacity 0.15s ease;
  }

  .option:not(:disabled):hover {
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.07);
  }

  .option:disabled { cursor: default; opacity: 0.55; }
  .option.selected { border-color: #10b981; background: rgba(16, 185, 129, 0.1); opacity: 1; }
  .option.correct { border-color: #10b981; background: rgba(16, 185, 129, 0.13); opacity: 1; }
  .option.wrong { border-color: rgba(239, 68, 68, 0.65); background: rgba(239, 68, 68, 0.08); opacity: 0.95; }

  .opt-mark {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    font-size: 0.6875rem;
    font-weight: 800;
    font-family: 'SF Mono', Monaco, monospace;
    background: rgba(148, 163, 184, 0.18);
  }

  .option.selected .opt-mark,
  .option.correct .opt-mark { background: #10b981; color: #fff; }

  .cta-row {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.7rem;
  }

  .running-note {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.7rem;
    font-size: 0.8125rem;
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
    margin: 0.7rem 0 0;
    padding: 0.55rem 0.7rem;
    font-size: 0.8125rem;
    line-height: 1.55;
    border-left: 3px solid rgba(239, 68, 68, 0.7);
    border-radius: 5px;
    background: rgba(148, 163, 184, 0.08);
  }

  .explain.explain-correct { border-left-color: #10b981; }
  .explain strong { font-weight: 700; }

  /* ---------- Welcome ---------- */
  .welcome {
    overflow: auto;
    min-height: 0;
  }

  .welcome-lead {
    margin: 0 0 1rem;
    font-size: 0.9375rem;
    line-height: 1.6;
  }

  .loop {
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: 0.5rem;
    margin: 0.2rem 0 1rem;
  }

  .loop-step {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.18rem;
    text-align: center;
    padding: 0.6rem 0.4rem;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: rgba(16, 185, 129, 0.05);
  }

  .loop-ic {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: rgba(16, 185, 129, 0.16);
    color: #10b981;
    margin-bottom: 0.15rem;
  }

  .loop-step b { font-size: 0.8125rem; font-weight: 700; }
  .loop-step small { font-size: 0.6875rem; opacity: 0.6; line-height: 1.3; }
  :global(.loop-arrow) { align-self: center; opacity: 0.4; flex-shrink: 0; }

  .welcome-note {
    margin: 0 0 1.1rem;
    font-size: 0.8125rem;
    line-height: 1.55;
    opacity: 0.72;
  }

  .welcome-cta {
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }

  .text-link {
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.6;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .text-link:hover { opacity: 1; color: #10b981; }

  /* ---------- Footer ---------- */
  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    margin-top: 0.75rem;
    min-height: 26px;
    flex-shrink: 0;
  }

  .nav-btn {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
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

  .nav-btn:hover:not(:disabled) { opacity: 1; border-color: #10b981; color: #10b981; }
  .nav-btn:disabled { opacity: 0.25; cursor: default; }

  .dots {
    display: flex;
    gap: 5px;
    align-items: center;
    flex: 1;
    justify-content: center;
    flex-wrap: wrap;
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

  .dot:hover { transform: scale(1.45); border-color: #10b981; }
  .dot.done { background: #10b981; border-color: #10b981; }
  .dot.current { border-color: #10b981; box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.25); }

  .next-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border: none;
    border-radius: 8px;
    background: #10b981;
    color: #fff;
    font-size: 0.8125rem;
    font-weight: 700;
    padding: 0.42rem 0.8rem;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.1s ease;
  }

  .next-btn.big { padding: 0.55rem 1.1rem; font-size: 0.875rem; }
  .next-btn:hover:not(:disabled) { background: #059669; }
  .next-btn:active:not(:disabled) { transform: scale(0.97); }
  .next-btn:disabled { opacity: 0.45; cursor: default; }

  @media (max-width: 768px) {
    .course-card { width: 94vw; padding: 0.75rem 0.85rem 0.7rem; }
    .loop-step small { display: none; }
    .step-lbl { display: none; }
  }
</style>
