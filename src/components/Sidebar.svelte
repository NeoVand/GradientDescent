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
    BarChart3, 
    Zap, 
    RefreshCw,
    Play,
    Pause,
    RotateCcw,
    Activity,
    Sparkles,
    TrendingDown
  } from 'lucide-svelte';
  
  // Component state
  let isTraining = false;
  let trainingInterval: number | null = null;
  
  // Problem selection state
  let showProblemDropdown = false;
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
  $: if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--train-percentage', `${trainRatio * 100}%`);
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
</script>

<div class="sidebar-content">
  <h1>
    <TrendingDown size={22} strokeWidth={2.5} />
    <span>Gradient Descent</span>
  </h1>
  
  <!-- Problem Selection -->
  <div class="control-group">
    <div class="control-header">
      <span class="icon"><BarChart3 size={18} strokeWidth={2} /></span>
      <span class="control-label">Problem</span>
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
    </div>
    <div class="control-input">
      <button on:click={() => {
        datasetStore.setNumPoints(Math.max(10, numPoints - 5));
        datasetStore.regenerateData();
      }}>
        −
      </button>
      <input
        id="num-points"
        type="number"
        min="10"
        max="100"
        step="5"
        value={numPoints}
        on:change={handleNumPointsChange}
      />
      <button on:click={() => {
        datasetStore.setNumPoints(Math.min(100, numPoints + 5));
        datasetStore.regenerateData();
      }}>
        +
      </button>
    </div>
  </div>
  
  <!-- Train/Test Ratio -->
  <div class="control-group">
    <div class="control-header">
      <span class="icon"><BarChart3 size={18} strokeWidth={2} /></span>
      <label for="train-ratio">Train/Test Split</label>
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
      <span class="icon"><Sparkles size={18} strokeWidth={2} /></span>
      <label for="noise-level">Noise Level</label>
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
      <label for="learning-rate">Learning Rate</label>
    </div>
    <div class="control-input">
      <button on:click={() => {
        trainingStore.update(store => ({ ...store, learningRate: learningRate / 10 }));
      }}>
        −
      </button>
      <input
        id="learning-rate"
        type="text"
        value={formatLearningRate(learningRate)}
        readonly
      />
      <button on:click={() => {
        trainingStore.update(store => ({ ...store, learningRate: Math.min(1, learningRate * 10) }));
      }}>
        +
      </button>
    </div>
  </div>
  
  <!-- Training Steps -->
  <div class="control-group">
    <div class="control-header">
      <span class="icon"><RefreshCw size={18} strokeWidth={2} /></span>
      <label for="training-steps">Training Steps</label>
    </div>
    <div class="control-input">
      <button on:click={() => {
        trainingStore.update(store => ({ ...store, totalSteps: Math.max(10, totalSteps - 10) }));
      }}>
        −
      </button>
      <input
        id="training-steps"
        type="number"
        min="10"
        max="1000"
        step="10"
        value={totalSteps}
        on:change={handleTotalStepsChange}
      />
      <button on:click={() => {
        trainingStore.update(store => ({ ...store, totalSteps: Math.min(1000, totalSteps + 10) }));
      }}>
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
    gap: 0.5rem;
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
  }
  
  .control-header label,
  .control-header .control-label {
    font-weight: 600;
    color: var(--color-text-secondary);
    font-size: 0.8125rem;
  }
  
  /* Problem Selector */
  .problem-selector {
    position: relative;
  }
  
  .problem-button {
    width: 100%;
    padding: 0.625rem;
    border: 2px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.875rem;
  }
  
  .problem-button:hover {
    border-color: #667eea;
  }
  
  .problem-button:focus {
    outline: none;
    border-color: #667eea;
  }
  
  .problem-selector.open .problem-button {
    border-color: #667eea;
  }
  
  .problem-preview {
    display: flex;
    align-items: center;
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
    padding: 0.625rem;
    border: none;
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: 0.625rem;
    cursor: pointer;
    transition: background 0.2s;
    text-align: left;
    font-size: 0.875rem;
  }
  
  .problem-option:hover {
    background: rgba(102, 126, 234, 0.12);
    outline: none;
  }
  
  .problem-option:focus {
    outline: none;
  }
  
  .problem-option.selected {
    background: rgba(102, 126, 234, 0.15);
    color: var(--color-text-primary);
    border-left: 3px solid #667eea;
    padding-left: calc(0.75rem - 3px);
  }
  
  .problem-option.selected:hover {
    background: rgba(102, 126, 234, 0.2);
  }
  
  /* Control Inputs */
  .control-input {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .control-input button {
    width: 28px;
    height: 28px;
    border: 2px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.875rem;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  
  .control-input button:hover {
    border-color: #667eea;
    color: #667eea;
  }
  
  .control-input input {
    flex: 1;
    padding: 0.25rem 0.5rem;
    border: 2px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    text-align: center;
    font-weight: 500;
    font-size: 0.875rem;
    min-width: 0;
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
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    position: relative;
    overflow: hidden;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
    color: white;
    padding: 0.625rem 0.75rem;
  }
  
  .train-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
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
