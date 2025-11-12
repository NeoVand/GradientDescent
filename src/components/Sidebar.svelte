<script lang="ts">
  /**
   * Sidebar Component
   * 
   * This component contains all the controls for the gradient descent app:
   * - Problem selection with visual previews
   * - Dataset configuration (size and train/test split)
   * - Training hyperparameters (learning rate and steps)
   * - Action buttons (Train and Reset)
   */
  
  import { selectedProblem, datasetStore, trainingStore, parametersStore, historyStore } from '../stores/stores';
  import type { ProblemType } from '../types/types';
  import { problemConfigs } from '../utils/problems';
  import { gradientDescentStep } from '../utils/gradientDescent';
  import { 
    TrendingUp, 
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
    Brain,
    Info
  } from 'lucide-svelte';
  
  // Component state
  let isTraining = false;
  let trainingInterval: number | null = null;
  
  // Problem selection state
  let showProblemDropdown = false;
  
  // Edit state for number steppers
  let editingNumPoints = false;
  let editingTrainingSteps = false;
  let editingLearningRate = false;
  let draftNumPoints = '';
  let draftTrainingSteps = '';
  let draftLearningRate = '';
  
  // Tooltip state
  let activeTooltip: string | null = null;
  const problems: { type: ProblemType; name: string; icon: any; customIcon?: string }[] = [
    { type: 'linear-regression', name: 'Linear Regression', icon: TrendingUp },
    { type: 'logistic-regression', name: 'Logistic Regression', icon: Percent },
    { type: 'polynomial-regression', name: 'Polynomial Regression', icon: null, customIcon: 'x²' }
  ];
  
  // Subscribe to stores
  $: currentProblem = $selectedProblem;
  $: numPoints = $datasetStore.numPoints;
  $: trainRatio = $datasetStore.trainRatio;
  $: randomSplit = $datasetStore.randomSplit;
  $: noiseLevel = $datasetStore.noiseLevel;
  $: learningRate = $trainingStore.learningRate;
  $: totalSteps = $trainingStore.totalSteps;
  $: currentStep = $trainingStore.currentStep;
  
  // Calculate training progress
  $: trainingProgress = isTraining && $historyStore.length > 0 
    ? ((currentStep - startingStepForProgress) / totalSteps) * 100 
    : 0;
  
  let startingStepForProgress = 0;
  
  // Update CSS variable for slider gradient
  // Properly map slider value (0.1-0.9) to track position (0%-100%)
  $: if (typeof document !== 'undefined') {
    const minValue = 0.1;
    const maxValue = 0.9;
    const normalizedPosition = ((trainRatio - minValue) / (maxValue - minValue)) * 100;
    document.documentElement.style.setProperty('--train-percentage', `${normalizedPosition}%`);
  }
  
  // Handle problem selection
  function selectProblem(type: ProblemType) {
    selectedProblem.set(type);
    showProblemDropdown = false;
    resetTraining();
    // Regenerate data for the new problem
    datasetStore.regenerateData();
  }
  
  // Handle dataset size change
  function handleNumPointsChange(e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value);
    datasetStore.setNumPoints(value);
    datasetStore.regenerateData();
  }
  
  // Handle train/test ratio change
  function handleTrainRatioChange(e: Event) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    datasetStore.setTrainRatio(value);
    datasetStore.regenerateData();
  }
  
  // Handle learning rate change
  function handleLearningRateChange(e: Event) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    trainingStore.update(store => ({ ...store, learningRate: value }));
  }
  
  // Handle total steps change
  function handleTotalStepsChange(e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value);
    trainingStore.update(store => ({ ...store, totalSteps: value }));
  }
  
  // Training logic
  async function startTraining() {
    if (isTraining) return;
    
    isTraining = true;
    trainingStore.update(store => ({ ...store, isTraining: true }));
    
    // Always train for the specified number of steps
    const stepsToTrain = $trainingStore.totalSteps;
    let stepsCompleted = 0;
    
    // Get the starting step from history to continue from
    const currentHistory = $historyStore;
    const startingStep = currentHistory.length > 0 ? currentHistory[currentHistory.length - 1].step : 0;
    startingStepForProgress = startingStep;
    
    // Training loop with animation
    trainingInterval = window.setInterval(() => {
      // Stop when we've completed the requested number of steps
      if (stepsCompleted >= stepsToTrain) {
        stopTraining();
        return;
      }
      
      // Perform one gradient descent step
      const trainData = $datasetStore.data.filter(point => point.isTraining);
      const testData = $datasetStore.data.filter(point => !point.isTraining);
      const config = problemConfigs[$selectedProblem];
      
      // Get current parameters
      const currentParams = $parametersStore;
      
      // Perform gradient descent
      const newParams = gradientDescentStep(
        trainData,
        currentParams,
        $trainingStore.learningRate,
        config
      );
      
      // Update parameters
      parametersStore.set(newParams);
      
      // Calculate next step number (continue from where we left off)
      const nextStepNumber = startingStep + stepsCompleted + 1;
      
      // Update current step in store for display
      trainingStore.update(store => ({
        ...store,
        currentStep: nextStepNumber
      }));
      
      // Record history with the continuing step count
      historyStore.addPoint({
        step: nextStepNumber,
        trainLoss: config.computeLoss(trainData, newParams),
        testLoss: config.computeLoss(testData, newParams),
        parameters: newParams
      });
      
      stepsCompleted++;
    }, 50); // 50ms per step for smooth animation
  }
  
  function stopTraining() {
    if (trainingInterval !== null) {
      clearInterval(trainingInterval);
      trainingInterval = null;
    }
    isTraining = false;
    trainingStore.update(store => ({ ...store, isTraining: false }));
  }
  
  function resetTraining() {
    stopTraining();
    parametersStore.reset();
    historyStore.reset();
    trainingStore.update(store => ({
      ...store,
      currentStep: 0,
      isTraining: false
    }));
    
    // Re-add initial point to history
    const { data } = $datasetStore;
    const parameters = $parametersStore;
    const problemConfig = problemConfigs[$selectedProblem];
    
    if (data.length > 0) {
      const trainData = data.filter(d => d.isTraining);
      const testData = data.filter(d => !d.isTraining);
      
      historyStore.addPoint({
        step: 0,
        trainLoss: problemConfig.computeLoss(trainData, parameters),
        testLoss: problemConfig.computeLoss(testData, parameters),
        parameters
      });
    }
  }
  
  // Format learning rate for display
  function formatLearningRate(rate: number): string {
    if (rate >= 0.01) return rate.toFixed(3);
    return rate.toExponential(1);
  }
  
  // Focus action for inputs
  function focusOnMount(node: HTMLElement) {
    node.focus();
    return {};
  }
