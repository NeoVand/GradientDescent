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
  import { datasetStore, parametersStore, historyStore, currentProblemConfig, themeStore } from './stores/stores';
  import { Sun, Moon } from 'lucide-svelte';
  
  // The main app orchestrates all our components and manages the overall layout.
  // We use CSS Grid for a responsive, flexible layout that adapts to different screen sizes.
  
  $: theme = $themeStore;
  
  // Initialize data when app starts
  onMount(() => {
    // Set initial theme on mount
    document.documentElement.setAttribute('data-theme', theme);
    
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
  
  function toggleTheme() {
    themeStore.toggle();
  }
</script>

<main>
  <!-- Theme toggle button - top right corner -->
  <button class="theme-toggle" on:click={() => themeStore.toggle()} title="Toggle theme">
    {#if theme === 'light'}
      <Moon size={22} strokeWidth={2.5} />
    {:else}
      <Sun size={22} strokeWidth={2.5} />
    {/if}
  </button>

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
  
  /* Theme toggle button - top right */
  .theme-toggle {
    position: fixed;
    top: 1.5rem;
    right: 1.5rem;
    width: 46px;
    height: 46px;
    border-radius: 50%;
    border: 2px solid var(--color-border);
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    z-index: 100;
    padding: 0;
  }
  
  .theme-toggle:hover {
    border-color: #10b981;
    transform: scale(1.08);
    color: #10b981;
  }
  
  /* Main app container using CSS Grid for layout */
  .app-container {
    display: grid;
    grid-template-columns: 300px 1fr;
    height: 100vh;
    gap: 1.5rem;
    padding: 1.5rem;
    background-color: var(--color-bg-primary);
    box-sizing: border-box;
  }
  
  /* Sidebar styling */
  .sidebar {
    background-color: var(--color-bg-secondary);
    border-radius: 16px;
    box-shadow: none;
    padding: 1.25rem;
    overflow: hidden;
    min-height: 0;
  }
  
  /* Main content area */
  .main-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-height: 0;
  }
  
  /* Top row with data viz and loss landscape */
  .top-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    flex: 1;
    min-height: 0;
  }
  
  /* Bottom row with loss history and parameters */
  .bottom-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    height: 260px;
    flex-shrink: 0;
  }
  
  /* Individual containers for components */
  .data-viz-container,
  .loss-landscape-container,
  .loss-history-container,
  .parameter-display-container {
    background-color: transparent;
    border-radius: 0;
    box-shadow: none;
    padding: 0.75rem 1rem 1.25rem 1rem;
    position: relative;
    overflow: hidden;
    min-height: 0;
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