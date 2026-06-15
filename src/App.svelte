<script lang="ts">
  // Welcome to Gradient Lab!
  // This is an interactive educational tool to understand how gradient descent works
  // through visual experiments with machine learning algorithms.
  
  import { onMount } from 'svelte';
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
    courseStore,
    challengeStore
  } from './stores/stores';
  import { startTraining, stopTraining, stepOnce, resetRun, runEndStore } from './utils/trainer';
  import { startCourse, closeCourse } from './utils/lessons';
  import { applyUrlState, encodeStateUrl } from './utils/urlState';
  import { Sun, Moon, HelpCircle, Menu, X, Share2, GraduationCap, Wrench } from 'lucide-svelte';

  // The main app orchestrates all our components and manages the overall layout.
  // We use CSS Grid for a responsive, flexible layout that adapts to different screen sizes.

  $: theme = $themeStore;

  let showHelpModal = false;
  let drawerOpen = false;

  function closeDrawer() { drawerOpen = false; }
  function openDrawer() { drawerOpen = true; }

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

    // A shared link restores the full scenario (settings + seed + marker)
    const shared = applyUrlState();
    datasetStore.regenerateData();
    if (shared) {
      parametersStore.set(shared.params);
    }
    recordInitialHistory();

    if (shared?.goal) {
      challengeStore.set({ target: shared.goal, status: 'open' });
      showCoach('info', `🎯 Challenge loaded — reach the basin in ≤ ${shared.goal} steps. Tune anything you like, then Train.`, 0);
    } else if (shared) {
      // Sticky: someone opening a shared link looks around before acting;
      // any training action clears it.
      showCoach('info', 'Loaded a shared scenario — same data, same start. Hit Train to run it.', 0);
    } else if (!localStorage.getItem('gd-visited')) {
      // First visit: open the guide (it has the one-click experiments)
      localStorage.setItem('gd-visited', '1');
      showHelpModal = true;
    }
  });

  // Desktop tool corner: collapsed to one button by default
  let toolsOpen = false;

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
    if (showHelpModal || drawerOpen) return;
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
  <button class="topbar-btn menu-btn" on:click={openDrawer} aria-label="Open controls">
    <Menu size={22} strokeWidth={2.5} />
  </button>
  <h1 class="topbar-title"><span class="topbar-mark">∂</span> Gradient Lab</h1>
  <button class="topbar-btn" on:click={() => showHelpModal = true} aria-label="Help">
    <HelpCircle size={20} strokeWidth={2.5} />
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
      <button class="drawer-close" on:click={closeDrawer} aria-label="Close controls">
        <X size={20} strokeWidth={2.5} />
      </button>
      <Sidebar />
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
          <div class="data-viz-container">
            <DataVisualization />
          </div>
        {/if}
        <div class="loss-landscape-container">
          <LossLandscape />
        </div>
      </div>

      <!-- Bottom row: Loss history chart and parameter values -->
      <div class="bottom-row">
        <div class="loss-history-container">
          <LossHistory />
        </div>
        <div class="guide-panel-container">
          <GuidePanel />
        </div>
      </div>
    </div>
  </div>
</main>

<!-- Desktop tool corner (hidden on mobile, replaced by topbar): a single
     collapsed button that expands into the tool row, so it never crowds
     the Formulas panel. -->