</script>

<div class="sidebar-content">
  <h1>
    <span class="app-icon">∂</span>
    <span>Gradient Descent</span>
  </h1>
  
  <!-- Problem Selection -->
  <div class="control-group">
    <div class="control-header">
      <span class="icon"><Brain size={18} strokeWidth={2} /></span>
      <span class="control-label">Problem</span>
      <div class="tooltip-container">
        <button 
          class="info-btn" 
          on:mouseenter={() => activeTooltip = 'problem'}
          on:mouseleave={() => activeTooltip = null}
        >
          <Info size={14} strokeWidth={2} />
        </button>
        {#if activeTooltip === 'problem'}
          <div class="tooltip">
            Select the machine learning problem type to explore
          </div>
        {/if}
      </div>
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
            <svelte:component this={problems.find(p => p.type === currentProblem)?.icon} size={20} strokeWidth={2} />
          {/if}
        </span>
        <span class="problem-name">
          {problems.find(p => p.type === currentProblem)?.name}
        </span>
        <span class="dropdown-arrow">▼</span>
      </button>
      
      {#if showProblemDropdown}
        <div class="problem-dropdown">
          {#each problems as problem}
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
        </div>
      {/if}
    </div>
  </div>
  
  <!-- Data Points -->
  <div class="control-group">
    <div class="control-header">
      <span class="icon"><MapPin size={18} strokeWidth={2} /></span>
      <label for="num-points">Data Points</label>
      <div class="tooltip-container">
        <button 
          class="info-btn"
          on:mouseenter={() => activeTooltip = 'dataPoints'}
          on:mouseleave={() => activeTooltip = null}
        >
          <Info size={14} strokeWidth={2} />
        </button>
        {#if activeTooltip === 'dataPoints'}
          <div class="tooltip">
            Number of synthetic data points to generate
          </div>
        {/if}
      </div>
    </div>
    <div class="number-stepper">
      <button 
        class="stepper-btn"
        disabled={numPoints <= 10}
        on:click={() => {
          datasetStore.setNumPoints(Math.max(10, numPoints - 5));
          if (numPointsDebounce) clearTimeout(numPointsDebounce);
          numPointsDebounce = window.setTimeout(() => {
            requestAnimationFrame(() => {
              datasetStore.regenerateData();
            });
          }, 200);
        }}
      >
        −
      </button>
      {#if editingNumPoints}
        <input
          class="stepper-input"
          type="text"
          value={draftNumPoints}
          on:input={(e) => draftNumPoints = e.target.value.replace(/[^0-9]/g, '')}
          on:blur={() => {
            const parsed = parseInt(draftNumPoints, 10);
            if (!isNaN(parsed)) {
              const clamped = Math.max(10, Math.min(100, parsed));
              datasetStore.setNumPoints(clamped);
              if (numPointsDebounce) clearTimeout(numPointsDebounce);
              numPointsDebounce = window.setTimeout(() => {
                requestAnimationFrame(() => {
                  datasetStore.regenerateData();
                });
              }, 200);
            }
            editingNumPoints = false;
          }}
          on:keydown={(e) => {
            if (e.key === 'Enter') e.target.blur();
            if (e.key === 'Escape') {
              editingNumPoints = false;
              draftNumPoints = String(numPoints);
            }
          }}
          use:focusOnMount
        />
      {:else}
        <button
          class="stepper-value"
          on:click={() => {
            editingNumPoints = true;
            draftNumPoints = String(numPoints);
          }}
        >
          {numPoints}
        </button>
      {/if}
      <button 
        class="stepper-btn"
        disabled={numPoints >= 100}
        on:click={() => {
          datasetStore.setNumPoints(Math.min(100, numPoints + 5));
          if (numPointsDebounce) clearTimeout(numPointsDebounce);
          numPointsDebounce = window.setTimeout(() => {
            requestAnimationFrame(() => {
              datasetStore.regenerateData();
            });
          }, 200);
        }}
      >
        +
      </button>
    </div>
  </div>
  
  <!-- Train/Test Ratio -->
  <div class="control-group">
    <div class="control-header">
      <span class="icon"><PieChart size={18} strokeWidth={2} /></span>
      <label for="train-ratio">Train/Test Split</label>
      <div class="tooltip-container">
        <button 
          class="info-btn"
          on:mouseenter={() => activeTooltip = 'trainTest'}
          on:mouseleave={() => activeTooltip = null}
        >
          <Info size={14} strokeWidth={2} />
        </button>
        {#if activeTooltip === 'trainTest'}
          <div class="tooltip">
            Ratio of data used for training vs. testing the model
          </div>
        {/if}
      </div>
    </div>
    <div class="slider-container">
      <div class="slider-value-display">
        <span class="split-value train">{Math.round(trainRatio * 100)}%</span>
        <span class="split-separator">/</span>
        <span class="split-value test">{Math.round((1 - trainRatio) * 100)}%</span>
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
      <div class="slider-labels">
        <span>Train</span>
        <span>Test</span>
      </div>
    </div>
    <div class="checkbox-container">
      <label class="checkbox-label">
        <input 
          type="checkbox" 
          checked={randomSplit}
          on:change={(e) => {
            datasetStore.setRandomSplit(e.target.checked);
            datasetStore.regenerateData();
          }}
        />
        <span class="checkbox-text">Randomized</span>
      </label>
    </div>
  </div>
  
  <!-- Noise Level -->
  <div class="control-group">
    <div class="control-header">
      <span class="icon"><Droplets size={18} strokeWidth={2} /></span>
      <label for="noise-level">Noise Level</label>
      <div class="tooltip-container">
        <button 
          class="info-btn"
          on:mouseenter={() => activeTooltip = 'noise'}
          on:mouseleave={() => activeTooltip = null}
        >
          <Info size={14} strokeWidth={2} />
        </button>
        {#if activeTooltip === 'noise'}
          <div class="tooltip">
            Amount of random noise added to synthetic data<br/>
            <span style="opacity: 0.8; font-size: 0.7rem;">0 = clean, 2 = very noisy</span>
          </div>
        {/if}
      </div>
    </div>
    <div class="slider-container">
      <div class="slider-value-display">
        <span class="noise-value">{noiseLevel.toFixed(2)}</span>
      </div>
      <input
        id="noise-level"
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={noiseLevel}
        on:input={(e) => {
          const value = parseFloat((e.target as HTMLInputElement).value);
          datasetStore.setNoiseLevel(value);
          datasetStore.regenerateData();
        }}
      />
      <div class="slider-labels">
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  </div>
  
  <!-- Learning Rate -->
  <div class="control-group">
    <div class="control-header">
      <span class="icon"><Zap size={18} strokeWidth={2} /></span>
      <label for="learning-rate">Learning Rate <span class="greek-label">(γ)</span></label>
      <div class="tooltip-container">
        <button 
          class="info-btn"
          on:mouseenter={() => activeTooltip = 'learningRate'}
          on:mouseleave={() => activeTooltip = null}
        >
          <Info size={14} strokeWidth={2} />
        </button>
        {#if activeTooltip === 'learningRate'}
          <div class="tooltip">
            Step size for gradient descent updates<br/>
            <span style="opacity: 0.8; font-size: 0.7rem;">Higher = faster but less stable</span>
          </div>
        {/if}
      </div>
    </div>
    <div class="number-stepper">
      <button 
        class="stepper-btn"
        disabled={learningRate <= 0.0001}
        on:click={() => {
          trainingStore.update(store => ({ ...store, learningRate: Math.max(0.0001, learningRate / 10) }));
        }}
      >
        −
      </button>
      {#if editingLearningRate}
        <input
          class="stepper-input"
          type="text"
          value={draftLearningRate}
          on:input={(e) => draftLearningRate = e.target.value.replace(/[^0-9.eE\-]/g, '')}
          on:blur={() => {
            const parsed = parseFloat(draftLearningRate);
            if (!isNaN(parsed)) {
              const clamped = Math.max(0.0001, Math.min(1, parsed));
              trainingStore.update(store => ({ ...store, learningRate: clamped }));
            }
            editingLearningRate = false;
          }}
          on:keydown={(e) => {
            if (e.key === 'Enter') e.target.blur();
            if (e.key === 'Escape') {
              editingLearningRate = false;
              draftLearningRate = formatLearningRate(learningRate);
            }
          }}
          use:focusOnMount
        />
      {:else}
        <button
          class="stepper-value"
          on:click={() => {
            editingLearningRate = true;
            draftLearningRate = formatLearningRate(learningRate);
          }}
        >
          {formatLearningRate(learningRate)}
        </button>
      {/if}
      <button 
        class="stepper-btn"
        disabled={learningRate >= 1}
        on:click={() => {
          trainingStore.update(store => ({ ...store, learningRate: Math.min(1, learningRate * 10) }));
        }}
      >
        +
      </button>
    </div>
  </div>
  
  <!-- Training Steps -->
  <div class="control-group">
    <div class="control-header">
      <span class="icon"><RefreshCw size={18} strokeWidth={2} /></span>
      <label for="training-steps">Training Steps</label>
      <div class="tooltip-container">
        <button 
          class="info-btn"
          on:mouseenter={() => activeTooltip = 'steps'}
          on:mouseleave={() => activeTooltip = null}
        >
          <Info size={14} strokeWidth={2} />
        </button>
        {#if activeTooltip === 'steps'}
          <div class="tooltip">
            Number of gradient descent iterations to perform when training
          </div>
        {/if}
      </div>
    </div>
    <div class="number-stepper">
      <button 
        class="stepper-btn"
        disabled={totalSteps <= 10}
        on:click={() => {
          trainingStore.update(store => ({ ...store, totalSteps: Math.max(10, totalSteps - 10) }));
        }}
      >
        −
      </button>
      {#if editingTrainingSteps}
        <input
          class="stepper-input"
          type="text"
          value={draftTrainingSteps}
          on:input={(e) => draftTrainingSteps = e.target.value.replace(/[^0-9]/g, '')}
          on:blur={() => {
            const parsed = parseInt(draftTrainingSteps, 10);
            if (!isNaN(parsed)) {
              const clamped = Math.max(10, Math.min(1000, parsed));
              trainingStore.update(store => ({ ...store, totalSteps: clamped }));
            }
            editingTrainingSteps = false;
          }}
          on:keydown={(e) => {
            if (e.key === 'Enter') e.target.blur();
            if (e.key === 'Escape') {
              editingTrainingSteps = false;
              draftTrainingSteps = String(totalSteps);
            }
          }}
          use:focusOnMount
        />
      {:else}
        <button
          class="stepper-value"
          on:click={() => {
            editingTrainingSteps = true;
            draftTrainingSteps = String(totalSteps);
          }}
        >
          {totalSteps}
        </button>
      {/if}
      <button 
        class="stepper-btn"
        disabled={totalSteps >= 1000}
        on:click={() => {
          trainingStore.update(store => ({ ...store, totalSteps: Math.min(1000, totalSteps + 10) }));
        }}
      >
        +
      </button>
    </div>
  </div>
  
  <!-- Spacer to push buttons to bottom -->
  <div class="spacer"></div>
  
  <!-- Action Buttons - pinned to bottom -->
  <div class="action-buttons">
    <button 
      class="train-button" 
      class:training={isTraining}
      on:click={isTraining ? stopTraining : startTraining}
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
    <button class="reset-button" on:click={resetTraining} title="Reset">
      <RotateCcw size={18} strokeWidth={2} />
    </button>
  </div>
</div>

<style>
  .sidebar-content {
    display: flex;
    flex-direction: column;
    gap: 1.125rem;
    height: 100%;
    overflow: hidden;
  }
  
  .spacer {
    flex: 1;
    min-height: 1rem;
  }
  
  h1 {
    font-size: 1.125rem;
    font-weight: 700;
    margin: 0 0 0.75rem 0;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: 0.625rem;
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
  
  .control-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  
  .control-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .control-header .icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .control-header label,
  .control-header .control-label {
    font-weight: 600;
    color: var(--color-text-secondary);
    font-size: 0.8125rem;
    flex: 1;
    line-height: 1.2;
    display: flex;
    align-items: center;
  }
  
  .info-btn {
    width: 16px;
    height: 16px;
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
    opacity: 0.35;
    margin-left: auto;
  }
  
  .info-btn:hover {
    opacity: 1;
    color: #10b981;
    transform: scale(1.15);
  }
  
  .greek-label {
    font-family: 'Georgia', serif;
    font-style: italic;
    font-weight: 400;
    opacity: 0.7;
  }
  
  .tooltip-container {
    position: relative;
    display: flex;
    align-items: center;
  }
  
  .tooltip {
    position: fixed;
    left: 330px;
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
  
  /* Light mode tooltip */
  :global([data-theme='light']) .tooltip {
    background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
    border: 1px solid #a7f3d0;
    color: #064e3b;
  }
  
  /* Dark mode tooltip */
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
  
  /* Problem Selector */
  .problem-selector {
    position: relative;
  }
  
  .problem-button {
    width: 100%;
    padding: 0.625rem 0.75rem;
    border: 2px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.625rem;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.875rem;
    outline: none;
  }
  
  .problem-button:hover {
    border-color: #10b981;
  }
  
  .problem-button:focus {
    outline: none;
    border-color: #10b981;
  }
  
  .problem-selector.open .problem-button {
    border-color: #10b981;
  }
  
  .problem-preview {
    display: flex;
    align-items: center;
    color: #10b981;
  }
  
  .problem-name {
    flex: 1;
    text-align: left;
    font-weight: 500;
    font-size: 0.875rem;
  }
  
  .dropdown-arrow {
    transition: transform 0.2s;
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
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 12px var(--color-shadow);
    z-index: 10;
  }
  
  .problem-option {
    width: 100%;
    padding: 0.625rem 0.75rem;
    border: none;
    border-radius: 0;
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.625rem;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    font-size: 0.875rem;
    outline: none;
  }
  
  .problem-option .problem-icon {
    color: var(--color-text-tertiary);
    transition: color 0.2s;
  }
  
  .problem-option:hover {
    background: rgba(16, 185, 129, 0.1);
    outline: none;
  }
  
  .problem-option:focus {
    outline: none;
  }
  
  .problem-option.selected {
    background: rgba(16, 185, 129, 0.15);
    color: var(--color-text-primary);
  }
  
  .problem-option.selected .problem-icon {
    color: #10b981;
  }
  
  .problem-option.selected:hover {
    background: rgba(16, 185, 129, 0.2);
  }
  
  /* Number Stepper */
  .number-stepper {
    display: grid;
    grid-template-columns: 32px 1fr 32px;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem;
    border-radius: 8px;
    background: rgba(16, 185, 129, 0.06);
  }
  
  .stepper-btn {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    background: rgba(16, 185, 129, 0.12);
    color: #10b981;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 1rem;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  
  .stepper-btn:hover:not(:disabled) {
    background: rgba(16, 185, 129, 0.2);
    transform: scale(1.05);
  }
  
  .stepper-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  
  .stepper-value {
    min-width: 60px;
    padding: 0.375rem;
    border: none;
    background: transparent;
    color: var(--color-text-primary);
    text-align: center;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: text;
    border-radius: 4px;
    transition: background 0.2s;
  }
  
  .stepper-value:hover {
    background: rgba(16, 185, 129, 0.08);
  }
  
  .stepper-input {
    min-width: 60px;
    padding: 0.375rem;
    border: 2px solid #10b981;
    border-radius: 4px;
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    text-align: center;
    font-weight: 600;
    font-size: 0.875rem;
    outline: none;
  }
  
  .stepper-input::-webkit-inner-spin-button,
  .stepper-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  
  /* Slider */
  .slider-container {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  
  .slider-value-display {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    font-weight: 600;
    font-size: 0.875rem;
  }
  
  .split-value {
    font-family: 'SF Mono', Monaco, monospace;
  }
  
  .split-value.train {
    color: var(--color-primary);
  }
  
  .split-value.test {
    color: var(--color-success);
  }
  
  .split-separator {
    color: var(--color-text-tertiary);
    font-weight: 400;
  }
  
  .slider-container input[type="range"] {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
  }
  
  /* Train/test split slider with gradient */
  #train-ratio {
    background: linear-gradient(to right, 
      var(--color-primary) 0%, 
      var(--color-primary) var(--train-percentage, 80%), 
      var(--color-success) var(--train-percentage, 80%), 
      var(--color-success) 100%);
  }
  
  /* Noise level slider with warning color */
  #noise-level {
    background: linear-gradient(to right, 
      var(--color-success) 0%, 
      var(--color-warning) 50%, 
      var(--color-danger) 100%);
  }
  
  .slider-container input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    border: 3px solid var(--color-primary);
    cursor: grab;
    transition: all 0.2s;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  
  .slider-container input[type="range"]::-webkit-slider-thumb:hover {
    transform: scale(1.15);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
  
  .slider-container input[type="range"]::-webkit-slider-thumb:active {
    cursor: grabbing;
    transform: scale(1.1);
  }
  
  .slider-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.6875rem;
    color: var(--color-text-tertiary);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  /* Checkbox */
  .checkbox-container {
    margin-top: 0.25rem;
  }
  
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    user-select: none;
  }
  
  .checkbox-label input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: var(--color-primary);
  }
  
  .checkbox-text {
    font-weight: 500;
  }
  
  /* Action Buttons */
  .action-buttons {
    display: flex;
    gap: 0.5rem;
    margin-top: 0;
    align-items: stretch;
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
  
  /* Light mode train button */
  :global([data-theme='light']) .train-button {
    background: linear-gradient(135deg, #a7f3d0 0%, #6ee7b7 100%);
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
  }
  
  /* Dark mode train button */
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
  
  /* Light mode button text */
  :global([data-theme='light']) .button-content {
    color: #000000;
  }
  
  /* Dark mode button text */
  :global([data-theme='dark']) .button-content {
    color: #d1fae5;
  }
  
  /* Training state always uses white text */
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
  
  .noise-value {
    font-family: 'SF Mono', Monaco, monospace;
    color: var(--color-warning);
    font-weight: 600;
  }
  
  .custom-icon {
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 1.125rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
