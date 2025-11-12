<script lang="ts">
  /**
   * Parameter Display Component
   * 
   * This component shows the current values of the model parameters and losses.
   * It provides a clear, numerical view of the optimization state, complementing
   * the visual representations in other components.
   */
  
  import { parametersStore, currentLosses, historyStore } from '../stores/stores';
  import { Info } from 'lucide-svelte';
  
  // Reactive values
  $: parameters = $parametersStore;
  $: losses = $currentLosses;
  $: history = $historyStore;
  
  // Calculate the change from the previous step
  $: previousParams = history.length > 1 ? history[history.length - 2].parameters : null;
  $: paramChanges = previousParams ? {
    a: parameters.a - previousParams.a,
    b: parameters.b - previousParams.b
  } : null;
  
  // Format numbers for display
  function formatNumber(value: number, precision: number = 4): string {
    if (Math.abs(value) < 0.0001) {
      return value.toExponential(2);
    }
    return value.toFixed(precision);
  }
  
  function formatChange(value: number): string {
    const formatted = formatNumber(value);
    return value >= 0 ? `+${formatted}` : formatted;
  }
</script>

<div class="parameter-display">
  <h3>
    <Info size={18} strokeWidth={2} />
    <span>Values</span>
  </h3>
  
  <div class="values-table">
    <!-- Header Row -->
    <div class="table-header">
      <span class="col-label"></span>
      <span class="col-value">Value</span>
      <span class="col-delta">Δ</span>
    </div>
    
    <!-- Train Loss -->
    <div class="table-row">
      <span class="label train-label">Train Loss</span>
      <span class="value">{formatNumber(losses.trainLoss)}</span>
      {#if history.length > 1}
        <span class="delta" class:negative={losses.trainLoss - history[history.length - 2].trainLoss > 0} class:positive={losses.trainLoss - history[history.length - 2].trainLoss < 0}>
          {formatChange(losses.trainLoss - history[history.length - 2].trainLoss)}
        </span>
      {:else}
        <span class="delta">—</span>
      {/if}
    </div>
    
    <!-- Test Loss -->
    <div class="table-row">
      <span class="label test-label">Test Loss</span>
      <span class="value">{formatNumber(losses.testLoss)}</span>
      {#if history.length > 1}
        <span class="delta" class:negative={losses.testLoss - history[history.length - 2].testLoss > 0} class:positive={losses.testLoss - history[history.length - 2].testLoss < 0}>
          {formatChange(losses.testLoss - history[history.length - 2].testLoss)}
        </span>
      {:else}
        <span class="delta">—</span>
      {/if}
    </div>
    
    <!-- Parameter A -->
    <div class="table-row">
      <span class="label">A</span>
      <span class="value">{formatNumber(parameters.a)}</span>
      {#if paramChanges}
        <span class="delta" class:negative={paramChanges.a < 0} class:positive={paramChanges.a > 0}>{formatChange(paramChanges.a)}</span>
      {:else}
        <span class="delta">—</span>
      {/if}
    </div>
    
    <!-- Parameter B -->
    <div class="table-row">
      <span class="label">B</span>
      <span class="value">{formatNumber(parameters.b)}</span>
      {#if paramChanges}
        <span class="delta" class:negative={paramChanges.b < 0} class:positive={paramChanges.b > 0}>{formatChange(paramChanges.b)}</span>
      {:else}
        <span class="delta">—</span>
      {/if}
    </div>
  </div>
</div>

<style>
  .parameter-display {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding-bottom: 0.5rem;
    overflow: hidden;
  }
  
  h3 {
    margin: 0 0 0.5rem 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    opacity: 0.9;
  }
  
  .values-table {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .table-header {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1fr;
    gap: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-border);
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .col-label {
    text-align: left;
  }
  
  .col-value {
    text-align: right;
  }
  
  .col-delta {
    text-align: center;
  }
  
  .table-row {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1fr;
    gap: 0.75rem;
    align-items: center;
    font-size: 0.8125rem;
    padding: 0.25rem 0;
  }
  
  .label {
    color: var(--color-text-tertiary);
    text-align: left;
    font-weight: 600;
  }
  
  .label.train-label {
    color: #3b82f6;
  }
  
  .label.test-label {
    color: #ef4444;
  }
  
  .value {
    font-weight: 600;
    font-family: 'SF Mono', Monaco, monospace;
    color: var(--color-text-primary);
    text-align: right;
  }
  
  .delta {
    font-size: 0.75rem;
    font-family: 'SF Mono', Monaco, monospace;
    color: var(--color-text-tertiary);
    text-align: center;
    font-weight: 600;
  }
  
  .delta.positive {
    color: var(--color-success);
  }
  
  .delta.negative {
    color: var(--color-danger);
  }
  
</style>

