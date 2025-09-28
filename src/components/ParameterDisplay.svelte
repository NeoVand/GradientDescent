<script lang="ts">
  /**
   * Parameter Display Component
   * 
   * This component shows the current values of the model parameters and losses.
   * It provides a clear, numerical view of the optimization state, complementing
   * the visual representations in other components.
   */
  
  import { parametersStore, currentLosses, historyStore } from '../stores/stores';
  
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
  <h3>Values</h3>
  
  <div class="values-grid">
    <!-- Before Update Column -->
    <div class="column">
      <h4>Before Update</h4>
      
      <div class="value-row">
        <span class="label">train loss</span>
        <span class="value">{formatNumber(history[history.length - 2]?.trainLoss || 0)}</span>
      </div>
      
      <div class="value-row">
        <span class="label">test loss</span>
        <span class="value">{formatNumber(history[history.length - 2]?.testLoss || 0)}</span>
      </div>
      
      <div class="value-row">
        <span class="label">Parameter A</span>
        <span class="value">{formatNumber(previousParams?.a || 0)}</span>
      </div>
      
      <div class="value-row">
        <span class="label">Parameter B</span>
        <span class="value">{formatNumber(previousParams?.b || 0)}</span>
      </div>
    </div>
    
    <!-- After Update Column -->
    <div class="column">
      <h4>After Update</h4>
      
      <div class="value-row">
        <span class="label">train loss</span>
        <span class="value current">{formatNumber(losses.trainLoss)}</span>
        {#if history.length > 1}
          <span class="change" class:positive={losses.trainLoss < history[history.length - 2].trainLoss}>
            ({formatChange(losses.trainLoss - history[history.length - 2].trainLoss)})
          </span>
        {/if}
      </div>
      
      <div class="value-row">
        <span class="label">test loss</span>
        <span class="value current">{formatNumber(losses.testLoss)}</span>
        {#if history.length > 1}
          <span class="change" class:positive={losses.testLoss < history[history.length - 2].testLoss}>
            ({formatChange(losses.testLoss - history[history.length - 2].testLoss)})
          </span>
        {/if}
      </div>
      
      <div class="value-row">
        <span class="label">Parameter A</span>
        <span class="value current">{formatNumber(parameters.a)}</span>
        {#if paramChanges}
          <span class="change neutral">
            ({formatChange(paramChanges.a)})
          </span>
        {/if}
      </div>
      
      <div class="value-row">
        <span class="label">Parameter B</span>
        <span class="value current">{formatNumber(parameters.b)}</span>
        {#if paramChanges}
          <span class="change neutral">
            ({formatChange(paramChanges.b)})
          </span>
        {/if}
      </div>
    </div>
  </div>
  
  <!-- Additional Statistics -->
  <div class="stats-section">
    <div class="stat">
      <span class="stat-label">Loss Ratio (Train/Test)</span>
      <span class="stat-value">
        {losses.testLoss > 0 ? formatNumber(losses.trainLoss / losses.testLoss, 3) : '—'}
      </span>
    </div>
    
    <div class="stat">
      <span class="stat-label">Parameter Magnitude</span>
      <span class="stat-value">
        {formatNumber(Math.sqrt(parameters.a ** 2 + parameters.b ** 2), 3)}
      </span>
    </div>
  </div>
</div>

<style>
  .parameter-display {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #4a4a4a;
  }
  
  .values-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    flex: 1;
  }
  
  .column {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .column h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .value-row {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.8125rem;
  }
  
  .label {
    flex: 1;
    color: #666;
  }
  
  .value {
    font-weight: 600;
    font-family: 'SF Mono', Monaco, monospace;
    color: #333;
  }
  
  .value.current {
    color: #1a1a1a;
  }
  
  .change {
    font-size: 0.75rem;
    font-family: 'SF Mono', Monaco, monospace;
    color: #ef4444;
  }
  
  .change.positive {
    color: #10b981;
  }
  
  .change.neutral {
    color: #6b7280;
  }
  
  .stats-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid #e0e0e0;
  }
  
  .stat {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 0.75rem;
  }
  
  .stat-label {
    color: #666;
  }
  
  .stat-value {
    font-weight: 600;
    font-family: 'SF Mono', Monaco, monospace;
    color: #333;
  }
</style>

