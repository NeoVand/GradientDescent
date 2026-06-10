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

  import { selectedProblem, datasetStore, trainingStore, historyStore, optimizerStore, resetOptimizerState, raceStore } from '../stores/stores';
  import type { ProblemType, ScheduleId } from '../types/types';
  import { problemConfigs } from '../utils/problems';
  import { optimizers, optimizerOrder, type OptimizerId } from '../utils/optimizers';
  import { schedules, scheduleOrder } from '../utils/schedules';
  import {
    startTraining,
    stopTraining,
    stepOnce,
    resetRun,
    applyProblem,
    applyOptimizer,
    startRace,
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
    Rocket,
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
    Timer
  } from 'lucide-svelte';

  // Compact labels for the schedule segmented control
  const SCHEDULE_LABELS: Record<ScheduleId, string> = {
    constant: 'Const',
    step: 'Step',
    cosine: 'Cosine',
    'warmup-cosine': 'Warmup'
  };

  // Dropdown state
  let showProblemDropdown = false;
  let showOptimizerDropdown = false;

  // Tooltip state
  let activeTooltip: string | null = null;

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
      label: 'Neural network',
      items: [{ type: 'tiny-net', name: 'Tiny Neural Net', icon: Brain }]
    },
    {
      label: 'Classic surfaces',
      items: [
        { type: 'rosenbrock', name: 'Rosenbrock Valley', icon: null, customIcon: '∪' },
        { type: 'saddle-point', name: 'Saddle Point', icon: null, customIcon: '±' },
        { type: 'himmelblau', name: 'Himmelblau', icon: null, customIcon: '∷' }
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
  $: currentStep = $trainingStore.currentStep;
  $: batchSize = $trainingStore.batchSize;
  $: schedule = $trainingStore.schedule;
  $: stepsPerSecond = $trainingStore.stepsPerSecond;
  $: isTraining = $trainingStore.isTraining;
  $: optimizerSel = $optimizerStore;
  $: currentOptimizer = optimizers[optimizerSel.id];
  $: isAnalytic = problemConfigs[currentProblem]?.noData ?? false;
  $: raceRunning = $raceStore?.running ?? false;

  // Training progress for the Train button fill
  $: trainingProgress = isTraining && totalSteps > 0
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

<div class="sidebar-content">
  <h1>
    <span class="app-icon">∂</span>
    <span>Gradient Descent</span>
  </h1>

  <!-- ===================== PROBLEM ===================== -->
  <div class="section">
    <div class="section-label">
      <span>Problem</span>
    </div>
    <div class="problem-selector" class:open={showProblemDropdown}>
      <button
        class="problem-button"
        on:click={() => showProblemDropdown = !showProblemDropdown}
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
        <div class="problem-dropdown">
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
      {/if}
    </div>
  </div>

  <!-- ===================== DATA (hidden for pure analytic surfaces) ===================== -->
  {#if !isAnalytic}
  <div class="section">
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

    <!-- Points -->
    <div class="ctl">
      <div class="row">
        <span class="icon"><MapPin size={16} strokeWidth={2} /></span>
        <span class="row-label">Points</span>
        <div class="tooltip-container">
          <button
            class="info-btn"
            on:mouseenter={() => activeTooltip = 'dataPoints'}
            on:mouseleave={() => activeTooltip = null}
          >
            <Info size={13} strokeWidth={2} />
          </button>
          {#if activeTooltip === 'dataPoints'}
            <div class="tooltip">
              Number of synthetic data points to generate<br/>
              <span style="opacity: 0.8; font-size: 0.7rem;">The dice rolls a fresh dataset</span>
            </div>
          {/if}
        </div>
        <div class="row-spring"></div>
        <span class="row-value points-value">{numPoints}</span>
      </div>
      <input
        id="num-points"
        class="hyper-slider"
        type="range"
        min="10"
        max="100"
        step="5"
        value={numPoints}
        style="--fill: {((numPoints - 10) / 90) * 100}%"
        on:input={handleNumPointsChange}
      />
    </div>

    <!-- Noise -->
    <div class="ctl">
      <div class="row">
        <span class="icon"><Droplets size={16} strokeWidth={2} /></span>
        <span class="row-label">Noise</span>
        <div class="tooltip-container">
          <button
            class="info-btn"
            on:mouseenter={() => activeTooltip = 'noise'}
            on:mouseleave={() => activeTooltip = null}
          >
            <Info size={13} strokeWidth={2} />
          </button>
          {#if activeTooltip === 'noise'}
            <div class="tooltip">
              Amount of random noise added to synthetic data<br/>
              <span style="opacity: 0.8; font-size: 0.7rem;">0 = clean, 2 = very noisy</span>
            </div>
          {/if}
        </div>
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
    <div class="ctl">
      <div class="row">
        <span class="icon"><PieChart size={16} strokeWidth={2} /></span>
        <span class="row-label">Train/Test Split</span>
        <div class="tooltip-container">
          <button
            class="info-btn"
            on:mouseenter={() => activeTooltip = 'trainTest'}
            on:mouseleave={() => activeTooltip = null}
          >
            <Info size={13} strokeWidth={2} />
          </button>
          {#if activeTooltip === 'trainTest'}
            <div class="tooltip">
              Ratio of data used for training vs. testing the model
            </div>
          {/if}
        </div>
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

    <div class="problem-selector" class:open={showOptimizerDropdown}>
      <button
        class="problem-button"
        on:click={() => showOptimizerDropdown = !showOptimizerDropdown}
      >
        <span class="problem-preview">
          <span class="custom-icon optimizer-glyph">∇</span>
        </span>
        <span class="problem-name">{currentOptimizer.name}</span>
        <span class="dropdown-arrow">▼</span>
      </button>

      {#if showOptimizerDropdown}
        <div class="problem-dropdown">
          {#each optimizerOrder as id}
            <button
              class="problem-option optimizer-option"
              class:selected={id === optimizerSel.id}
              on:click={() => selectOptimizer(id)}
            >
              <span class="optimizer-text">
                <span class="optimizer-name">{optimizers[id].name}</span>
                <span class="optimizer-desc">{optimizers[id].description}</span>
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Per-optimizer hyperparameters (rendered from the optimizer's spec) -->
    {#each currentOptimizer.hyperparams as spec (optimizerSel.id + '-' + spec.key)}
      <div class="ctl">
        <div class="row">
          <span class="icon"><Rocket size={16} strokeWidth={2} /></span>
          <span class="row-label">{spec.label} <span class="greek-label">({spec.symbol})</span></span>
          <div class="tooltip-container">
            <button
              class="info-btn"
              on:mouseenter={() => activeTooltip = 'hyper-' + spec.key}
              on:mouseleave={() => activeTooltip = null}
            >
              <Info size={13} strokeWidth={2} />
            </button>
            {#if activeTooltip === 'hyper-' + spec.key}
              <div class="tooltip">{spec.hint}</div>
            {/if}
          </div>
          <div class="row-spring"></div>
          <span class="row-value momentum-value">{(optimizerSel.hyper[spec.key] ?? spec.default).toFixed(spec.step < 0.01 ? 3 : 2)}</span>
        </div>
        <input
          id={'hyper-' + spec.key}
          class="hyper-slider"
          type="range"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={optimizerSel.hyper[spec.key] ?? spec.default}
          style="--fill: {(((optimizerSel.hyper[spec.key] ?? spec.default) - spec.min) / (spec.max - spec.min)) * 100}%"
          on:input={(e) => setHyper(spec.key, parseFloat(e.currentTarget.value))}
        />
      </div>
    {/each}

    <!-- Learning Rate (log scale) -->
    <div class="ctl">
      <div class="row">
        <span class="icon"><Zap size={16} strokeWidth={2} /></span>
        <span class="row-label">Learn Rate <span class="greek-label">(γ)</span></span>
        <div class="tooltip-container">
          <button
            class="info-btn"
            on:mouseenter={() => activeTooltip = 'learningRate'}
            on:mouseleave={() => activeTooltip = null}
          >
            <Info size={13} strokeWidth={2} />
          </button>
          {#if activeTooltip === 'learningRate'}
            <div class="tooltip">
              Step size for gradient descent updates (log scale, 10⁻⁴ … 1)<br/>
              <span style="opacity: 0.8; font-size: 0.7rem;">Higher = faster but less stable</span>
            </div>
          {/if}
        </div>
        <div class="row-spring"></div>
        <span class="row-value lr-value">{formatLearningRate(learningRate)}</span>
      </div>
      <input
        id="learning-rate"
        class="hyper-slider"
        type="range"
        min="0"
        max="100"
        step="0.5"
        value={lrSliderPos}
        style="--fill: {lrSliderPos}%"
        on:input={handleLrSlider}
      />
    </div>

    <!-- LR Schedule -->
    <div class="ctl">
      <div class="row">
        <span class="icon"><Timer size={16} strokeWidth={2} /></span>
        <span class="row-label">Schedule</span>
        <div class="tooltip-container">
          <button
            class="info-btn"
            on:mouseenter={() => activeTooltip = 'schedule'}
            on:mouseleave={() => activeTooltip = null}
          >
            <Info size={13} strokeWidth={2} />
          </button>
          {#if activeTooltip === 'schedule'}
            <div class="tooltip">
              How γ evolves over the run<br/>
              <span style="opacity: 0.8; font-size: 0.7rem;">Step drops ×0.3 at ⅓ and ⅔; cosine glides to 5%; warmup ramps up first. The dotted γ line in the loss chart shows the shape.</span>
            </div>
          {/if}
        </div>
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

    <!-- Batch Size -->
    <div class="ctl">
      <div class="row">
        <span class="icon"><Layers size={16} strokeWidth={2} /></span>
        <span class="row-label">Batch Size</span>
        <div class="tooltip-container">
          <button
            class="info-btn"
            on:mouseenter={() => activeTooltip = 'batch'}
            on:mouseleave={() => activeTooltip = null}
          >
            <Info size={13} strokeWidth={2} />
          </button>
          {#if activeTooltip === 'batch'}
            <div class="tooltip">
              Points sampled per gradient step<br/>
              <span style="opacity: 0.8; font-size: 0.7rem;">Small batches = noisy, stochastic descent (SGD)</span>
            </div>
          {/if}
        </div>
        <div class="row-spring"></div>
        <span class="row-value momentum-value">{batchLabel}</span>
      </div>
      <input
        id="batch-size"
        class="hyper-slider"
        type="range"
        min="0"
        max={batchSizeSteps.length - 1}
        step="1"
        value={batchIndex(batchSize)}
        style="--fill: {batchPos}%"
        on:input={handleBatchSlider}
      />
    </div>
  </div>

  <!-- ===================== RUN ===================== -->
  <div class="section run-section">
    <div class="section-label">
      <span>Run</span>
    </div>

    <!-- Steps -->
    <div class="ctl">
      <div class="row">
        <span class="icon"><RefreshCw size={16} strokeWidth={2} /></span>
        <span class="row-label">Steps</span>
        <div class="tooltip-container">
          <button
            class="info-btn"
            on:mouseenter={() => activeTooltip = 'steps'}
            on:mouseleave={() => activeTooltip = null}
          >
            <Info size={13} strokeWidth={2} />
          </button>
          {#if activeTooltip === 'steps'}
            <div class="tooltip">
              Number of gradient descent iterations to perform when training
            </div>
          {/if}
        </div>
        <div class="row-spring"></div>
        <span class="row-value steps-value">{totalSteps}</span>
      </div>
      <input
        id="training-steps"
        class="hyper-slider"
        type="range"
        min="10"
        max="1000"
        step="10"
        value={totalSteps}
        style="--fill: {((totalSteps - 10) / 990) * 100}%"
        on:input={(e) => {
          const v = parseInt(e.currentTarget.value);
          trainingStore.update(s => ({ ...s, totalSteps: v }));
        }}
      />
    </div>

    <!-- Speed -->
    <div class="ctl">
      <div class="row">
        <span class="icon"><Gauge size={16} strokeWidth={2} /></span>
        <span class="row-label">Speed</span>
        <div class="tooltip-container">
          <button
            class="info-btn"
            on:mouseenter={() => activeTooltip = 'speed'}
            on:mouseleave={() => activeTooltip = null}
          >
            <Info size={13} strokeWidth={2} />
          </button>
          {#if activeTooltip === 'speed'}
            <div class="tooltip">
              Animation speed — gradient steps per second
            </div>
          {/if}
        </div>
        <div class="row-spring"></div>
        <span class="row-value speed-value">{stepsPerSecond}/s</span>
      </div>
      <input
        id="speed"
        class="hyper-slider"
        type="range"
        min="2"
        max="60"
        step="1"
        value={stepsPerSecond}
        style="--fill: {((stepsPerSecond - 2) / 58) * 100}%"
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
        title="Single gradient step"
      >
        <StepForward size={18} strokeWidth={2} />
      </button>
      <button
        class="train-button"
        class:training={isTraining}
        on:click={() => (isTraining ? stopTraining() : startTraining())}
        style="--progress: {trainingProgress}%;"
      >
        <div class="button-content">
          {#if isTraining}
            <Pause size={16} strokeWidth={2} />
            <span>{Math.round(trainingProgress)}%</span>
          {:else}
            <Play size={16} strokeWidth={2} />
            <span>Train</span>
          {/if}
        </div>
      </button>
      <button class="reset-button" on:click={resetRun} title="Reset">
        <RotateCcw size={18} strokeWidth={2} />
      </button>
    </div>

    <!-- Race: all four optimizer families from the marker's current spot -->
    <button
      class="race-button"
      class:racing={raceRunning}
      on:click={() => (raceRunning ? stopRace() : startRace())}
      disabled={isTraining}
      title="Race GD, Momentum, RMSProp, and Adam from the current marker position"
    >
      <Flag size={14} strokeWidth={2.25} />
      <span>{raceRunning ? 'Stop race' : 'Race optimizers'}</span>
    </button>
  </div>
</div>

<style>
  .sidebar-content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
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
    padding: 0.625rem 0.75rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    flex-shrink: 0;
  }

  /* The Run deck anchors to the bottom; leftover height collects in the
     single gap above it instead of below the buttons. */
  .run-section {
    margin-top: auto;
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
    min-height: 18px;
  }

  /* ---------- Row grammar: [icon] Label (i) ······· value ---------- */
  .row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    min-height: 22px;
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
    gap: 0.3rem;
  }

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

  .tooltip-container {
    position: relative;
    display: flex;
    align-items: center;
  }

  .tooltip {
    position: fixed;
    left: 312px;
    transform: translateY(-50%);
    padding: 0.625rem 0.875rem;
    border-radius: 8px;
    font-size: 0.75rem;
    line-height: 1.4;
    white-space: nowrap;
    z-index: 10000;
    pointer-events: none;
    animation: tooltipFadeIn 0.2s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  /* Hover-only tooltips: hide on small screens (no real hover) */
  @media (hover: none), (max-width: 768px) {
    .tooltip { display: none; }
  }

  :global([data-theme='light']) .tooltip {
    background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
    border: 1px solid #a7f3d0;
    color: #064e3b;
  }

  :global([data-theme='dark']) .tooltip {
    background: linear-gradient(135deg, #064e3b 0%, #065f46 100%);
    border: 1px solid #047857;
    color: #d1fae5;
  }

  @keyframes tooltipFadeIn {
    from {
      opacity: 0;
      transform: translateY(-50%) translateX(-5px);
    }
    to {
      opacity: 1;
      transform: translateY(-50%) translateX(0);
    }
  }

  /* ---------- Dropdown selectors (problem + optimizer share styles) ---------- */
  .problem-selector {
    position: relative;
  }

  .problem-button {
    width: 100%;
    height: 40px;
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

  .problem-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 0.25rem;
    background: var(--color-bg-secondary);
    border: 2px solid var(--color-border);
    border-radius: 9px;
    overflow-y: auto;
    max-height: min(64vh, 560px);
    box-shadow: 0 8px 24px var(--color-shadow);
    z-index: 30;
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

  .optimizer-option {
    padding: 0.45rem 0.7rem;
  }

  /* Segmented control (schedule picker): same family as the 2D/3D toggle */
  .seg-control {
    display: flex;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .seg-control button {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--color-text-tertiary);
    font-size: 0.6563rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    padding: 0.3rem 0;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .seg-control button:not(:last-child) {
    border-right: 1px solid var(--color-border);
  }

  .seg-control button:hover {
    color: #10b981;
  }

  .seg-control button.active {
    background: rgba(16, 185, 129, 0.16);
    color: #10b981;
  }

  .optimizer-text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .optimizer-name {
    font-weight: 600;
    font-size: 0.8438rem;
  }

  .optimizer-desc {
    font-size: 0.7188rem;
    color: var(--color-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
    margin: 2px 0;
  }

  #train-ratio {
    background: linear-gradient(to right,
      var(--color-primary) 0%,
      var(--color-primary) var(--train-percentage, 80%),
      var(--color-success) var(--train-percentage, 80%),
      var(--color-success) 100%);
  }

  #noise-level {
    background: linear-gradient(to right,
      var(--color-success) 0%,
      var(--color-warning) 50%,
      var(--color-danger) 100%);
  }

  /* Green-fill sliders — the active side fills green; --fill set inline. */
  .hyper-slider {
    background:
      linear-gradient(to right,
        rgba(16, 185, 129, 0.25) 0%,
        rgba(16, 185, 129, 1.0) var(--fill, 0%),
        rgba(127, 127, 127, 0.25) var(--fill, 0%),
        rgba(127, 127, 127, 0.25) 100%);
  }

  .section input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    border: 3px solid var(--color-primary);
    cursor: grab;
    transition: transform 0.15s;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .section input[type='range']::-webkit-slider-thumb:hover {
    transform: scale(1.12);
  }

  .section input[type='range']::-webkit-slider-thumb:active {
    cursor: grabbing;
  }

  .hyper-slider::-webkit-slider-thumb {
    border-color: #10b981;
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.2),
      0 0 calc(var(--fill, 0%) * 0.12) rgba(16, 185, 129, 0.7);
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
  .points-value,
  .steps-value,
  .lr-value,
  .momentum-value,
  .speed-value { color: #10b981; }

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

  .step-button {
    width: 38px;
    height: 38px;
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
    min-height: 38px;
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
    padding: 0.625rem 0.75rem;
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
    width: 38px;
    height: 38px;
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

  /* Race button: full-width secondary action under the transport row */
  .race-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    width: 100%;
    padding: 0.45rem;
    border: 1px dashed rgba(16, 185, 129, 0.5);
    border-radius: 8px;
    background: rgba(16, 185, 129, 0.06);
    color: #10b981;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .race-button:hover:not(:disabled) {
    background: rgba(16, 185, 129, 0.15);
    border-style: solid;
  }

  .race-button.racing {
    border-color: rgba(244, 63, 94, 0.6);
    background: rgba(244, 63, 94, 0.08);
    color: #f43f5e;
  }

  .race-button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
</style>
