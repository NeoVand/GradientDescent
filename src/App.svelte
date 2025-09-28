<script lang="ts">
  // Welcome to our Gradient Descent Learning App!
  // This is an interactive educational tool to understand how gradient descent works
  // through visual experiments with machine learning algorithms.
  
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import Sidebar from './components/Sidebar.svelte';
  import DataVisualization from './components/DataVisualization.svelte';
  import LossLandscape from './components/LossLandscape.svelte';
  import LossHistory from './components/LossHistory.svelte';
  import ParameterDisplay from './components/ParameterDisplay.svelte';
  import { datasetStore, parametersStore, historyStore, currentProblemConfig } from './stores/stores';
  
  // The main app orchestrates all our components and manages the overall layout.
  // We use CSS Grid for a responsive, flexible layout that adapts to different screen sizes.
  
  // Initialize data when app starts
  onMount(() => {
    datasetStore.initialize();
    
    // Add initial point to history
    const { data } = get(datasetStore);
    const parameters = get(parametersStore);
    const problemConfig = get(currentProblemConfig);
    
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
  });
</script>

<main>
  <div class="app-container">
    <!-- Left sidebar contains problem selection and training controls -->
    <aside class="sidebar">
      <Sidebar />
    </aside>
    
    <!-- Main content area with our visualizations -->
    <div class="main-content">
      <!-- Top row: Data visualization and Loss landscape -->
      <div class="top-row">
        <div class="data-viz-container">
          <DataVisualization />
        </div>
        <div class="loss-landscape-container">
          <LossLandscape />
        </div>
      </div>
      
      <!-- Bottom row: Loss history chart and parameter values -->
      <div class="bottom-row">
        <div class="loss-history-container">
          <LossHistory />
        </div>
        <div class="parameter-display-container">
          <ParameterDisplay />
        </div>
      </div>
    </div>
  </div>
</main>

<style>
  /* Reset and base styles */
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  
  :global(html), :global(body) {
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: #f5f5f5;
    color: #333;
  }
  
  main {
    height: 100vh;
    overflow: hidden;
  }
  
  /* Main app container using CSS Grid for layout */
  .app-container {
    display: grid;
    grid-template-columns: 300px 1fr;
    height: 100vh;
    gap: 1rem;
    padding: 1rem;
    background-color: #f5f5f5;
    box-sizing: border-box;
  }
  
  /* Sidebar styling */
  .sidebar {
    background-color: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 1.5rem;
    overflow-y: auto;
    min-height: 0;
  }
  
  /* Main content area */
  .main-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-height: 0;
  }
  
  /* Top row with data viz and loss landscape */
  .top-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    flex: 1;
    min-height: 0;
  }
  
  /* Bottom row with loss history and parameters */
  .bottom-row {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1rem;
    height: 200px;
    flex-shrink: 0;
  }
  
  /* Individual containers for components */
  .data-viz-container,
  .loss-landscape-container,
  .loss-history-container,
  .parameter-display-container {
    background-color: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 1.5rem;
    position: relative;
    overflow: hidden;
  }
  
  /* Responsive design for smaller screens */
  @media (max-width: 1200px) {
    .app-container {
      grid-template-columns: 250px 1fr;
    }
  }
  
  @media (max-width: 768px) {
    .app-container {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
    }
    
    .sidebar {
      position: sticky;
      top: 0;
      z-index: 10;
    }
    
    .top-row,
    .bottom-row {
      grid-template-columns: 1fr;
    }
  }
</style>