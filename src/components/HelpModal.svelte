<script lang="ts">
  /**
   * Help Modal Component
   * 
   * Comprehensive guide explaining gradient descent theory and how to use the app
   */
  
  import { onMount, afterUpdate } from 'svelte';
  import { X, Target, BarChart2, Shuffle, Grid3x3, Navigation } from 'lucide-svelte';
  import katex from 'katex';
  import 'katex/dist/katex.min.css';
  
  export let isOpen = false;
  export let onClose: () => void;
  
  let gradientDescentElement: HTMLSpanElement;
  let updateRuleElement: HTMLSpanElement;
  let learningRateElement: HTMLSpanElement;
  
  const formulas = {
    gradientDescent: String.raw`\boldsymbol{\theta}^{(t+1)} = \boldsymbol{\theta}^{(t)} - \gamma \nabla \mathcal{L}(\boldsymbol{\theta}^{(t)})`,
    updateRule: String.raw`\nabla \mathcal{L} = \left[ \frac{\partial \mathcal{L}}{\partial \alpha}, \frac{\partial \mathcal{L}}{\partial \beta} \right]^T`,
    learningRate: String.raw`\gamma \in (0, 1]`
  };
  
  function renderLatex() {
    const renderOptions = { throwOnError: false, displayMode: false };
    
    if (gradientDescentElement) {
      try {
        katex.render(formulas.gradientDescent, gradientDescentElement, renderOptions);
      } catch (e) {
        console.error('KaTeX error:', e);
      }
    }
    
    if (updateRuleElement) {
      try {
        katex.render(formulas.updateRule, updateRuleElement, renderOptions);
      } catch (e) {
        console.error('KaTeX error:', e);
      }
    }
    
    if (learningRateElement) {
      try {
        katex.render(formulas.learningRate, learningRateElement, renderOptions);
      } catch (e) {
        console.error('KaTeX error:', e);
      }
    }
  }
  
  onMount(() => {
    renderLatex();
  });
  
  afterUpdate(() => {
    renderLatex();
  });
  
  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
</script>

