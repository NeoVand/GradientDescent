<script lang="ts">
  /**
   * Sidebar Component — pure UI.
   *
   * Controls are grouped into workflow-ordered section cards:
   *   Problem → Data → Optimizer → Run
   * Every row follows the same grammar — [icon] Label (i) ........ value —
   * with sliders spanning the full card width. All training behavior lives
   * in utils/trainer.ts; this component only renders state and forwards
   * intents.
   */

  import { selectedProblem, datasetStore, trainingStore, historyStore, optimizerStore, resetOptimizerState, raceStore, customModelStore, currentProblemConfig } from '../stores/stores';
  import { computeHessian, eigenSym2 } from '../utils/hessian';
  import type { ProblemType, ScheduleId, DataPoint } from '../types/types';
  import { REGRESSION_LABELS, CLASSIFICATION_LABELS, formulaIsValid, type RegressionModel, type ClassificationModel } from '../utils/customModel';
  import { problemConfigs } from '../utils/problems';
  import { optimizers, optimizerGroups, type OptimizerId } from '../utils/optimizers';
  import { schedules, scheduleOrder } from '../utils/schedules';
  import { tooltip } from '../utils/tooltip';
  import { portalToApp } from '../utils/portal';
  import {
    startTraining,
    stopTraining,
    stepOnce,
    resetRun,
    applyProblem,
    applyOptimizer,
    stopRace,
    runStartStep
  } from '../utils/trainer';
  import {
    TrendingUp,
    TrendingDown,
    Percent,
    MapPin,
    PieChart,
    Zap,
    RefreshCw,
    Play,
    Pause,
    RotateCcw,
    Activity,
    Droplets,
    Mountain,
    Info,
    Waves,
    Target,
    Radio,
    ScatterChart,
    Dices,
    StepForward,
    Gauge,
    Layers,
    Flag,
    Brain,
    Timer,
    Shapes,
    ClipboardPaste,
    PanelLeftClose
  } from 'lucide-svelte';
  import RaceSettingsModal from './RaceSettingsModal.svelte';
  import { hyperMeta } from '../utils/hyperMeta';

  /** On mobile the sidebar is a drawer; this collapses it. Unset on desktop. */
  export let onClose: (() => void) | null = null;

  let showRaceSettings = false;

  // Compact labels for the schedule segmented control
  const SCHEDULE_LABELS: Record<ScheduleId, string> = {
    constant: 'Const',
    step: 'Step',
    cosine: 'Cosine',
    'warmup-cosine': 'Warmup'
  };

  // Dropdown state. The pickers are fixed-positioned popovers (computed from
  // the trigger's rect) so the stitched control list can scroll without
  // clipping the long problem list.
  let showProblemDropdown = false;
  let showOptimizerDropdown = false;
  let problemBtn: HTMLButtonElement;
  let optimizerBtn: HTMLButtonElement;
  type DropPos = { top: number | null; bottom: number | null; left: number; width: number; maxH: number };
  let problemDropPos: DropPos = { top: 0, bottom: null, left: 0, width: 0, maxH: 400 };
  let optimizerDropPos: DropPos = { top: 0, bottom: null, left: 0, width: 0, maxH: 400 };

  // Place the popover from the trigger's on-screen rect, clamping its height to
  // the viewport (and flipping above the trigger when there's more room there),
  // so the list — and its scrollbar — always stays fully on screen.
  function placeFrom(btn: HTMLButtonElement): DropPos {
    const r = btn.getBoundingClientRect();
    const M = 12; // keep this much clear of the viewport edge
    const CHROME = 8; // border + edge-fade allowance around the scroll area
    const DESIRED = 400;
    const below = window.innerHeight - r.bottom - M;
    const above = r.top - M;
    const openUp = below < 200 && above > below;
    const space = openUp ? above : below;
    const maxH = Math.round(Math.max(120, Math.min(DESIRED, space - CHROME)));
    return {
      left: Math.round(r.left),
      width: Math.round(r.width),
      maxH,
      top: openUp ? null : Math.round(r.bottom + 4),
      bottom: openUp ? Math.round(window.innerHeight - r.top + 4) : null
    };
  }
  // Inline placement string — exactly one of top/bottom is set.
  function dropStyle(p: DropPos): string {
    const v = p.top != null ? `top: ${p.top}px` : `bottom: ${p.bottom}px`;
    return `${v}; left: ${p.left}px; width: ${p.width}px;`;
  }
  function toggleProblemDropdown() {
    showOptimizerDropdown = false;
    showProblemDropdown = !showProblemDropdown;
    if (showProblemDropdown && problemBtn) problemDropPos = placeFrom(problemBtn);
  }
  function toggleOptimizerDropdown() {
    showProblemDropdown = false;
    showOptimizerDropdown = !showOptimizerDropdown;
    if (showOptimizerDropdown && optimizerBtn) optimizerDropPos = placeFrom(optimizerBtn);
  }
  function closeDropdowns() {
    showProblemDropdown = false;
    showOptimizerDropdown = false;
  }
  $: anyDropdownOpen = showProblemDropdown || showOptimizerDropdown;

  // Both the problem and optimizer lists can outgrow their dropdown: a thin
  // scrollbar plus soft dark fades at the edges signal "there's more" in that
  // direction. Only one dropdown is open at a time, so they share the fade
  // state and bind whichever scroll element is currently live.
  let problemScrollEl: HTMLDivElement | null = null;
  let optimizerScrollEl: HTMLDivElement | null = null;
  let dropdownFadeTop = false;
  let dropdownFadeBottom = false;

  function updateDropdownFades() {
    const el = problemScrollEl ?? optimizerScrollEl;
    if (!el) return;
    dropdownFadeTop = el.scrollTop > 2;
    dropdownFadeBottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
  }

  $: if (showProblemDropdown || showOptimizerDropdown) {
    // Measure once the dropdown has rendered
    requestAnimationFrame(updateDropdownFades);
  }


  interface ProblemEntry {
    type: ProblemType;
    name: string;
    icon: any;
    customIcon?: string;
  }

  // Picker groups follow the learning arc: one parameter first, then 2D
  // fits, classification/localization, the neural-net bridge, and the
  // classic optimizer benchmarks.
  const problemGroups: { label: string; items: ProblemEntry[] }[] = [
    {
      label: 'Start in 1D',
      items: [
        { type: 'slope-1d', name: 'Fit a Slope', icon: null, customIcon: '╱' },
        { type: 'double-well-1d', name: 'Double Well', icon: null, customIcon: 'W' },
        { type: 'bumpy-1d', name: 'Bumpy Valley', icon: null, customIcon: '∿' }
      ]
    },
    {
      label: 'Fit curves',
      items: [
        { type: 'linear-regression', name: 'Linear Regression', icon: TrendingUp },
        { type: 'polynomial-regression', name: 'Polynomial Regression', icon: null, customIcon: 'x²' },
        { type: 'sine-wave', name: 'Sine Wave', icon: Activity },
        { type: 'gaussian-peak', name: 'Gaussian Peak', icon: Mountain },
        { type: 'exponential-decay', name: 'Exponential Decay', icon: TrendingDown },
        { type: 'damped-oscillator', name: 'Damped Oscillator', icon: Waves },
        { type: 'logistic-growth', name: 'Logistic Growth', icon: null, customIcon: 'σ' },
        { type: 'power-law', name: 'Power Law', icon: null, customIcon: 'xⁿ' },
        { type: 'gaussian-mixture', name: 'Gaussian Mixture', icon: null, customIcon: 'ΛΛ' }
      ]
    },
    {
      label: 'Classify & locate',
      items: [
        { type: 'logistic-regression', name: 'Logistic Regression', icon: Percent },
        { type: 'circle-classifier', name: 'Circle Classifier', icon: Target },
        { type: 'source-localization', name: 'Source Localization', icon: Radio },
        { type: 'mean-shift', name: 'Mean-Shift Cluster', icon: ScatterChart }
      ]
    },
    {
      label: 'Time series',
      items: [
        { type: 'ar2', name: 'AR(2) Time Series', icon: null, customIcon: 'xₜ' },
        { type: 'ar2-rollout', name: 'AR(2) Rollout', icon: null, customIcon: 'x̂ₜ' }
      ]
    },
    {
      label: 'Neural network',
      items: [{ type: 'tiny-net', name: 'Tiny Neural Net', icon: Brain }]
    },
    {
      label: 'Classic surfaces',
      items: [
        { type: 'stretched-bowl', name: 'Stretched Bowl', icon: null, customIcon: 'κ' },
        { type: 'rotated-valley', name: 'Rotated Valley', icon: null, customIcon: '∡' },
        { type: 'rosenbrock', name: 'Rosenbrock Valley', icon: null, customIcon: '∪' },
        { type: 'saddle-point', name: 'Saddle Point', icon: null, customIcon: '±' },
        { type: 'himmelblau', name: 'Himmelblau', icon: null, customIcon: '∷' }
      ]
    },
    {
      label: 'Your data',
      items: [
        { type: 'custom-regression', name: 'Custom Regression', icon: null, customIcon: 'ƒ' },
        { type: 'custom-classification', name: 'Custom Classification', icon: null, customIcon: '◐' }
      ]
    }
  ];

  const problems: ProblemEntry[] = problemGroups.flatMap(g => g.items);

  // Subscribe to stores
  $: currentProblem = $selectedProblem;
  $: numPoints = $datasetStore.numPoints;
  $: trainRatio = $datasetStore.trainRatio;
  $: randomSplit = $datasetStore.randomSplit;
  $: noiseLevel = $datasetStore.noiseLevel;
  $: learningRate = $trainingStore.learningRate;
  $: totalSteps = $trainingStore.totalSteps;
  $: continuous = $trainingStore.continuous;
  $: currentStep = $trainingStore.currentStep;
  $: batchSize = $trainingStore.batchSize;
  $: schedule = $trainingStore.schedule;
  $: scheduleSpeed = $trainingStore.scheduleSpeed;
  $: stepsPerSecond = $trainingStore.stepsPerSecond;
  $: isTraining = $trainingStore.isTraining;
  $: optimizerSel = $optimizerStore;
  $: currentOptimizer = optimizers[optimizerSel.id];
  $: isAnalytic = problemConfigs[currentProblem]?.noData ?? false;
  $: raceRunning = $raceStore?.running ?? false;

  // ---------- Custom datasets ----------
  $: isCustomReg = currentProblem === 'custom-regression';
  $: isCustomClass = currentProblem === 'custom-classification';
  $: isCustom = isCustomReg || isCustomClass;
  $: cmodel = $customModelStore;
  $: isCustomFormula = isCustomReg && cmodel.regression === 'custom';
  $: formulaOk = !isCustomFormula || formulaIsValid(cmodel.formula);
  const REG_OPTS: RegressionModel[] = ['line', 'quadratic', 'exponential', 'power', 'custom'];
  const CLASS_OPTS: ClassificationModel[] = ['linear', 'circle'];

  // The Model picker explains itself differently for the two custom problems.
  $: modelHint = isCustomClass
    ? 'The 2-parameter boundary separating your two classes. "Linear boundary" is a line through the origin (z = αx₁ + βx₂); "Circle" places a unit-radius circle at centre (α, β).'
    : 'The 2-parameter model fit to your data. "Custom formula" lets you type ŷ as an expression in x, a (α) and b (β); its gradient is taken by finite differences.';

  function onModelChange(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value as RegressionModel;
    customModelStore.patch({ regression: v });
    resetOptimizerState();
  }
  function onClassModelChange(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value as ClassificationModel;
    customModelStore.patch({ classification: v });
    resetOptimizerState();
  }
  function onFormulaInput(e: Event) {
    customModelStore.patch({ formula: (e.currentTarget as HTMLInputElement).value });
  }

  let showPaste = false;
  let pasteText = '';
  let pasteMsg = '';
  // Classification needs a third class column; regression's third column is the
  // optional train/test flag.
  $: pastePlaceholder = isCustomClass
    ? 'One point per line:\nx₁, x₂, class\n-1.2, -0.8, 0\n1.1, 0.9, 1\n…  (class is 0 or 1)'
    : 'One point per line:\nx, y\n0.4, 1.2\n…  (add a 3rd 1/0 for train/test)';
  function applyPaste() {
    const pts = parsePastedData(pasteText);
    if (pts.length < 3) {
      pasteMsg = isCustomClass ? 'Need ≥ 3 rows of  x₁, x₂, class' : 'Need ≥ 3 valid rows of  x, y';
      return;
    }
    if (isCustomClass && !(pts.some(p => p.label === 0) && pts.some(p => p.label === 1))) {
      pasteMsg = 'Need both class 0 and class 1 points';
      return;
    }
    datasetStore.setData(pts);
    pasteMsg = `Loaded ${pts.length} points.`;
    showPaste = false;
    pasteText = '';
  }
  /**
   * Parse pasted text into points. Regression rows are "x, y[, 1/0 train]";
   * classification rows are "x₁, x₂, class[, 1/0 train]".
   */
  function parsePastedData(text: string): DataPoint[] {
    const out: DataPoint[] = [];
    for (const line of text.split(/\r?\n/)) {
      const parts = line.trim().split(/[\s,;]+/);
      const a = parseFloat(parts[0]);
      const b = parseFloat(parts[1]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue; // skips headers/blanks
      if (isCustomClass) {
        const label = parseFloat(parts[2]) > 0.5 ? 1 : 0;
        const flag = parseFloat(parts[3]);
        out.push({ x: a, y: b, label, isTraining: Number.isFinite(flag) ? flag > 0.5 : true });
      } else {
        const flag = parseFloat(parts[2]);
        out.push({ x: a, y: b, isTraining: Number.isFinite(flag) ? flag > 0.5 : true });
      }
    }
    return out;
  }

  // Training progress for the Train button fill. A continuous (∞) run has
  // no end, so the bar reads full while it loops.
  $: trainingProgress = !isTraining
    ? 0
    : continuous
      ? 100
      : totalSteps > 0
        ? Math.max(0, Math.min(100, ((currentStep - $runStartStep) / totalSteps) * 100))
        : 0;

  // Update CSS variable for the split slider's two-tone track
  $: if (typeof document !== 'undefined') {
    const normalizedPosition = ((trainRatio - 0.1) / 0.8) * 100;
    document.documentElement.style.setProperty('--train-percentage', `${normalizedPosition}%`);
  }

  function selectProblem(type: ProblemType) {
    showProblemDropdown = false;
    applyProblem(type);
  }

  function selectOptimizer(id: OptimizerId) {
    showOptimizerDropdown = false;
    applyOptimizer(id);
  }

  // Hyperparameter slider change: store the value and restart accumulation
  // so the new setting takes effect cleanly.
  function setHyper(key: string, value: number) {
    optimizerStore.update(sel => ({ ...sel, hyper: { ...sel.hyper, [key]: value } }));
    resetOptimizerState();
  }

  function handleTrainRatioChange(e: Event) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    datasetStore.setTrainRatio(value);
    datasetStore.regenerateData();
  }

  function handleNoiseLevelChange(e: Event) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    datasetStore.setNoiseLevel(value);
    datasetStore.regenerateData();
  }

  function handleNumPointsChange(e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value);
    datasetStore.setNumPoints(value);
    datasetStore.regenerateData();
  }

  // Learning rate rides a log-scale slider: position 0..100 maps to
  // γ ∈ [1e-4, 1]. Every curated default lands exactly on the scale.
  const LR_LOG_MIN = -4;
  const LR_LOG_MAX = 0;

  $: lrSliderPos =
    ((Math.log10(Math.max(1e-4, Math.min(1, learningRate))) - LR_LOG_MIN) / (LR_LOG_MAX - LR_LOG_MIN)) * 100;

  // The stability edge for plain gradient descent, γ = 2/λmax, measured at
  // the problem's own minimum — the guide's curvature chapter derives it,
  // and this tick lets the reader FIND it on the slider. Skipped for custom
  // problems (finite-difference-of-finite-difference curvature is too noisy).
  $: stabilityEdge = (() => {
    const cfg = $currentProblemConfig;
    if (!cfg?.trueParameters || cfg.type.startsWith('custom')) return null;
    const train = $datasetStore.data.filter(d => d.isTraining);
    if (train.length === 0 && !cfg.noData) return null;
    try {
      const eig = eigenSym2(computeHessian(cfg, train, cfg.trueParameters));
      const lmax = Math.max(Math.abs(eig.lambda1), Math.abs(eig.lambda2));
      if (!Number.isFinite(lmax) || lmax <= 0) return null;
      const edge = 2 / lmax;
      return edge >= 1.5e-4 && edge <= 1 ? edge : null;
    } catch {
      return null;
    }
  })();
  $: edgeTickPos = stabilityEdge === null
    ? null
    : ((Math.log10(stabilityEdge) - LR_LOG_MIN) / (LR_LOG_MAX - LR_LOG_MIN)) * 100;

  // ---------- Informative slider colors ----------
  // Each control speaks its own color: γ heats up from safe emerald to
  // danger red as it grows (log scale, so the ramp starts around 0.1);
  // the momentum family is violet (matching the race's Momentum trail);
  // batch size is cyan (stochasticity); data points are blue; speed is
  // neutral slate (it changes nothing about the math).
  function lerpHex(c1: string, c2: string, t: number): string {
    const a = parseInt(c1.slice(1), 16);
    const b = parseInt(c2.slice(1), 16);
    const ch = (sh: number) =>
      Math.round(((a >> sh) & 255) + (((b >> sh) & 255) - ((a >> sh) & 255)) * t);
    return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
  }

  $: lrColor =
    lrSliderPos <= 55
      ? '#10b981'
      : lrSliderPos <= 80
        ? lerpHex('#10b981', '#f59e0b', (lrSliderPos - 55) / 25)
        : lerpHex('#f59e0b', '#ef4444', (lrSliderPos - 80) / 20);

  // Per-hyperparameter icon + colour (shared with the Race-settings modal).

  const SLIDER_COLORS = {
    points: '#3b82f6',
    batch: '#22d3ee',
    steps: '#10b981',
    speed: '#94a3b8',
    decay: '#f59e0b' // schedule decay speed: amber, the "annealing" warmth
  };

  function handleLrSlider(e: Event) {
    const pos = parseFloat((e.target as HTMLInputElement).value);
    const lr = Math.pow(10, LR_LOG_MIN + (pos / 100) * (LR_LOG_MAX - LR_LOG_MIN));
    trainingStore.update(store => ({ ...store, learningRate: lr }));
  }

  function formatLearningRate(rate: number): string {
    if (rate >= 0.0995) return rate.toFixed(2);
    if (rate >= 0.001) return rate.toFixed(3);
    return rate.toFixed(4);
  }

  // Batch size slides across the discrete stop list, ending at full batch.
  const batchSizeSteps: (number | 'all')[] = [1, 2, 4, 8, 16, 32, 'all'];

  function batchIndex(bs: number | 'all'): number {
    const i = batchSizeSteps.findIndex(v => v === bs);
    return i === -1 ? batchSizeSteps.length - 1 : i;
  }

  function handleBatchSlider(e: Event) {
    const i = parseInt((e.target as HTMLInputElement).value);
    trainingStore.update(store => ({ ...store, batchSize: batchSizeSteps[i] }));
  }

  $: batchLabel = batchSize === 'all' ? 'All' : String(batchSize);
  $: batchPos = (batchIndex(batchSize) / (batchSizeSteps.length - 1)) * 100;