<div class="floating-buttons" class:expanded={toolsOpen}>
  {#if toolsOpen}
    <div class="tool-tray">
      <button
        class="help-btn"
        class:tool-on={$courseStore.active}
        on:click={() => ($courseStore.active ? closeCourse() : startCourse())}
        title="Course — ten predict-then-run lessons, from slopes to a tiny neural net"
      >
        <GraduationCap size={19} strokeWidth={2.5} />
      </button>
      <button class="help-btn" class:tool-on={showSharePopover} on:click={toggleSharePopover} title="Share this exact scenario — or turn it into a challenge">
        <Share2 size={18} strokeWidth={2.5} />
      </button>
      <button class="help-btn" on:click={() => showHelpModal = true} title="Help & Guide">
        <HelpCircle size={20} strokeWidth={2.5} />
      </button>
      <button class="help-btn" on:click={() => themeStore.toggle()} title="Toggle theme">
        {#if theme === 'light'}
          <Moon size={20} strokeWidth={2.5} />
        {:else}
          <Sun size={20} strokeWidth={2.5} />
        {/if}
      </button>
    </div>
  {/if}
  <button
    class="help-btn tools-fab"
    class:tool-on={toolsOpen}
    on:click={() => (toolsOpen = !toolsOpen)}
    title={toolsOpen ? 'Collapse tools' : 'Tools — course, share, help, theme'}
    aria-expanded={toolsOpen}
  >
    {#if toolsOpen}
      <X size={18} strokeWidth={2.5} />
    {:else}
      <Wrench size={17} strokeWidth={2.5} />
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
<HelpModal isOpen={showHelpModal} onClose={() => showHelpModal = false} />

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
    width: 36px;
    height: 36px;
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

  /* Expanded tool tray slides out of the collapsed button */
  .tool-tray {
    display: flex;
    gap: 0.5rem;
    animation: trayIn 0.18s ease;
  }

  @keyframes trayIn {
    from { opacity: 0; transform: translateX(10px); }
    to   { opacity: 1; transform: translateX(0); }
  }

  /* Main app container using CSS Grid for layout */
  .app-container {
    display: grid;
    grid-template-columns: clamp(300px, 19vw, 360px) 1fr;
    height: 100vh;
    gap: var(--gap);
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
    padding: 0 0 0 0.75rem;
    position: relative;
    overflow: hidden;
    min-height: 0;
  }
  
  /* Mobile top bar: hidden on desktop */
  .mobile-topbar { display: none; }
  .drawer-close { display: none; }
  .drawer-backdrop { display: none; }

  /* Responsive design for smaller screens */
  @media (max-width: 1200px) {
    .app-container {
      grid-template-columns: 250px 1fr;
    }
  }

  /* ---------- Mobile (≤768px) ---------- */
  @media (max-width: 768px) {
    :global(html), :global(body) {
      overflow: auto;
      height: auto;
      overscroll-behavior-y: none;
    }
    /* Svelte mounts everything inside <div id="app">, so the flex column
       lives there — that lets <main> grow into the remaining viewport
       after the sticky top bar. */
    :global(#app) {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
    }

    main {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: auto;
      overflow: visible;
    }

    /* Sticky top bar */
    .mobile-topbar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      position: sticky;
      top: 0;
      z-index: 50;
      padding: 0.4rem 0.625rem;
      background-color: var(--color-bg-primary);
      border-bottom: 1px solid var(--color-border);
    }

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
      width: 40px;
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

    /* Mobile is a flex column that fills the available viewport. Each plot
       gets a flex-grow weight so they distribute the leftover space
       proportionally — no empty room on tall phones, min-heights on short
       ones. */
    .app-container {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: auto;
      padding: 0.25rem 0.5rem 0.4rem;
      gap: 0;
    }

    .main-content {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .top-row {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .bottom-row {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      gap: 0;
      height: auto;
    }

    /* Plots flex-grow proportionally; landscape gets the most weight since
       it's the most interactive viz. Min-heights keep them readable on
       short phones. */
    .data-viz-container {
      flex: 4 1 0;
      min-height: 180px;
      padding: 0;
    }

    .loss-landscape-container {
      flex: 6 1 0;
      min-height: 240px;
      padding: 0;
    }

    .loss-history-container {
      flex: 0 0 auto;
      height: clamp(160px, 24vh, 220px);
      padding: 0;
    }

    .guide-panel-container {
      display: none;
    }

    /* Sidebar becomes an off-canvas drawer */
    .sidebar {
      position: fixed;
      top: 0;
      left: 0;
      height: 100dvh;
      width: 86%;
      max-width: 340px;
      transform: translateX(-100%);
      transition: transform 0.25s ease;
      z-index: 100;
      border-radius: 0 16px 16px 0;
      box-shadow: 8px 0 24px rgba(0, 0, 0, 0.25);
      padding: 3rem 0.75rem 0.75rem;
      background-color: var(--color-bg-primary);
      overflow-y: auto;
    }
    .sidebar.drawer-open {
      transform: translateX(0);
    }

    .drawer-close {
      display: flex;
      position: absolute;
      top: 0.625rem;
      right: 0.625rem;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      border: 1px solid var(--color-border);
      background: var(--color-bg-secondary);
      color: var(--color-text-secondary);
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      z-index: 1;
    }

    .drawer-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 90;
      animation: fadeIn 0.2s ease;
      border: none;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* Hide desktop floating buttons on mobile (replaced by top-bar buttons) */
    .floating-buttons { display: none; }
  }
</style>