{#if isOpen}
  <div class="modal-backdrop" on:click={handleBackdropClick}>
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title">
          <span class="modal-icon">∂</span>
          <h2>Gradient Descent Explorer</h2>
        </div>
        <button class="close-btn" on:click={onClose}>
          <X size={24} strokeWidth={2} />
        </button>
      </div>
      
      <div class="modal-body">
        <section>
          <h3>What is Gradient Descent?</h3>
          <p>
            Gradient descent is an iterative optimization algorithm that finds the minimum of a function by following the direction of steepest descent. At each step, we update our parameters in the opposite direction of the gradient:
          </p>
          <div class="formula-display" bind:this={gradientDescentElement}></div>
          <p class="formula-explanation">
            where <strong>θ</strong> are the parameters [α, β], <strong>γ</strong> (gamma) is the learning rate, and <strong>∇ℒ</strong> is the gradient of the loss function.
          </p>
        </section>
        
        <section>
          <h3>The Gradient</h3>
          <p>
            The gradient points in the direction of steepest increase. We move in the opposite direction to minimize loss:
          </p>
          <div class="formula-display" bind:this={updateRuleElement}></div>
          <p>
            The arrows in the gradient field show these directions at each point in parameter space. Longer arrows indicate steeper gradients.
          </p>
        </section>
        
        <section>
          <h3>Learning Rate</h3>
          <p>
            The learning rate <span bind:this={learningRateElement}></span> controls the step size:
          </p>
          <ul>
            <li><strong>Too small:</strong> Slow convergence, many iterations needed</li>
            <li><strong>Too large:</strong> Overshooting, unstable, may diverge</li>
            <li><strong>Just right:</strong> Fast and stable convergence to optimal solution</li>
          </ul>
        </section>
        
        <section>
          <h3>How to Use This App</h3>
          <div class="instruction-group">
            <h4>Manual Exploration</h4>
            <p>
              <strong>Drag the orange marker</strong> on the gradient field to manually explore different parameter values. Watch how the model, loss landscape, and loss history update in real-time. The red trail shows your path through parameter space.
            </p>
          </div>
          
          <div class="instruction-group">
            <h4>Automatic Training</h4>
            <p>
              Click the <strong>Train button</strong> to run gradient descent automatically. The algorithm will follow the gradient arrows to find the optimal parameters. Watch the progress bar fill as training proceeds.
            </p>
          </div>
        </section>
        
        <section>
          <h3>Experiments to Try</h3>
          
          <div class="experiment">
            <h4><Target size={16} strokeWidth={2} /> Experiment 1: Learning Rate Effects</h4>
            <p>
              <strong>Try different learning rates</strong> (0.001, 0.01, 0.1) and observe:
            </p>
            <ul>
              <li>Small γ: Slow but steady progress down the gradient</li>
              <li>Medium γ: Faster convergence, smooth path</li>
              <li>Large γ: May overshoot or oscillate around the minimum</li>
            </ul>
          </div>
          
          <div class="experiment">
            <h4><BarChart2 size={16} strokeWidth={2} /> Experiment 2: Data Noise Impact</h4>
            <p>
              <strong>Increase the noise level</strong> from 0 to 2 and observe:
            </p>
            <ul>
              <li>Clean data (noise = 0): Sharp loss minimum, perfect fit possible</li>
              <li>Noisy data (noise > 1): Flatter loss landscape, harder to optimize</li>
              <li>Watch how the gradient field becomes less defined with more noise</li>
            </ul>
          </div>
          
          <div class="experiment">
            <h4><Shuffle size={16} strokeWidth={2} /> Experiment 3: Train/Test Split</h4>
            <p>
              <strong>Adjust the train/test ratio</strong> and toggle randomization:
            </p>
            <ul>
              <li>More training data: Better parameter estimates, lower training loss</li>
              <li>More test data: Better validation of generalization</li>
              <li>Randomized vs. sequential: Observe differences in how the model fits</li>
            </ul>
          </div>
          
          <div class="experiment">
            <h4><Grid3x3 size={16} strokeWidth={2} /> Experiment 4: Problem Comparison</h4>
            <p>
              <strong>Switch between problem types</strong> to see different loss landscapes:
            </p>
            <ul>
              <li><strong>Linear:</strong> Simple convex bowl - one global minimum</li>
              <li><strong>Logistic:</strong> Smooth landscape with probability interpretation</li>
              <li><strong>Polynomial:</strong> More complex curvature, non-linear relationships</li>
            </ul>
          </div>
          
          <div class="experiment">
            <h4><Navigation size={16} strokeWidth={2} /> Experiment 5: Starting Points</h4>
            <p>
              <strong>Drag the marker to different starting positions</strong> and train:
            </p>
            <ul>
              <li>Far from optimal: Longer path, more iterations needed</li>
              <li>Near optimal: Quick convergence</li>
              <li>All paths lead to the same minimum (convex problems)</li>
            </ul>
          </div>
        </section>
        
        <section>
          <h3>Understanding the Visualizations</h3>
          <ul>
            <li><strong>Data Plot:</strong> Your training (solid) and test (dashed) data points with the current model fit</li>
            <li><strong>Gradient Field:</strong> Loss heatmap (colors show loss magnitude) with gradient arrows showing steepest descent directions</li>
            <li><strong>Loss History:</strong> How training and test loss evolve over time - watch for convergence or overfitting</li>
            <li><strong>Formulas:</strong> The mathematical foundation of what you're observing</li>
          </ul>
        </section>
        
        <footer class="modal-footer">
          <p>
            Developed with ∂ by <strong>Neo Mohsenvand</strong>
          </p>
        </footer>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 2rem;
    animation: fadeIn 0.2s ease;
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  
  .modal-content {
    background: var(--color-bg-secondary);
    border-radius: 16px;
    max-width: 700px;
    width: 100%;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.3s ease;
  }
  
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .modal-header {
    padding: 1.5rem;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  
  .modal-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  
  .modal-icon {
    font-family: 'Times New Roman', 'Georgia', serif;
    font-size: 2rem;
    font-style: italic;
    color: #10b981;
    line-height: 1;
  }
  
  .modal-header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text-primary);
  }
  
  .close-btn {
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--color-text-tertiary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  
  .close-btn:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }
  
  .modal-body {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }
  
  /* Custom scrollbar for modal */
  .modal-body::-webkit-scrollbar {
    width: 8px;
  }
  
  .modal-body::-webkit-scrollbar-track {
    background: var(--color-bg-tertiary);
    border-radius: 4px;
  }
  
  .modal-body::-webkit-scrollbar-thumb {
    background: rgba(16, 185, 129, 0.3);
    border-radius: 4px;
  }
  
  .modal-body::-webkit-scrollbar-thumb:hover {
    background: rgba(16, 185, 129, 0.5);
  }
  
  section {
    margin-bottom: 2rem;
  }
  
  section:last-of-type {
    margin-bottom: 1rem;
  }
  
  h3 {
    margin: 0 0 0.75rem 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: #10b981;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  p {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--color-text-secondary);
  }
  
  .formula-display {
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.2);
    border-radius: 8px;
    padding: 1rem;
    margin: 0.75rem 0;
    overflow-x: auto;
  }
  
  .formula-display :global(.katex) {
    font-size: 1.15rem;
    color: var(--color-text-primary);
  }
  
  .formula-explanation {
    font-size: 0.8125rem;
    color: var(--color-text-tertiary);
    font-style: italic;
  }
  
  ul {
    margin: 0.5rem 0 1rem 0;
    padding-left: 1.5rem;
    list-style-type: disc;
  }
  
  li {
    margin: 0.375rem 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--color-text-secondary);
  }
  
  li strong {
    color: var(--color-text-primary);
  }
  
  .instruction-group {
    margin-bottom: 1.25rem;
  }
  
  .experiment {
    background: var(--color-bg-tertiary);
    border-left: 3px solid #10b981;
    border-radius: 6px;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  
  .modal-footer {
    border-top: 1px solid var(--color-border);
    padding: 1.25rem 1.5rem;
    flex-shrink: 0;
  }
  
  .modal-footer p {
    margin: 0;
    text-align: center;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--color-text-tertiary);
  }
  
  .modal-footer strong {
    color: #10b981;
    font-weight: 600;
  }
</style>