</script>

<div class="sidebar-stack" class:dropdown-open={anyDropdownOpen}>
  <div class="panel top-panel">
    <h1>
      <span class="app-icon">∂</span>
      <span>Gradient Lab</span>
      {#if onClose}
        <button class="drawer-collapse" on:click={onClose} aria-label="Close controls">
          <PanelLeftClose size={20} strokeWidth={2.25} />
        </button>
      {/if}
    </h1>
    <div class="sidebar-content" on:scroll={closeDropdowns}>

  <!-- ===================== PROBLEM ===================== -->
  <div class="section" data-tour="problem-picker">
    <div class="section-label">
      <span>Problem</span>
    </div>
    <div class="problem-selector" class:open={showProblemDropdown}>
      <button
        class="problem-button"
        bind:this={problemBtn}
        on:click={toggleProblemDropdown}
      >
        <span class="problem-preview">
          {#if problems.find(p => p.type === currentProblem)?.customIcon}
            <span class="custom-icon">{problems.find(p => p.type === currentProblem)?.customIcon}</span>
          {:else}
            <svelte:component this={problems.find(p => p.type === currentProblem)?.icon} size={18} strokeWidth={2} />
          {/if}
        </span>
        <span class="problem-name">
          {problems.find(p => p.type === currentProblem)?.name}
        </span>
        <span class="dropdown-arrow">▼</span>
      </button>

      {#if showProblemDropdown}
        <div class="problem-dropdown" style={dropStyle(problemDropPos)} use:portalToApp>
          <div class="dropdown-scroll" style="max-height: {problemDropPos.maxH}px" bind:this={problemScrollEl} on:scroll={updateDropdownFades}>
            {#each problemGroups as group}
              <div class="dropdown-group-label">{group.label}</div>
              {#each group.items as problem}
                <button
                  class="problem-option"
                  class:selected={problem.type === currentProblem}
                  on:click={() => selectProblem(problem.type)}
                >
                  <span class="problem-icon">
                    {#if problem.customIcon}
                      <span class="custom-icon">{problem.customIcon}</span>
                    {:else}
                      <svelte:component this={problem.icon} size={18} strokeWidth={2} />
                    {/if}
                  </span>
                  <span>{problem.name}</span>
                </button>
              {/each}
            {/each}
          </div>
          <div class="scroll-fade fade-top" class:visible={dropdownFadeTop} aria-hidden="true"></div>
          <div class="scroll-fade fade-bottom" class:visible={dropdownFadeBottom} aria-hidden="true"></div>
        </div>
      {/if}
    </div>
  </div>

  <!-- ===================== DATA (hidden for pure analytic surfaces) ===================== -->
  {#if !isAnalytic}
  <div class="section" data-tour="data-section">
    <div class="section-label">
      <span>Data</span>
      <button
        class="reroll-btn"
        title="Generate a new random dataset"
        on:click={() => datasetStore.reroll()}
      >
        <Dices size={14} strokeWidth={2} />
      </button>
    </div>

    {#if isCustom}
      <!-- Custom dataset: pick the model, optionally type a formula, paste data -->
      <div class="ctl">
        <div class="row">
          <span class="icon"><Shapes size={16} strokeWidth={2} /></span>
          <span class="row-label">Model</span>
          <button class="info-btn" aria-label="About the model" use:tooltip={modelHint}>
            <Info size={13} strokeWidth={2} />
          </button>
          <div class="row-spring"></div>
        </div>
        {#if isCustomClass}
          <select class="model-select" value={cmodel.classification} on:change={onClassModelChange}>
            {#each CLASS_OPTS as m}
              <option value={m}>{CLASSIFICATION_LABELS[m]}</option>
            {/each}
          </select>
        {:else}
          <select class="model-select" value={cmodel.regression} on:change={onModelChange}>
            {#each REG_OPTS as m}
              <option value={m}>{REGRESSION_LABELS[m]}</option>
            {/each}
          </select>
        {/if}
      </div>
      {#if isCustomFormula}
        <div class="ctl">
          <input
            class="formula-input"
            class:invalid={!formulaOk}
            value={cmodel.formula}
            on:input={onFormulaInput}
            placeholder="e.g. a*sin(b*x)"
            spellcheck="false"
            autocomplete="off"
          />
        </div>
      {/if}
      <div class="ctl">
        <button class="paste-toggle" on:click={() => { showPaste = !showPaste; pasteMsg = ''; }}>
          <ClipboardPaste size={13} strokeWidth={2} />
          <span>Paste your own data{showPaste ? '' : '…'}</span>
        </button>
        {#if showPaste}
          <textarea
            class="paste-area"
            bind:value={pasteText}
            rows="4"
            spellcheck="false"
            placeholder={pastePlaceholder}
          ></textarea>
          <div class="paste-actions">
            <button class="paste-apply" on:click={applyPaste}>Apply</button>
            {#if pasteMsg}<span class="paste-msg">{pasteMsg}</span>{/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Points -->
    <div class="ctl" data-tour="data-points">
      <div class="row">
        <span class="icon"><MapPin size={16} strokeWidth={2} /></span>
        <span class="row-label">Points</span>
        <button class="info-btn" aria-label="About data points" use:tooltip={'Number of synthetic data points to generate<br/><span style="opacity:0.8;font-size:0.7rem">The dice rolls a fresh dataset</span>'}>
          <Info size={13} strokeWidth={2} />
        </button>
        <div class="row-spring"></div>
        <span class="row-value" style="color: {SLIDER_COLORS.points}">{numPoints}</span>
      </div>
      <input
        id="num-points"
        class="hyper-slider"
        type="range"
        min="10"
        max="100"
        step="5"
        value={numPoints}
        style="--fill: {((numPoints - 10) / 90) * 100}%; --slider-color: {SLIDER_COLORS.points}"
        on:input={handleNumPointsChange}
      />
    </div>

    <!-- Noise -->
    <div class="ctl" data-tour="data-noise">
      <div class="row">
        <span class="icon"><Droplets size={16} strokeWidth={2} /></span>
        <span class="row-label">Noise</span>
        <button class="info-btn" aria-label="About noise" use:tooltip={'Amount of random noise added to synthetic data<br/><span style="opacity:0.8;font-size:0.7rem">0 = clean, 2 = very noisy</span>'}>
          <Info size={13} strokeWidth={2} />
        </button>
        <div class="row-spring"></div>
        <span class="row-value noise-value">{noiseLevel.toFixed(2)}</span>
      </div>
      <input
        id="noise-level"
        type="range"
        min="0"
        max="2"
        step="0.05"
        value={noiseLevel}
        on:input={handleNoiseLevelChange}
      />
    </div>

    <!-- Train/Test Split -->
    <div class="ctl" data-tour="data-split">
      <div class="row">
        <span class="icon"><PieChart size={16} strokeWidth={2} /></span>
        <span class="row-label">Train/Test Split</span>
        <button class="info-btn" aria-label="About train/test split" use:tooltip={'Ratio of data used for training vs. testing the model'}>
          <Info size={13} strokeWidth={2} />
        </button>
        <div class="row-spring"></div>
        <span class="row-value">
          <span class="split-value train">{Math.round(trainRatio * 100)}</span><span class="split-separator">/</span><span class="split-value test">{Math.round((1 - trainRatio) * 100)}</span>
        </span>
      </div>
      <input
        id="train-ratio"
        type="range"
        min="0.1"
        max="0.9"
        step="0.1"
        value={trainRatio}
        on:input={handleTrainRatioChange}
      />
      <div class="sub-labels">
        <span class="sub-train">Train</span>
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={randomSplit}
            on:change={(e) => {
              datasetStore.setRandomSplit(e.currentTarget.checked);
              datasetStore.regenerateData();
            }}
          />
          <span>Random</span>
        </label>
        <span class="sub-test">Test</span>
      </div>
    </div>
  </div>
  {/if}

  <!-- ===================== OPTIMIZER ===================== -->
  <div class="section">
    <div class="section-label">
      <span>Optimizer</span>
    </div>

    <div class="problem-selector" class:open={showOptimizerDropdown} data-tour="optimizer-picker">
      <button
        class="problem-button"
        bind:this={optimizerBtn}
        on:click={toggleOptimizerDropdown}
      >
        <span class="problem-preview">
          <span class="custom-icon optimizer-glyph">∇</span>
        </span>
        <span class="problem-name">{currentOptimizer.name}</span>
        <span class="dropdown-arrow">▼</span>
      </button>

      {#if showOptimizerDropdown}
        <div class="problem-dropdown" style={dropStyle(optimizerDropPos)} use:portalToApp>
          <div class="dropdown-scroll" style="max-height: {optimizerDropPos.maxH}px" bind:this={optimizerScrollEl} on:scroll={updateDropdownFades}>
            {#each optimizerGroups as group}
              <div class="dropdown-group-label">{group.label}</div>
              {#each group.ids as id}
                <button
                  class="problem-option optimizer-option"
                  class:selected={id === optimizerSel.id}
                  on:click={() => selectOptimizer(id)}
                >
                  <span class="optimizer-name">{optimizers[id].name}</span>
                </button>
              {/each}
            {/each}
          </div>
          <div class="scroll-fade fade-top" class:visible={dropdownFadeTop} aria-hidden="true"></div>
          <div class="scroll-fade fade-bottom" class:visible={dropdownFadeBottom} aria-hidden="true"></div>
        </div>
      {/if}
    </div>

    <!-- Per-optimizer hyperparameters (rendered from the optimizer's spec) -->
    {#if currentOptimizer.hyperparams.length}
    <div class="hyper-group" data-tour="optimizer-hypers">
    {#each currentOptimizer.hyperparams as spec (optimizerSel.id + '-' + spec.key)}
      {@const meta = hyperMeta(spec.label)}
      <div class="ctl">
        <div class="row">
          <span class="icon"><svelte:component this={meta.icon} size={16} strokeWidth={2} /></span>
          <span class="row-label">{spec.label} <span class="greek-label">({spec.symbol})</span></span>
          <button class="info-btn" aria-label="About {spec.label}" use:tooltip={spec.hint}>
            <Info size={13} strokeWidth={2} />
          </button>
          <div class="row-spring"></div>
          <span class="row-value" style="color: {meta.color}">{(optimizerSel.hyper[spec.key] ?? spec.default).toFixed(spec.step < 0.01 ? 3 : 2)}</span>
        </div>
        <input
          id={'hyper-' + spec.key}
          class="hyper-slider"
          type="range"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={optimizerSel.hyper[spec.key] ?? spec.default}
          style="--fill: {(((optimizerSel.hyper[spec.key] ?? spec.default) - spec.min) / (spec.max - spec.min)) * 100}%; --slider-color: {meta.color}"
          on:input={(e) => setHyper(spec.key, parseFloat(e.currentTarget.value))}
        />
      </div>
    {/each}
    </div>
    {/if}

    <!-- Learning Rate (log scale) -->
    <div class="ctl" data-tour="learning-rate">
      <div class="row">
        <span class="icon"><Zap size={16} strokeWidth={2} /></span>
        <span class="row-label">Learn Rate <span class="greek-label">(γ)</span></span>
        <button class="info-btn" aria-label="About learning rate" use:tooltip={'Step size for gradient descent updates (log scale, 10⁻⁴ … 1)<br/><span style="opacity:0.8;font-size:0.7rem">Higher = faster but less stable</span>'}>
          <Info size={13} strokeWidth={2} />
        </button>
        <div class="row-spring"></div>
        <span class="row-value" style="color: {lrColor}">{formatLearningRate(learningRate)}</span>
      </div>
      <div class="lr-slider-wrap">
        <input
          id="learning-rate"
          class="hyper-slider"
          type="range"
          min="0"
          max="100"
          step="0.5"
          value={lrSliderPos}
          style="--fill: {lrSliderPos}%; --slider-color: {lrColor}"
          on:input={handleLrSlider}
        />
        {#if edgeTickPos !== null && stabilityEdge !== null}
          <span
            class="lr-edge-tick"
            style="left: {edgeTickPos}%"
            use:tooltip={`Stability edge at this problem's minimum: γ = 2/λ<sub>max</sub> ≈ ${formatLearningRate(stabilityEdge)}<br/><span style="opacity:0.8;font-size:0.7rem">Past this line plain gradient descent must diverge — the guide's curvature chapter shows why</span>`}
          ></span>
        {/if}
      </div>
    </div>

    <!-- LR Schedule -->
    <div class="ctl" data-tour="lr-schedule">
      <div class="row">
        <span class="icon"><Timer size={16} strokeWidth={2} /></span>
        <span class="row-label">Schedule</span>
        <button class="info-btn" aria-label="About schedule" use:tooltip={'How γ evolves over the run<br/><span style="opacity:0.8;font-size:0.7rem">Step drops ×0.3 at ⅓ and ⅔; cosine glides to 5%; warmup ramps up first. The dotted γ line in the loss chart shows the shape.</span>'}>
          <Info size={13} strokeWidth={2} />
        </button>
        <div class="row-spring"></div>
      </div>
      <div class="seg-control" role="group" aria-label="Learning-rate schedule">
        {#each scheduleOrder as sid}
          <button
            class:active={schedule === sid}
            title={schedules[sid].description}
            on:click={() => trainingStore.update(s => ({ ...s, schedule: sid }))}
          >{SCHEDULE_LABELS[sid]}</button>
        {/each}
      </div>
    </div>

    <!-- Decay speed: how fast the schedule anneals γ. Only meaningful for a
         decaying schedule on a finite run, so it appears with one. -->
    {#if schedule !== 'constant' && !continuous}
      <div class="ctl">
        <div class="row">
          <span class="icon"><Gauge size={16} strokeWidth={2} /></span>
          <span class="row-label">Decay speed</span>
          <button class="info-btn" aria-label="About decay speed" use:tooltip={'How fast the schedule anneals γ<br/><span style="opacity:0.8;font-size:0.7rem">1× spreads the decay across the whole run; turn it up to make the schedule bite within a short run.</span>'}>
            <Info size={13} strokeWidth={2} />
          </button>
          <div class="row-spring"></div>
          <span class="row-value" style="color: {SLIDER_COLORS.decay}">{scheduleSpeed.toFixed(1)}×</span>
        </div>
        <input
          id="schedule-speed"
          class="hyper-slider"
          type="range"
          min="0.5"
          max="10"
          step="0.5"
          value={scheduleSpeed}
          style="--fill: {((scheduleSpeed - 0.5) / 9.5) * 100}%; --slider-color: {SLIDER_COLORS.decay}"
          on:input={(e) => trainingStore.update(s => ({ ...s, scheduleSpeed: parseFloat(e.currentTarget.value) }))}
        />
      </div>
    {/if}

    <!-- Batch Size -->
    <div class="ctl" data-tour="batch-size">
      <div class="row">
        <span class="icon"><Layers size={16} strokeWidth={2} /></span>
        <span class="row-label">Batch Size</span>
        <button class="info-btn" aria-label="About batch size" use:tooltip={'Points sampled per gradient step<br/><span style="opacity:0.8;font-size:0.7rem">Small batches = noisy, stochastic descent (SGD)</span>'}>
          <Info size={13} strokeWidth={2} />
        </button>
        <div class="row-spring"></div>
        <span class="row-value" style="color: {SLIDER_COLORS.batch}">{batchLabel}</span>
      </div>
      <input
        id="batch-size"
        class="hyper-slider"
        type="range"
        min="0"
        max={batchSizeSteps.length - 1}
        step="1"
        value={batchIndex(batchSize)}
        style="--fill: {batchPos}%; --slider-color: {SLIDER_COLORS.batch}"
        on:input={handleBatchSlider}
      />
    </div>
  </div>

    </div>
  </div>

  <!-- ===================== RUN: its own card, aligned with the app's
       bottom row (same shared height) ===================== -->
  <div class="panel run-panel">
    <div class="section run-inner" data-tour="run-section">
    <div class="section-label">
      <span>Run</span>
    </div>

    <!-- Steps -->
    <div class="ctl">
      <div class="row">
        <span class="icon"><RefreshCw size={16} strokeWidth={2} /></span>
        <span class="row-label">Steps</span>
        <button class="info-btn" aria-label="About steps" use:tooltip={'Gradient steps per Train click — pull all the way right for ∞: training loops until you pause, so you can drag the marker and watch it spring back'}>
          <Info size={13} strokeWidth={2} />
        </button>
        <div class="row-spring"></div>
        <span class="row-value steps-value" class:infinite={continuous}>{continuous ? '∞' : totalSteps}</span>
      </div>
      <input
        id="training-steps"
        class="hyper-slider"
        type="range"
        min="10"
        max="1010"
        step="10"
        value={continuous ? 1010 : totalSteps}
        style="--fill: {continuous ? 100 : ((totalSteps - 10) / 990) * 100}%; --slider-color: {SLIDER_COLORS.steps}"
        on:input={(e) => {
          const v = parseInt(e.currentTarget.value);
          if (v > 1000) {
            trainingStore.update(s => ({ ...s, continuous: true }));
          } else {
            trainingStore.update(s => ({ ...s, continuous: false, totalSteps: v }));
          }
        }}
      />
    </div>

    <!-- Speed -->
    <div class="ctl">
      <div class="row">
        <span class="icon"><Gauge size={16} strokeWidth={2} /></span>
        <span class="row-label">Speed</span>
        <button class="info-btn" aria-label="About speed" use:tooltip={'Animation speed — gradient steps per second'}>
          <Info size={13} strokeWidth={2} />
        </button>
        <div class="row-spring"></div>
        <span class="row-value" style="color: {SLIDER_COLORS.speed}">{stepsPerSecond}/s</span>
      </div>
      <input
        id="speed"
        class="hyper-slider"
        type="range"
        min="2"
        max="60"
        step="1"
        value={stepsPerSecond}
        style="--fill: {((stepsPerSecond - 2) / 58) * 100}%; --slider-color: {SLIDER_COLORS.speed}"
        on:input={(e) => {
          const v = parseInt(e.currentTarget.value);
          trainingStore.update(s => ({ ...s, stepsPerSecond: v }));
        }}
      />
    </div>

    <!-- Actions -->
    <div class="action-buttons">
      <button
        class="step-button"
        on:click={stepOnce}
        disabled={isTraining}
        aria-label="Step forward"
        data-tour="run-step"
      >
        <StepForward size={18} strokeWidth={2} />
      </button>
      <button
        class="train-button"
        class:training={isTraining}
        on:click={() => (isTraining ? stopTraining() : startTraining())}
        style="--progress: {trainingProgress}%;"
        data-tour="run-train"
      >
        <div class="button-content">
          {#if isTraining}
            <Pause size={16} strokeWidth={2} />
            <span>{continuous ? '∞' : Math.round(trainingProgress) + '%'}</span>
          {:else}
            <Play size={16} strokeWidth={2} />
            <span>{continuous ? 'Train ∞' : 'Train'}</span>
          {/if}
        </div>
      </button>
      <button class="reset-button" on:click={resetRun} aria-label="Reset run" data-tour="run-reset">
        <RotateCcw size={18} strokeWidth={2} />
      </button>
    </div>

    <!-- Race: one button. It opens the setup (pick the lineup, tune it) and the
         race launches from there; while racing it stops. -->
    <button
      class="race-button"
      class:racing={raceRunning}
      on:click={() => (raceRunning ? stopRace() : (showRaceSettings = true))}
      disabled={isTraining}
      data-tour="run-race"
      use:tooltip={raceRunning
        ? 'Stop the race'
        : 'Set up and start a race — pick the optimizers, tune them, then launch from the marker’s current position'}
    >
      <Flag size={14} strokeWidth={2.25} />
      <span>{raceRunning ? 'Stop race' : 'Race optimizers'}</span>
    </button>
    </div>
  </div>
</div>

<!-- Closes the fixed-positioned pickers on an outside click -->
{#if showProblemDropdown || showOptimizerDropdown}
  <button class="dropdown-backdrop" aria-label="Close menu" on:click={closeDropdowns} use:portalToApp></button>
{/if}

{#if showRaceSettings}
  <RaceSettingsModal onClose={() => (showRaceSettings = false)} />
{/if}

<style>
  /* Two sibling cards fill the left column: the controls panel grows,
     the run deck is its own piece pinned at the bottom, sized to match
     the app's bottom row so the whole bottom line of the app aligns. */
  /* Two cards on the rail: the top one sizes to its content, the run
     deck pins to the bottom (aligned with the app's bottom row). The
     leftover space is honest page background between them. */
  .sidebar-stack {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--gap);
    height: 100%;
    min-height: 0;
  }

  .panel {
    background-color: var(--color-bg-secondary);
    border-radius: 16px;
    padding: var(--gap);
  }

  .top-panel {
    flex: 0 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    /* No stacking context here on purpose: the fixed dropdowns and their
       backdrop both live at the component root, and trapping the dropdown in
       a local context (z-index) would let the root-level backdrop paint over
       it — swallowing every click and wheel. */
  }

  .run-panel {
    flex-shrink: 0;
    height: var(--bottom-h);
    display: flex;
    flex-direction: column;
  }

  /* Spreads its rows over the fixed deck height. (The inset card is stripped
     by the .run-panel .section rule below, alongside the top-section stitch.) */
  .run-inner {
    flex: 1;
    min-height: 0;
    justify-content: space-between;
  }

  .sidebar-content {
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1 1 auto;
    min-height: 0;
    /* Always scroll on overflow — the pickers are fixed popovers, so they
       don't need a visible-overflow escape hatch any more. */
    overflow-y: auto;
    overflow-x: hidden;
    margin-top: calc(2px + 0.6 * var(--air));
    /* Breathing room so the scrollbar floats clear of the controls instead of
       touching the slider tracks and value labels. */
    padding-right: 8px;
  }

  /* Custom scrollbar for sidebar */
  .sidebar-content::-webkit-scrollbar {
    width: 6px;
  }

  .sidebar-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .sidebar-content::-webkit-scrollbar-thumb {
    background: rgba(16, 185, 129, 0.2);
    border-radius: 3px;
  }

  .sidebar-content::-webkit-scrollbar-thumb:hover {
    background: rgba(16, 185, 129, 0.4);
  }

  h1 {
    font-size: 1.125rem;
    font-weight: 700;
    margin: 0 0 0.125rem 0;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: 0.625rem;
    flex-shrink: 0;
  }

  /* Collapse-drawer control, pinned to the top-right of the header. Hidden on
     desktop (the rail is always open); revealed only in the mobile drawer. */
  .drawer-collapse {
    display: none;
    margin-left: auto;
    width: 34px;
    height: 34px;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 9px;
    background: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: 0;
    transition: color 0.15s ease, background 0.15s ease;
  }
  .drawer-collapse:active {
    transform: scale(0.92);
    color: #10b981;
  }

  .app-icon {
    color: #10b981;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Times New Roman', 'Georgia', serif;
    font-size: 1.75rem;
    font-weight: 400;
    font-style: italic;
    line-height: 1;
  }

  /* ---------- Section cards: one elevation level below the sidebar ---------- */
  .section {
    background: var(--color-bg-primary);
    border-radius: 12px;
    padding: calc(7px + 0.3 * var(--air)) 0.7rem calc(9px + 0.3 * var(--air));
    display: flex;
    flex-direction: column;
    gap: calc(5px + 0.5 * var(--air));
    flex-shrink: 0;
  }

  /* Groups the per-optimizer sliders for the product tour without changing
     their layout — it carries the same column gap as the parent section. */
  .hyper-group {
    display: flex;
    flex-direction: column;
    gap: calc(5px + 0.5 * var(--air));
  }

  /* The top rail stitches its sections into one continuous panel surface (no
     inset cards, no dividers) — the uppercase section labels do the
     separating. Cleaner and more compact, and the list scrolls as a whole.
     The run deck gets the same treatment for consistency: no inset card, its
     content aligned to the panel edge like the sections above. (Both need a
     two-class selector to outrank the later .section base rule.) */
  .sidebar-content .section,
  .run-panel .section {
    background: none;
    border-radius: 0;
    padding: calc(6px + 0.3 * var(--air)) 0 calc(8px + 0.3 * var(--air));
  }

  .section-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.625rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #10b981;
    min-height: calc(15px + 0.3 * var(--air));
  }

  /* ---------- Row grammar: [icon] Label (i) ······· value ---------- */
  .row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    min-height: calc(20px + 0.2 * var(--air));
  }

  .row .icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    color: var(--color-text-tertiary);
  }

  .row-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    white-space: nowrap;
    line-height: 1.2;
  }

  .row-spring {
    flex: 1;
  }

  .row-value {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .ctl {
    display: flex;
    flex-direction: column;
    gap: calc(2px + 0.3 * var(--air));
  }

  /* ---------- Custom dataset controls ---------- */
  .model-select {
    width: 100%;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    font-size: 0.78rem;
    font-weight: 500;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
  }
  .model-select:focus { outline: none; border-color: #10b981; }
  .formula-input {
    width: 100%;
    padding: 0.4rem 0.55rem;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.78rem;
  }
  .formula-input:focus { outline: none; border-color: #10b981; }
  .formula-input.invalid { border-color: var(--color-danger); }
  .paste-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    align-self: flex-start;
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 7px;
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }
  .paste-toggle:hover { color: #10b981; border-color: rgba(16, 185, 129, 0.5); }
  .paste-area {
    width: 100%;
    margin-top: 0.3rem;
    padding: 0.45rem 0.55rem;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.72rem;
    line-height: 1.4;
    resize: vertical;
  }
  .paste-area:focus { outline: none; border-color: #10b981; }
  .paste-actions { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.35rem; }
  .paste-apply {
    padding: 0.3rem 0.7rem;
    border: 1px solid rgba(16, 185, 129, 0.5);
    border-radius: 7px;
    background: rgba(16, 185, 129, 0.12);
    color: #10b981;
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
  }
  .paste-apply:hover { background: rgba(16, 185, 129, 0.22); }
  .paste-msg { font-size: 0.7rem; color: var(--color-text-tertiary); }

  .greek-label {
    font-family: 'Georgia', serif;
    font-style: italic;
    font-weight: 400;
    opacity: 0.7;
  }

  /* ---------- Info tooltips ---------- */
  .info-btn {
    width: 15px;
    height: 15px;
    padding: 0;
    border: none;
    background: none;
    color: var(--color-text-tertiary);
    cursor: help;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
    opacity: 0.4;
  }

  .info-btn:hover {
    opacity: 1;
    color: #10b981;
  }

  /* ---------- Dropdown selectors (problem + optimizer share styles) ---------- */
  .problem-selector {
    position: relative;
  }

  .problem-button {
    width: 100%;
    height: calc(34px + 0.7 * var(--air));
    padding: 0 0.7rem;
    border: 2px solid var(--color-border);
    border-radius: 9px;
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.625rem;
    cursor: pointer;
    transition: border-color 0.2s;
    font-size: 0.875rem;
    outline: none;
  }

  .problem-button:hover,
  .problem-button:focus,
  .problem-selector.open .problem-button {
    border-color: #10b981;
  }

  .problem-preview {
    display: flex;
    align-items: center;
    color: #10b981;
    flex-shrink: 0;
  }

  .problem-name {
    flex: 1;
    text-align: left;
    font-weight: 500;
    font-size: 0.84rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dropdown-arrow {
    transition: transform 0.2s;
    font-size: 0.625rem;
    color: var(--color-text-tertiary);
  }

  .problem-selector.open .dropdown-arrow {
    transform: rotate(180deg);
  }

  /* Fixed-positioned (top/left/width set inline from the trigger's rect) so it
     escapes the scrolling control list instead of being clipped by it. */
  /* Portaled to #app, so these z-indexes clear the mobile drawer (z 100)
     and its backdrop (z 90) as well as the desktop panels. */
  .problem-dropdown {
    position: fixed;
    background: var(--color-bg-secondary);
    border: 2px solid var(--color-border);
    border-radius: 9px;
    overflow: hidden;
    box-shadow: 0 10px 28px var(--color-shadow);
    z-index: 250;
  }
  .dropdown-backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    z-index: 240;
    cursor: default;
    /* A drag on the backdrop closes nothing and scrolls nothing. */
    touch-action: none;
    overscroll-behavior: contain;
  }

  /* Scroll container: deliberately shorter than the list (the cut lands
     mid-item), with a hairline scrollbar + strong edge fades so "there's
     more" is unmistakable. */
  .dropdown-scroll {
    max-height: min(46vh, 400px); /* fallback; the live cap is set inline from the viewport */
    overflow-y: auto;
    /* Keep wheel scrolling inside the list — without this it chains into the
       sidebar, whose scroll handler would snap the dropdown shut mid-scroll. */
    overscroll-behavior: contain;
    /* Touch: vertical pans on the list scroll the list, nothing else. */
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: rgba(16, 185, 129, 0.35) transparent;
  }

  .dropdown-scroll::-webkit-scrollbar {
    width: 4px;
  }

  .dropdown-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .dropdown-scroll::-webkit-scrollbar-thumb {
    background: rgba(16, 185, 129, 0.35);
    border-radius: 2px;
  }

  .dropdown-scroll::-webkit-scrollbar-thumb:hover {
    background: rgba(16, 185, 129, 0.6);
  }

  /* Edge shadows: a short DARK gradient (an inner shadow, not a fade to
     the background) — content visibly slips under it in both themes. */
  .scroll-fade {
    position: absolute;
    left: 0;
    right: 0;
    height: 18px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.18s ease;
  }

  :global([data-theme='light']) .fade-top {
    background: linear-gradient(to bottom, rgba(15, 23, 42, 0.16), transparent);
  }

  :global([data-theme='dark']) .fade-top {
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), transparent);
  }

  :global([data-theme='light']) .fade-bottom {
    background: linear-gradient(to top, rgba(15, 23, 42, 0.16), transparent);
  }

  :global([data-theme='dark']) .fade-bottom {
    background: linear-gradient(to top, rgba(0, 0, 0, 0.6), transparent);
  }

  .fade-top {
    top: 0;
  }

  .fade-bottom {
    bottom: 0;
  }

  .scroll-fade.visible {
    opacity: 1;
  }

  .dropdown-group-label {
    padding: 0.45rem 0.7rem 0.2rem;
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--color-text-tertiary);
    opacity: 0.85;
    pointer-events: none;
  }

  .dropdown-group-label:not(:first-child) {
    margin-top: 0.25rem;
    border-top: 1px solid var(--color-border);
    padding-top: 0.5rem;
  }

  .problem-option {
    width: 100%;
    padding: 0.55rem 0.7rem;
    border: none;
    border-radius: 0;
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.625rem;
    cursor: pointer;
    transition: background 0.15s;
    text-align: left;
    font-size: 0.875rem;
    outline: none;
  }

  .problem-option .problem-icon {
    color: var(--color-text-tertiary);
    transition: color 0.2s;
    display: flex;
    align-items: center;
  }

  .problem-option:hover {
    background: rgba(16, 185, 129, 0.1);
  }

  .problem-option.selected {
    background: rgba(16, 185, 129, 0.15);
  }

  .problem-option.selected .problem-icon {
    color: #10b981;
  }

  /* One name per row — same single-line compactness as the problem picker
     (no subtitle), so the 14-item list stays scannable. */
  .optimizer-option {
    padding: 0.5rem 0.7rem;
  }

  /* Segmented control (schedule picker): same family as the 2D/3D toggle */
  /* Segmented control: a subtle track with NO dividers — only the selected
     segment is a clean emerald pill (bordered + tinted). */
  .seg-control {
    display: flex;
    gap: 3px;
    padding: 3px;
    border-radius: 9px;
    background: rgba(127, 127, 127, 0.1);
  }

  .seg-control button {
    flex: 1;
    border: 1px solid transparent;     /* reserve space; no layout shift when selected */
    background: transparent;
    color: var(--color-text-tertiary);
    font-size: 0.6563rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    padding: calc(3.5px + 0.15 * var(--air)) 0;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .seg-control button:hover:not(.active) {
    color: var(--color-text-secondary);
  }

  .seg-control button.active {
    background: rgba(16, 185, 129, 0.16);
    border-color: rgba(16, 185, 129, 0.55);
    color: #10b981;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }

  /* Day mode: a crisp cool recessed track (the old flat neutral-grey read
     muddy on the light card) with a white active pill that lifts, accented
     emerald. Dark mode keeps its translucent track above. */
  :global([data-theme='light']) .seg-control {
    background: rgba(15, 23, 42, 0.05);
    box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.05);
  }
  :global([data-theme='light']) .seg-control button.active {
    background: #ffffff;
    border-color: rgba(16, 185, 129, 0.5);
    color: #059669;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.16);
  }

  .optimizer-name {
    font-size: 0.875rem;
  }

  .optimizer-glyph {
    font-family: 'Times New Roman', Georgia, serif;
    font-size: 1.125rem;
    line-height: 1;
    font-weight: 400;
  }

  .custom-icon {
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ---------- Sliders (always full card width) ---------- */
  .section input[type='range'] {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
    /* Breathing room so the 16px knob (which overhangs the 6px track) never
       collides with the labels above/below. Knob size is unchanged. */
    margin: 5px 0;
  }

  #train-ratio {
    --slider-color: var(--color-primary);
    background: linear-gradient(to right,
      var(--color-primary) 0%,
      var(--color-primary) var(--train-percentage, 80%),
      var(--color-success) var(--train-percentage, 80%),
      var(--color-success) 100%);
  }

  #noise-level {
    --slider-color: var(--color-warning);
    background: linear-gradient(to right,
      var(--color-success) 0%,
      var(--color-warning) 50%,
      var(--color-danger) 100%);
  }

  /* Value-fill sliders: the active side fills with the control's own
     color (--slider-color, set inline per slider); --fill is the level. */
  .hyper-slider {
    background:
      linear-gradient(to right,
        color-mix(in srgb, var(--slider-color, #10b981) 25%, transparent) 0%,
        var(--slider-color, #10b981) var(--fill, 0%),
        rgba(127, 127, 127, 0.25) var(--fill, 0%),
        rgba(127, 127, 127, 0.25) 100%);
  }

  /* The 2/λmax stability tick on the γ slider: a small caret under the
     track — an axis mark, not an obstruction — at the exact rate past
     which plain GD diverges on this problem. */
  .lr-slider-wrap {
    position: relative;
    padding-bottom: 7px;
    margin-bottom: -7px;
  }
  .lr-edge-tick {
    position: absolute;
    top: calc(50% + 4px);
    width: 0;
    height: 0;
    transform: translateX(-50%);
    border-left: 3.5px solid transparent;
    border-right: 3.5px solid transparent;
    border-bottom: 5px solid color-mix(in srgb, #ef4444 80%, transparent);
    cursor: help;
  }
  .lr-edge-tick:hover {
    border-bottom-color: #ef4444;
  }

  /* The knob takes the slider's own colour (--slider-color, set per slider);
     falls back to the primary only if a slider doesn't declare one. */
  .section input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    border: 3px solid var(--slider-color, var(--color-primary));
    cursor: grab;
    transition: transform 0.15s;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .section input[type='range']::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    border: 3px solid var(--slider-color, var(--color-primary));
    cursor: grab;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .section input[type='range']::-webkit-slider-thumb:hover {
    transform: scale(1.12);
  }

  .section input[type='range']::-webkit-slider-thumb:active {
    cursor: grabbing;
  }

  .hyper-slider::-webkit-slider-thumb {
    border-color: var(--slider-color, #10b981);
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.2),
      0 0 calc(var(--fill, 0%) * 0.12) color-mix(in srgb, var(--slider-color, #10b981) 70%, transparent);
  }

  /* ---------- Split sub-labels with inline Random checkbox ---------- */
  .sub-labels {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.625rem;
    color: var(--color-text-tertiary);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .sub-train { color: var(--color-primary); }
  .sub-test { color: var(--color-success); }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    cursor: pointer;
    font-size: 0.66rem;
    color: var(--color-text-secondary);
    user-select: none;
    text-transform: none;
    letter-spacing: 0;
    font-weight: 500;
  }

  .checkbox-label input[type='checkbox'] {
    width: 13px;
    height: 13px;
    cursor: pointer;
    accent-color: #10b981;
    margin: 0;
  }

  /* ---------- Value accents ---------- */
  .split-value.train { color: var(--color-primary); }
  .split-value.test { color: var(--color-success); }
  .split-separator { color: var(--color-text-tertiary); font-weight: 400; }
  .noise-value { color: var(--color-warning); }
  .steps-value { color: #10b981; }
  .steps-value.infinite { font-size: 1.05rem; font-weight: 800; line-height: 1; }

  /* ---------- Dice / reroll ---------- */
  .reroll-btn {
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: #10b981;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
    opacity: 0.7;
  }

  .reroll-btn:hover {
    opacity: 1;
    background: rgba(16, 185, 129, 0.12);
    transform: rotate(-12deg) scale(1.12);
  }

  /* ---------- Action buttons ---------- */
  .action-buttons {
    display: flex;
    gap: 0.5rem;
    align-items: stretch;
    margin-top: 0.125rem;
  }

  /* Styled tooltips for the step / reset buttons (text = the button's
     aria-label), shown above on hover or keyboard focus. The step tip is
     left-anchored and the reset tip right-anchored so neither spills out of
     the sidebar. */
  .step-button,
  .reset-button {
    position: relative;
  }
  .step-button::after,
  .reset-button::after {
    content: attr(aria-label);
    position: absolute;
    bottom: calc(100% + 8px);
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
  .step-button::after { left: 0; }
  .reset-button::after { right: 0; }
  .step-button:hover::after,
  .step-button:focus-visible::after,
  .reset-button:hover::after,
  .reset-button:focus-visible::after {
    opacity: 1;
    transform: translateY(0);
  }

  .step-button {
    width: calc(34px + 0.8 * var(--air));
    height: calc(34px + 0.8 * var(--air));
    padding: 0;
    border: 2px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-secondary);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .step-button:hover:not(:disabled) {
    background: var(--color-bg-tertiary);
    border-color: #10b981;
    color: #10b981;
    transform: translateY(-1px);
  }

  .step-button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .train-button {
    flex: 1;
    padding: 0;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    min-height: calc(34px + 0.8 * var(--air));
    position: relative;
    overflow: hidden;
  }

  :global([data-theme='light']) .train-button {
    background: linear-gradient(135deg, #a7f3d0 0%, #6ee7b7 100%);
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
  }

  :global([data-theme='dark']) .train-button {
    background: linear-gradient(135deg, #047857 0%, #065f46 100%);
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
  }

  .train-button::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: var(--progress, 0%);
    background: rgba(255, 255, 255, 0.2);
    transition: width 0.3s ease;
    z-index: 0;
  }

  .button-content {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: calc(7px + 0.4 * var(--air)) 0.75rem;
  }

  :global([data-theme='light']) .button-content {
    color: #000000;
  }

  :global([data-theme='dark']) .button-content {
    color: #d1fae5;
  }

  .train-button.training .button-content {
    color: white !important;
  }

  :global([data-theme='light']) .train-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  }

  :global([data-theme='dark']) .train-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.5);
  }

  .train-button.training {
    background: linear-gradient(135deg, #f87171 0%, #dc2626 100%);
    box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3);
  }

  .train-button.training::before {
    background: rgba(255, 255, 255, 0.25);
  }

  .train-button.training:hover {
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  .train-button.training .button-content {
    font-size: 0.8125rem;
  }

  .reset-button {
    width: calc(34px + 0.8 * var(--air));
    height: calc(34px + 0.8 * var(--air));
    padding: 0;
    border: 2px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-secondary);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .reset-button:hover {
    background: var(--color-bg-tertiary);
    border-color: var(--color-danger);
    color: var(--color-danger);
    transform: translateY(-1px);
  }

  /* Race: one full-width secondary action under the transport row. An emerald
     outline + tint (theme-aware via --color-success), distinct from the filled
     Train button — same height and radius as the step/train/reset buttons, so
     the deck stays symmetric. Opens the setup modal; the race starts there. */
  .race-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    min-height: calc(34px + 0.8 * var(--air));
    /* Breathing room from the transport row above. */
    margin-top: calc(4px + 0.4 * var(--air));
    padding: 0 0.75rem;
    border: 1.5px solid var(--color-success);
    border-radius: 8px;
    background: color-mix(in srgb, var(--color-success) 12%, transparent);
    color: var(--color-success);
    font-size: 0.8125rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .race-button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-success) 22%, transparent);
    transform: translateY(-1px);
  }

  .race-button.racing {
    border-color: var(--color-danger);
    background: color-mix(in srgb, var(--color-danger) 16%, transparent);
    color: var(--color-danger);
  }

  .race-button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  @media (max-width: 768px) {
    .sidebar-stack { gap: 0.625rem; }
    .run-panel { height: auto; }
    .panel { padding: 0.75rem; }
    .drawer-collapse { display: flex; }
    /* The drawer opens under the app top bar, which already shows the title
       and the burger-✕ toggle — the in-drawer header would just repeat both. */
    .top-panel h1 { display: none; }
    .sidebar-content { margin-top: 0; }
    /* While a picker popover is open, the drawer holds still behind it —
       otherwise a stray drag scrolls the list out from under the popover. */
    .sidebar-stack.dropdown-open .sidebar-content { overflow-y: hidden; }
    :global(aside.sidebar:has(.sidebar-stack.dropdown-open)) { overflow-y: hidden; }
  }
</style>
