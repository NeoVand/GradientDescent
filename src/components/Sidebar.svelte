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
  
  // Component state
  let isTraining = false;
  let trainingInterval: number | null = null;
  
  // Problem selection state
  let showProblemDropdown = false;
  const problems: { type: ProblemType; name: string; icon: string }[] = [
    { type: 'linear-regression', name: 'Linear Regression', icon: '📈' },
    { type: 'logistic-regression', name: 'Logistic Regression', icon: '🔵🔴' },
    { type: 'polynomial-regression', name: 'Polynomial Regression', icon: '📉' }
  ];
  
  // Subscribe to stores
  $: currentProblem = $selectedProblem;
  $: numPoints = $datasetStore.numPoints;
  $: trainRatio = $datasetStore.trainRatio;
  $: learningRate = $trainingStore.learningRate;
  $: totalSteps = $trainingStore.totalSteps;
  $: currentStep = $trainingStore.currentStep;
  
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
    
    // Training loop with animation
    trainingInterval = window.setInterval(() => {
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
      
      // Update step counter
      trainingStore.update(store => ({
        ...store,
        currentStep: store.currentStep + 1
      }));
      
      // Record history with the updated step count
      historyStore.addPoint({
        step: $trainingStore.currentStep,
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
  }
  
  // Format learning rate for display
  function formatLearningRate(rate: number): string {
    if (rate >= 0.01) return rate.toFixed(3);
    return rate.toExponential(1);
  }
</script>

<div class="sidebar-content">
  <h1>Gradient Descent</h1>
  
  <!-- Problem Selection -->
  <div class="control-group">
    <div class="control-header">
      <span class="icon">📊</span>
      <span class="control-label">Problem</span>
    </div>
    <div class="problem-selector" class:open={showProblemDropdown}>
      <button 
        class="problem-button"
        on:click={() => showProblemDropdown = !showProblemDropdown}
      >
        <span class="problem-preview">
          {problems.find(p => p.type === currentProblem)?.icon}
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
              <span class="problem-icon">{problem.icon}</span>
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
      <span class="icon">📍</span>
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
      <span class="icon">📊</span>
      <label for="train-ratio">Train/Test Ratio</label>
    </div>
    <div class="slider-container">
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
        <span>{Math.round(trainRatio * 100)}% train</span>
        <span>{Math.round((1 - trainRatio) * 100)}% test</span>
      </div>
    </div>
  </div>
  
  <!-- Learning Rate -->
  <div class="control-group">
    <div class="control-header">
      <span class="icon">📈</span>
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
      <span class="icon">🔄</span>
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
  
  <!-- Action Buttons -->
  <div class="action-buttons">
    <button 
      class="train-button" 
      on:click={startTraining}
      disabled={isTraining}
    >
      {isTraining ? 'Training...' : 'Train'}
    </button>
    <button class="reset-button" on:click={resetTraining}>
      Reset
    </button>
  </div>
  
  <!-- Current Step Display -->
  <div class="control-group">
    <div class="control-header">
      <span class="icon">👣</span>
      <span class="control-label">Current Step</span>
    </div>
    <div class="step-display">
      <span class="current-step">{currentStep}</span>
      <span class="step-separator">/</span>
      <span class="total-steps">{totalSteps}</span>
    </div>
  </div>
</div>

<style>
  .sidebar-content {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
  }
  
  h1 {
    font-size: 1.375rem;
    font-weight: 700;
    margin: 0;
    color: #1a1a1a;
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
    font-size: 1.1rem;
    flex-shrink: 0;
  }
  
  .control-header label,
  .control-header .control-label {
    font-weight: 600;
    color: #4a4a4a;
    font-size: 0.9rem;
  }
  
  /* Problem Selector */
  .problem-selector {
    position: relative;
  }
  
  .problem-button {
    width: 100%;
    padding: 0.75rem;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    background: white;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .problem-button:hover {
    border-color: #3b82f6;
  }
  
  .problem-selector.open .problem-button {
    border-color: #3b82f6;
  }
  
  .problem-preview {
    font-size: 1.5rem;
  }
  
  .problem-name {
    flex: 1;
    text-align: left;
    font-weight: 500;
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
    background: white;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    z-index: 10;
  }
  
  .problem-option {
    width: 100%;
    padding: 0.75rem;
    border: none;
    background: white;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    transition: background 0.2s;
    text-align: left;
  }
  
  .problem-option:hover {
    background: #f5f5f5;
  }
  
  .problem-option.selected {
    background: #e3f2fd;
    color: #1976d2;
  }
  
  .problem-icon {
    font-size: 1.25rem;
  }
  
  /* Control Inputs */
  .control-input {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .control-input button {
    width: 30px;
    height: 30px;
    border: 2px solid #e0e0e0;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  
  .control-input button:hover {
    border-color: #3b82f6;
    color: #3b82f6;
  }
  
  .control-input input {
    flex: 1;
    padding: 0.375rem 0.5rem;
    border: 2px solid #e0e0e0;
    border-radius: 6px;
    text-align: center;
    font-weight: 500;
    min-width: 0;
  }
  
  /* Slider */
  .slider-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .slider-container input[type="range"] {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    background: #e0e0e0;
  }
  
  .slider-container input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
  }
  
  .slider-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: #666;
  }
  
  /* Action Buttons */
  .action-buttons {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }
  
  .train-button,
  .reset-button {
    flex: 1;
    padding: 0.75rem;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .train-button {
    background: #3b82f6;
    color: white;
  }
  
  .train-button:hover:not(:disabled) {
    background: #2563eb;
  }
  
  .train-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .reset-button {
    background: #f3f4f6;
    color: #4b5563;
  }
  
  .reset-button:hover {
    background: #e5e7eb;
  }
  
  /* Step Display */
  .step-display {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    font-size: 1.25rem;
    font-weight: 600;
  }
  
  .current-step {
    color: #3b82f6;
  }
  
  .step-separator {
    color: #9ca3af;
  }
  
  .total-steps {
    color: #6b7280;
  }
</style>
