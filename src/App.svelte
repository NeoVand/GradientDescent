<script lang="ts">
  // Welcome to Gradient Lab!
  // This is an interactive educational tool to understand how gradient descent works
  // through visual experiments with machine learning algorithms.
  
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import Sidebar from './components/Sidebar.svelte';
  import DataVisualization from './components/DataVisualization.svelte';
  import LossLandscape from './components/LossLandscape.svelte';
  import LossHistory from './components/LossHistory.svelte';
  import GuidePanel from './components/GuidePanel.svelte';
  import HelpModal from './components/HelpModal.svelte';
import CoursePanel from './components/CoursePanel.svelte';
  import {
    datasetStore,
    parametersStore,
    recordInitialHistory,
    currentProblemConfig,
    themeStore,
    showCoach,
    trainingStore,
    landscapeViewStore,
    historyStore,
    resetOptimizerState,
    tourActiveStore,
    challengeStore,
    selectedProblem,
    vizLayersStore
  } from './stores/stores';
  import { startTraining, stopTraining, stepOnce, resetRun, runEndStore, applyProblem } from './utils/trainer';
  import { applyUrlState, encodeStateUrl } from './utils/urlState';
  import { enterCourseFromChapter, lessons } from './utils/lessons';
  import { Sun, Moon, Compass, Menu, X, Share2, GraduationCap, Maximize, Minimize, Play, Pause } from 'lucide-svelte';

  // The main app orchestrates all our components and manages the overall layout.
  // We use CSS Grid for a responsive, flexible layout that adapts to different screen sizes.

  $: theme = $themeStore;
  $: isTraining = $trainingStore.isTraining;

  let showHelpModal = false;
  // A ch=<slug> deep link opens the guide scrolled to that chapter.
  let helpInitialChapter: string | null = null;
  let drawerOpen = false;

  function closeDrawer() { drawerOpen = false; }
  function toggleDrawer() { drawerOpen = !drawerOpen; }

  // ---------- Full screen (browser Fullscreen API) ----------
  let isFullscreen = false;

  function toggleFullscreen() {
    const d = document as any;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen)?.call(document);
    } else {
      const el = document.documentElement as any;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      // Called from a click (user gesture), so this is allowed; swallow the
      // rejection some browsers throw if it's somehow blocked.
      Promise.resolve(req?.call(el)).catch(() => {});
    }
  }

  // ---------- Product tour (driver.js, lazy-loaded) ----------
  const isMobile = () =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;

  async function startTour() {
    // Pull driver.js + its CSS in only when the tour actually runs, so they
    // never touch first paint. The tour filters itself to on-screen anchors,
    // so on mobile it reduces to the always-visible plots.
    const { runTour } = await import('./utils/tour');
    if (drawerOpen) {
      // The tour snapshots anchor positions when it builds its steps — let
      // the drawer finish sliding away or its anchors still read as visible.
      closeDrawer();
      await new Promise((r) => setTimeout(r, 300));
    }
    runTour();
  }

  // Lock body scroll while the drawer is open on mobile
  $: if (typeof document !== 'undefined') {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
  }
  
  // Pure analytic surfaces have no dataset: the Data panel hides and the
  // landscape takes the full row.
  $: isAnalytic = $currentProblemConfig?.noData ?? false;

  // Initialize data when app starts
  onMount(() => {
    // Set initial theme on mount
    document.documentElement.setAttribute('data-theme', theme);

    // Keep the full-screen button's icon in sync, incl. exiting via Esc.
    const syncFs = () => {
      isFullscreen = !!((document as any).fullscreenElement || (document as any).webkitFullscreenElement);
    };
    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);

    // A shared link restores the full scenario (settings + seed + marker),
    // and may carry navigation intents (guide chapter, course lesson, autorun).
    const shared = applyUrlState();
    if (shared?.lesson && lessons.some(l => l.id === shared.lesson)) {
      // A lesson link: the lesson stages its own scenario; nothing to restore.
      enterCourseFromChapter(shared.lesson);
    } else if (shared?.scenario) {
      const sc = shared.scenario;
      datasetStore.regenerateData();
      parametersStore.set(sc.params);
      recordInitialHistory();
      if (sc.goal) {
        challengeStore.set({ target: sc.goal, status: 'open' });
        showCoach('info', `🎯 Challenge loaded — reach the basin in ≤ ${sc.goal} steps. Tune anything you like, then Train.`, 0);
      } else if (shared.run) {
        // A living-figure link: run the staged scenario immediately. Defer a
        // frame so every plot has mounted before the first step lands.
        requestAnimationFrame(() => startTraining());
      } else {
        // Sticky: someone opening a shared link looks around before acting;
        // any training action clears it.
        showCoach('info', 'Loaded a shared scenario — same data, same start. Hit Train to run it.', 0);
      }
    } else {
      // Fresh load: set up the default problem with its curated optimizer
      // (Momentum), learning rate, fresh data and starting marker. The app
      // opens straight into the playground — no guide modal; the Help
      // button is one click away whenever it's wanted.
      applyProblem(get(selectedProblem));

      // First-time visitors get the product tour once, on desktop. The "seen"
      // flag is set when the tour starts (not when it finishes), so closing it
      // early never re-nags. Defer two frames so every plot anchor has mounted.
      // Skipped when the link is about to open the guide on top of the app.
      let seenTour = true;
      try { seenTour = !!localStorage.getItem('gl-tour-seen'); } catch { /* private mode */ }
      if (!seenTour && !isMobile() && !shared?.chapter) {
        requestAnimationFrame(() => requestAnimationFrame(() => startTour()));
      }
    }

    // A chapter link opens the book right where the sender was reading —
    // on top of whatever scenario (or fresh default) was just staged.
    if (shared?.chapter) {
      helpInitialChapter = shared.chapter;
      showHelpModal = true;
    }

    return () => {
      document.removeEventListener('fullscreenchange', syncFs);
      document.removeEventListener('webkitfullscreenchange', syncFs);
    };
  });

  // Problem switches redraw every panel at once — a brief veil washing
  // out over the new scene turns the hard cut into a gentle transition.
  let problemVeil = false;
  let lastProblemSeen = '';
  $: {
    const t = $currentProblemConfig?.type ?? '';
    if (t !== lastProblemSeen) {
      if (lastProblemSeen) problemVeil = true;
      lastProblemSeen = t;
    }
  }

  // ---------- Share popover ----------
  let showSharePopover = false;
  let challengeTarget = 100;

  function toggleSharePopover() {
    if (!showSharePopover) {
      // Prefill the target from the last converged run — "beat my score"
      const lastRun = $runEndStore;
      challengeTarget = lastRun?.verdict === 'converged' ? lastRun.steps : 100;
    }
    showSharePopover = !showSharePopover;
  }

  async function copyUrl(url: string, successNote: string) {
    showSharePopover = false;
    try {
      await navigator.clipboard.writeText(url);
      showCoach('success', successNote);
    } catch {
      // Clipboard can be unavailable (permissions); fall back to the URL bar
      location.hash = url.split('#')[1] ?? '';
      showCoach('info', 'Link is in the address bar — copy it from there.');
    }
  }

  function sharePlain() {
    copyUrl(encodeStateUrl(), 'Link copied — it reproduces this exact data, settings, and marker position.');
  }

  function shareChallenge() {
    const target = Math.max(1, Math.min(10000, Math.round(challengeTarget) || 100));
    copyUrl(
      encodeStateUrl(target),
      `Challenge link copied — "reach the basin in ≤ ${target} steps." Send it to your students.`
    );
  }
  
  function toggleTheme() {
    themeStore.toggle();
  }

  // ---------- Keyboard shortcuts ----------
  // Space train/pause · S step · R reset · arrows nudge the marker
  // (Shift = bigger nudge) · D 2D/3D.
  function nudgeMarker(da: number, db: number, fine: boolean) {
    const cfg = $currentProblemConfig;
    if (!cfg) return;
    const range = cfg.parameterRange ?? { min: -7, max: 7 };
    const step = (range.max - range.min) * (fine ? 0.05 : 0.01);
    if (cfg.oneParam) db = 0;
    const p = $parametersStore;
    const next = {
      a: Math.max(range.min, Math.min(range.max, p.a + da * step)),
      b: Math.max(range.min, Math.min(range.max, p.b + db * step))
    };
    if (next.a === p.a && next.b === p.b) return;
    resetOptimizerState();
    parametersStore.set(next);
    // Keep the trail and loss chart honest, like a marker drag does
    const data = $datasetStore.data;
    const train = data.filter(d => d.isTraining);
    const test = data.filter(d => !d.isTraining);
    const h = $historyStore;
    historyStore.addPoint({
      step: h.length > 0 ? h[h.length - 1].step + 1 : 0,
      trainLoss: cfg.computeLoss(train, next),
      testLoss: cfg.computeLoss(test, next),
      parameters: next
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (showHelpModal || drawerOpen || get(tourActiveStore)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    // A focused button already handles Space natively — don't double-fire.
    if (e.key === ' ' && t && t.tagName === 'BUTTON') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        if ($trainingStore.isTraining) stopTraining();
        else startTraining();
        break;
      case 's':
      case 'S':
        stepOnce();
        break;
      case 'r':
      case 'R':
        resetRun();
        break;
      case 'd':
      case 'D':
        if (!$currentProblemConfig?.oneParam) {
          landscapeViewStore.set($landscapeViewStore === '2d' ? '3d' : '2d');
        }
        break;
      case 'a':
      case 'A': {
        // Toggle the −∇ℒ arrow field on the Loss & Gradient panel.
        const f = get(vizLayersStore).field;
        vizLayersStore.patch({ field: f === 'arrows' ? 'off' : 'arrows' });
        break;
      }
      case 'f':
      case 'F': {
        // Toggle the streamline (flow) field.
        const f = get(vizLayersStore).field;
        vizLayersStore.patch({ field: f === 'streamlines' ? 'off' : 'streamlines' });
        break;
      }
      case 'c':
      case 'C':
        vizLayersStore.patch({ contours: !get(vizLayersStore).contours });
        break;
      case 'ArrowLeft':
        e.preventDefault();
        nudgeMarker(-1, 0, e.shiftKey);
        break;
      case 'ArrowRight':
        e.preventDefault();
        nudgeMarker(1, 0, e.shiftKey);
        break;
      case 'ArrowUp':
        e.preventDefault();
        nudgeMarker(0, 1, e.shiftKey);
        break;
      case 'ArrowDown':
        e.preventDefault();
        nudgeMarker(0, -1, e.shiftKey);
        break;
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Mobile top bar: only visible on small screens -->
<header class="mobile-topbar">
  <button class="topbar-btn menu-btn" on:click={toggleDrawer} aria-label={drawerOpen ? 'Close controls' : 'Open controls'}>
    {#if drawerOpen}
      <X size={22} strokeWidth={2.5} />
    {:else}
      <Menu size={22} strokeWidth={2.5} />
    {/if}
  </button>
  <h1 class="topbar-title"><span class="topbar-mark">∂</span> <span class="topbar-name">Gradient Lab</span></h1>
  <!-- Train straight from the main view: no need to open the controls drawer
       (and miss the action happening behind it). Toggles start/pause. -->
  <button
    class="topbar-train"
    class:training={isTraining}
    on:click={() => (isTraining ? stopTraining() : startTraining())}
    aria-label={isTraining ? 'Pause training' : 'Start training'}
  >
    {#if isTraining}
      <Pause size={16} strokeWidth={2.5} />
    {:else}
      <Play size={16} strokeWidth={2.5} />
    {/if}
    <span>{isTraining ? 'Pause' : 'Train'}</span>
  </button>
  <button class="topbar-btn" on:click={startTour} aria-label="Take a tour">
    <Compass size={20} strokeWidth={2.5} />
  </button>
  <button class="topbar-btn" class:active={showSharePopover} on:click={toggleSharePopover} aria-label="Share">
    <Share2 size={19} strokeWidth={2.5} />
  </button>
  <button class="topbar-btn" on:click={() => showHelpModal = true} aria-label="Help">
    <GraduationCap size={20} strokeWidth={2.5} />
  </button>
  <button class="topbar-btn" on:click={() => themeStore.toggle()} aria-label="Toggle theme">
    {#if theme === 'light'}
      <Moon size={20} strokeWidth={2.5} />
    {:else}
      <Sun size={20} strokeWidth={2.5} />
    {/if}
  </button>
</header>

<main>
  <div class="app-container">
    <!-- Sidebar: in-grid on desktop, slide-in drawer on mobile -->
    <aside class="sidebar" class:drawer-open={drawerOpen}>
      <Sidebar onClose={closeDrawer} />
    </aside>

    {#if drawerOpen}
      <div class="drawer-backdrop" on:click={closeDrawer} on:keydown={(e) => e.key === 'Escape' && closeDrawer()} role="button" tabindex="-1" aria-label="Close controls"></div>
    {/if}

    <!-- Main content area with our visualizations -->
    <div class="main-content">
      {#if problemVeil}
        <div class="problem-veil" aria-hidden="true" on:animationend={() => (problemVeil = false)}></div>
      {/if}
      <!-- Top row: Data visualization and Loss landscape; analytic surfaces
           have no data, so the landscape takes the whole row -->
      <div class="top-row" class:single={isAnalytic}>
        {#if !isAnalytic}
          <div class="data-viz-container" data-tour="plot-data">
            <DataVisualization />
          </div>
        {/if}
        <div class="loss-landscape-container" data-tour="plot-landscape">
          <LossLandscape />
        </div>
      </div>

      <!-- Bottom row: Loss history chart and parameter values -->
      <div class="bottom-row">
        <div class="loss-history-container" data-tour="plot-history">
          <LossHistory />
        </div>
        <div class="guide-panel-container" data-tour="plot-guide">
          <GuidePanel />
        </div>
      </div>
    </div>
  </div>
</main>

<!-- Desktop tool corner (hidden on mobile, replaced by topbar): course,
     share, help and theme, always available. The Formulas panel keeps
     clear of this corner, so the buttons can live here permanently. -->
<div class="floating-buttons">
  <button
    class="help-btn"
    on:click={startTour}
    aria-label="Take a tour"
  >
    <Compass size={19} strokeWidth={2.5} />
  </button>
  <button class="help-btn" class:tool-on={showSharePopover} on:click={toggleSharePopover} aria-label="Share scenario">
    <Share2 size={18} strokeWidth={2.5} />
  </button>
  <button class="help-btn" on:click={() => showHelpModal = true} aria-label="Help & guide" data-tour="help-button">
    <GraduationCap size={20} strokeWidth={2.5} />
  </button>
  <button
    class="help-btn"
    class:tool-on={isFullscreen}
    on:click={toggleFullscreen}
    aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
  >
    {#if isFullscreen}
      <Minimize size={18} strokeWidth={2.5} />
    {:else}
      <Maximize size={18} strokeWidth={2.5} />
    {/if}
  </button>
  <button class="help-btn" on:click={() => themeStore.toggle()} aria-label={theme === 'light' ? 'Dark mode' : 'Light mode'}>
    {#if theme === 'light'}
      <Moon size={20} strokeWidth={2.5} />
    {:else}
      <Sun size={20} strokeWidth={2.5} />
    {/if}
  </button>
</div>

{#if showSharePopover}
  <div class="popover-backdrop" on:click={() => (showSharePopover = false)} on:keydown={(e) => e.key === 'Escape' && (showSharePopover = false)} role="button" tabindex="-1" aria-label="Close share menu"></div>
  <div class="share-popover" role="menu" aria-label="Share options">
    <button class="share-row" on:click={sharePlain}>
      <Share2 size={14} strokeWidth={2.4} />
      <span>Copy link to this scenario</span>
    </button>
    <div class="share-divider"></div>
    <div class="share-challenge">
      <button class="share-row" on:click={shareChallenge}>
        <span class="target-emoji">🎯</span>
        <span>Copy as challenge</span>
      </button>
      <label class="target-label">
        basin in ≤
        <input type="number" min="1" max="10000" bind:value={challengeTarget} />
        steps
      </label>
    </div>
  </div>
{/if}

<!-- Course card: app-level overlay, always on top -->
<CoursePanel />

<!-- Help Modal (outside main) -->
<HelpModal
  isOpen={showHelpModal}
  initialChapter={helpInitialChapter}
  onClose={() => { showHelpModal = false; helpInitialChapter = null; }}
/>

<style>
  /* Reset and base styles */
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  
  /* Vertical breathing room: 0px on short screens (≤800px viewport),
     growing linearly to 10px on tall ones (≥1080px). Every sidebar
     spacing interpolates off this one knob, so the layout is airy when
     there's room and only compresses when there isn't. */
  :global(:root) {
    --air: clamp(0px, calc((100vh - 800px) / 30), 14px);
    /* THE spacing token: every frame, gutter, and card padding uses this
       one thin value, so the whole chrome shares a single rhythm. */
    --gap: calc(10px + 0.25 * var(--air));
    /* Horizontal gutter BETWEEN the three columns (sidebar | plots | landscape).
       A single flat constant so the gap never grows relative to the plots as the
       window narrows — the plots and formulas take all the slack instead. (The
       old layout stacked --gap ON TOP of a 0.75rem container pad, doubling it.) */
    --col-gap: 16px;
    /* One height for the whole bottom line of the app: the run deck on
       the left and the loss-chart/formulas row share it, so they align. */
    --bottom-h: clamp(200px, 25vh, 300px);
  }

  /* CSS Variables for Theming */
  :global(:root) {
    /* Light theme colors with subtle emerald tint */
    --color-bg-primary: #f0f4f3;
    --color-bg-secondary: #ffffff;
    --color-bg-tertiary: #fafafa;
    --color-text-primary: #1a1a1a;
    --color-text-secondary: #4a4a4a;
    --color-text-tertiary: #666666;
    --color-border: #e0e0e0;
    --color-border-hover: #3b82f6;
    --color-shadow: rgba(0, 0, 0, 0.1);
    
    /* Brand colors */
    --color-primary: #3b82f6;
    --color-primary-hover: #2563eb;
    --color-success: #10b981;
    --color-danger: #ef4444;
    --color-warning: #f59e0b;
    --color-accent: #e11d48;
  }
  
  :global([data-theme='dark']) {
    /* Dark theme colors with blue-green balance */
    --color-bg-primary: #0a1218;
    --color-bg-secondary: #141f2e;
    --color-bg-tertiary: #0a1218;  /* Darker for better diagram contrast */
    --color-text-primary: #f1f5f9;
    --color-text-secondary: #cbd5e1;
    --color-text-tertiary: #94a3b8;
    --color-border: #475569;  /* Lighter for better grid visibility */
    --color-border-hover: #60a5fa;
    --color-shadow: rgba(0, 0, 0, 0.5);
    
    /* Brand colors (adjusted for dark theme - more saturated) */
    --color-primary: #3b82f6;
    --color-primary-hover: #2563eb;
    --color-success: #34d399;
    --color-danger: #f87171;
    --color-warning: #fbbf24;
    --color-accent: #fb7185;
  }
  
  :global(html), :global(body) {
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: var(--color-bg-primary);
    color: var(--color-text-primary);
    transition: background-color 0.3s ease, color 0.3s ease;
  }
  
  main {
    height: 100vh;
    overflow: hidden;
    position: relative;
  }
  
  /* Floating buttons - bottom right */
  .floating-buttons {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    display: flex;
    flex-direction: row;
    gap: 0.5rem;
    z-index: 99;
  }
  
  .help-btn {
    position: relative;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid var(--color-border);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    padding: 0;
    box-shadow: none;
  }

  /* Match the plot toolbar's icon weight (its buttons carry a 15px glyph) so
     the floating deck reads as the same class of control and lets the formulas
     breathe, instead of five big 36px discs. */
  .help-btn :global(svg) {
    width: 15px;
    height: 15px;
  }

  /* Styled tooltip above each tool button (the text is the button's aria-label).
     Right-anchored so the rightmost button never spills past the screen edge. */
  .help-btn::after {
    content: attr(aria-label);
    position: absolute;
    bottom: calc(100% + 9px);
    right: 0;
    padding: 0.3rem 0.55rem;
    border-radius: 7px;
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
    font-size: 0.72rem;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
    opacity: 0;
    transform: translateY(4px);
    pointer-events: none;
    transition: opacity 0.14s ease, transform 0.14s ease;
    z-index: 100;
  }
  .help-btn:hover::after,
  .help-btn:focus-visible::after {
    opacity: 1;
    transform: translateY(0);
  }

  /* Light mode buttons */
  :global([data-theme='light']) .help-btn {
    background: rgba(255, 255, 255, 0.7);
    color: rgba(0, 0, 0, 0.5);
  }
  
  /* Dark mode buttons */
  :global([data-theme='dark']) .help-btn {
    background: rgba(30, 41, 59, 0.6);
    color: rgba(255, 255, 255, 0.5);
  }
  
  .help-btn:hover {
    border-color: #10b981;
    transform: scale(1.05);
    color: #10b981;
  }
  
  :global([data-theme='light']) .help-btn:hover {
    background: rgba(255, 255, 255, 0.9);
  }

  :global([data-theme='dark']) .help-btn:hover {
    background: rgba(30, 41, 59, 0.8);
  }

  .help-btn.tool-on {
    border-color: rgba(16, 185, 129, 0.6);
    color: #10b981 !important;
    background: rgba(16, 185, 129, 0.14) !important;
  }

  /* ---------- Share popover (anchored above the tool corner) ---------- */
  .popover-backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    border: none;
    z-index: 599;
  }
  .share-popover {
    position: fixed;
    bottom: 3.9rem;
    right: 1.5rem;
    width: 268px;
    max-width: calc(100vw - 2rem);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    box-shadow: 0 14px 36px var(--color-shadow);
    padding: 0.4rem;
    z-index: 600;
    animation: popIn 0.16s ease;
  }
  @keyframes popIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .share-row {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    padding: 0.5rem 0.6rem;
    border: none;
    background: transparent;
    border-radius: 8px;
    color: var(--color-text-secondary);
    font-size: 0.82rem;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .share-row:hover { background: var(--color-bg-tertiary); color: var(--color-text-primary); }
  .share-row :global(svg) { color: #10b981; flex-shrink: 0; }
  .share-divider { height: 1px; background: var(--color-border); margin: 0.3rem 0.45rem; }
  .target-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    padding: 0.1rem 0.6rem 0.5rem;
    font-size: 0.76rem;
    color: var(--color-text-tertiary);
  }
  .target-label input {
    width: 4.5rem;
    padding: 0.2rem 0.45rem;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.78rem;
  }
  .target-label input:focus { outline: none; border-color: #10b981; }
  .target-emoji { font-size: 0.95rem; line-height: 1; }

  /* Main app container using CSS Grid for layout */
  .app-container {
    display: grid;
    grid-template-columns: clamp(300px, 19vw, 360px) 1fr;
    height: 100vh;
    gap: var(--gap);
    column-gap: var(--col-gap);
    padding: var(--gap);
    background-color: var(--color-bg-primary);
    box-sizing: border-box;
  }
  
  /* Sidebar column: a transparent rail — the cards inside carry the
     surface styling. */
  .sidebar {
    background-color: transparent;
    border-radius: 0;
    box-shadow: none;
    padding: 0;
    /* Dropdowns must float past the card edge */
    overflow: visible;
    min-height: 0;
  }
  
  /* Main content area */
  .main-content {
    display: flex;
    flex-direction: column;
    gap: var(--gap);
    min-height: 0;
    position: relative;
  }

  /* Gentle wash over the plots while a new problem paints underneath */
  .problem-veil {
    position: absolute;
    inset: 0;
    background: var(--color-bg-primary);
    z-index: 40;
    pointer-events: none;
    border-radius: 8px;
    animation: veilFade 0.45s ease forwards;
  }

  @keyframes veilFade {
    from { opacity: 0.92; }
    to   { opacity: 0; }
  }
  
  /* Top row with data viz and loss landscape */
  .top-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--gap);
    column-gap: var(--col-gap);
    flex: 1;
    min-height: 0;
  }

  /* Analytic surfaces: the landscape is the whole story */
  .top-row.single {
    grid-template-columns: 1fr;
  }
  
  /* Bottom row with loss history and guide panel — same height as the
     run deck across the gutter. */
  .bottom-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--gap);
    column-gap: var(--col-gap);
    height: var(--bottom-h);
    flex-shrink: 0;
    position: relative;
  }
  
  /* Individual containers for components */
  .data-viz-container,
  .loss-landscape-container,
  .loss-history-container,
  .guide-panel-container {
    background-color: transparent;
    border-radius: 0;
    box-shadow: none;
    /* No inner pad — the single --col-gap gutter is the only spacing between
       columns, so it can't grow relative to the plots as the window narrows. */
    padding: 0;
    position: relative;
    overflow: hidden;
    min-height: 0;
  }
  
  /* Mobile top bar: hidden on desktop */
  .mobile-topbar { display: none; }
  .drawer-backdrop { display: none; }

  /* Responsive design for smaller screens */
  @media (max-width: 1200px) {
    .app-container {
      grid-template-columns: 250px 1fr;
    }
  }

  /* ---------- Mobile (≤768px) ---------- */
  @media (max-width: 768px) {
    /* Lock the page to the viewport and scroll INSIDE <main>, so the top bar
       (menu + tools) stays pinned above the scroll area and is always reachable
       — a sticky bar inside a body-scroll slid away on these layouts. */
    :global(html), :global(body) {
      overflow: hidden;
      height: 100dvh;
      overscroll-behavior-y: none;
    }
    :global(#app) {
      display: flex;
      flex-direction: column;
      height: 100dvh;
      min-height: 0;
      /* Shared by the top bar, the drawer, and its backdrop so the drawer can
         slide in UNDER the bar — keeping the burger visible as a close toggle. */
      --mobile-topbar-h: 54px;
    }

    main {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }

    /* Sticky top bar */
    .mobile-topbar {
      display: flex;
      align-items: center;
      gap: 0.15rem;
      position: sticky;
      top: 0;
      z-index: 50;
      height: var(--mobile-topbar-h);
      box-sizing: border-box;
      padding: 0.4rem 0.5rem;
      background-color: var(--color-bg-primary);
      border-bottom: 1px solid var(--color-border);
    }
    .topbar-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    /* Menu sits left; the four tools hug the right edge. */
    .topbar-title { margin-right: auto; }

    .topbar-title {
      flex: 1;
      margin: 0;
      font-size: 1.0625rem;
      font-weight: 700;
      color: var(--color-text-primary);
      display: flex;
      align-items: center;
      gap: 0.4rem;
      min-width: 0;
    }

    .topbar-mark {
      color: #10b981;
      font-family: 'Times New Roman', 'Georgia', serif;
      font-size: 1.5rem;
      font-style: italic;
      line-height: 1;
    }

    .topbar-btn {
      width: 38px;
      height: 40px;
      border: none;
      background: none;
      color: var(--color-text-tertiary);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      flex-shrink: 0;
      transition: color 0.15s ease;
    }
    .topbar-btn:active {
      transform: scale(0.92);
      color: #10b981;
    }
    .topbar-btn.active { color: #10b981; }

    /* Green Train pill: the one primary action promoted out of the drawer so a
       run can be started (and watched) from the main view. */
    .topbar-train {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      height: 34px;
      padding: 0 0.7rem;
      margin-right: 0.15rem;
      border: none;
      border-radius: 9px;
      background: #10b981;
      color: #04130d;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s ease, transform 0.1s ease;
    }
    .topbar-train:active { transform: scale(0.95); }
    .topbar-train.training {
      background: var(--color-bg-tertiary, #1e293b);
      color: #10b981;
      box-shadow: inset 0 0 0 1.5px #10b981;
    }

    /* The share popover drops from under the sticky bar on phones. */
    .share-popover {
      top: 3.1rem;
      bottom: auto;
      right: 0.5rem;
    }

    /* Mobile stacks the plots in a normally-scrolling column. Cramming all
       three into one viewport (the old flex-grow approach) squeezed the data
       plot until its axes clipped on shorter screens; instead each plot gets a
       comfortable height sized to the phone's WIDTH (so the landscape stays
       roughly square and the data scatter keeps a readable aspect) and the page
       scrolls. Drags inside the plots don't scroll — those SVGs set
       touch-action:none. */
    .app-container {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      height: auto;
      padding: 0.5rem 0.5rem calc(0.5rem + env(safe-area-inset-bottom));
      gap: 0.5rem;
    }

    .main-content {
      flex: 0 0 auto;
      height: auto;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .top-row {
      flex: 0 0 auto;
      height: auto;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .bottom-row {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      height: auto;
    }

    /* Data scatter: a touch shorter than wide reads well for the curve fit. */
    .data-viz-container {
      flex: 0 0 auto;
      height: min(72vw, 320px);
      padding: 0;
    }

    /* Landscape is an α×β plane — keep it near-square so the heatmap and basin
       map aren't distorted. */
    .loss-landscape-container {
      flex: 0 0 auto;
      height: min(94vw, 440px);
      padding: 0;
    }

    .loss-history-container {
      flex: 0 0 auto;
      height: min(52vw, 220px);
      padding: 0;
    }

    .guide-panel-container {
      display: none;
    }

    /* Sidebar becomes an off-canvas drawer. It slides in BELOW the top bar so
       the burger stays visible (and toggles the drawer closed again). */
    .sidebar {
      position: fixed;
      top: var(--mobile-topbar-h);
      left: 0;
      height: calc(100dvh - var(--mobile-topbar-h));
      width: 86%;
      max-width: 340px;
      transform: translateX(-100%);
      transition: transform 0.25s ease;
      z-index: 100;
      border-radius: 0 16px 16px 0;
      box-shadow: 8px 0 24px rgba(0, 0, 0, 0.25);
      padding: 0.75rem;
      background-color: var(--color-bg-primary);
      overflow-y: auto;
      /* Drawer scrolling stays in the drawer — never chains to the app behind. */
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }
    .sidebar.drawer-open {
      transform: translateX(0);
    }

    .drawer-backdrop {
      display: block;
      position: fixed;
      top: var(--mobile-topbar-h);
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 90;
      animation: fadeIn 0.2s ease;
      border: none;
      /* A touch-drag on the dimmed area must not scroll the app behind it. */
      touch-action: none;
      overscroll-behavior: contain;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* Hide desktop floating buttons on mobile (replaced by top-bar buttons) */
    .floating-buttons { display: none; }
  }

  /* ---------- driver.js product-tour popover (themed to match) ----------
     The popover renders at <body> level (outside this component), so every
     override is :global. data-theme on <html> is an ancestor, so the tour
     auto-switches with the app theme. */
  :global(.driver-popover.gl-tour) {
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    box-shadow: 0 18px 48px var(--color-shadow);
    max-width: 336px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  :global(.driver-popover.gl-tour .driver-popover-title) {
    color: var(--color-text-primary);
    font-size: 1rem;
    font-weight: 700;
  }
  :global(.driver-popover.gl-tour .driver-popover-description) {
    color: var(--color-text-secondary);
    font-size: 0.85rem;
    line-height: 1.55;
  }
  :global(.driver-popover.gl-tour .driver-popover-progress-text) {
    color: var(--color-text-tertiary);
    font-size: 0.72rem;
  }
  :global(.driver-popover.gl-tour .driver-popover-close-btn) {
    color: var(--color-text-tertiary);
    font-size: 1.4rem;
  }
  :global(.driver-popover.gl-tour .driver-popover-close-btn:hover) {
    color: var(--color-text-primary);
  }
  :global(.driver-popover.gl-tour button.driver-popover-next-btn) {
    background: #10b981;
    color: #04130d;
    border: none;
    border-radius: 8px;
    font-weight: 700;
    text-shadow: none;
    padding: 0.36rem 0.72rem;
    font-size: 0.8rem;
  }
  :global(.driver-popover.gl-tour button.driver-popover-next-btn:hover) {
    background: #059669;
    color: #fff;
  }
  :global(.driver-popover.gl-tour button.driver-popover-prev-btn) {
    background: transparent;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    text-shadow: none;
    font-size: 0.8rem;
  }
  :global(.driver-popover.gl-tour button.driver-popover-prev-btn:hover) {
    color: var(--color-text-primary);
    border-color: var(--color-text-tertiary);
  }
  :global(.driver-popover.gl-tour .driver-popover-arrow-side-left.driver-popover-arrow) { border-left-color: var(--color-bg-secondary); }
  :global(.driver-popover.gl-tour .driver-popover-arrow-side-right.driver-popover-arrow) { border-right-color: var(--color-bg-secondary); }
  :global(.driver-popover.gl-tour .driver-popover-arrow-side-top.driver-popover-arrow) { border-top-color: var(--color-bg-secondary); }
  :global(.driver-popover.gl-tour .driver-popover-arrow-side-bottom.driver-popover-arrow) { border-bottom-color: var(--color-bg-secondary); }

  /* Welcome step content */
  :global(.gl-tour .gl-tour-welcome) { display: flex; flex-direction: column; gap: 0.55rem; }
  :global(.gl-tour .gl-tour-brand) { display: flex; align-items: center; gap: 0.5rem; }
  :global(.gl-tour .gl-tour-mark) { font-family: 'Times New Roman', Georgia, serif; font-style: italic; font-size: 1.6rem; line-height: 1; color: #10b981; }
  :global(.gl-tour .gl-tour-name) { font-size: 1.15rem; font-weight: 800; color: var(--color-text-primary); }
  :global(.gl-tour .gl-tour-tag) { margin: 0; font-size: 0.85rem; line-height: 1.55; color: var(--color-text-secondary); }
  :global(.gl-tour .gl-tour-meta) { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; flex-wrap: wrap; margin-top: 0.15rem; }
  :global(.gl-tour .gl-tour-gh) { display: inline-flex; align-items: center; gap: 0.35rem; color: #10b981; text-decoration: none; font-size: 0.78rem; font-weight: 600; }
  :global(.gl-tour .gl-tour-gh:hover) { text-decoration: underline; }
  :global(.gl-tour .gl-tour-by) { font-size: 0.75rem; color: var(--color-text-tertiary); }
</style>