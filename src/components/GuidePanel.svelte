<script lang="ts">
  /**
   * Guide Panel Component
   * 
   * Educational panel showing key formulas with real LaTeX rendering
   */
  
  import { onMount, afterUpdate } from 'svelte';
  import { selectedProblem } from '../stores/stores';
  import { BookOpen } from 'lucide-svelte';
  import katex from 'katex';
  import 'katex/dist/katex.min.css';
  
  $: problemType = $selectedProblem;
  
  let modelFormulaElement: HTMLSpanElement;
  let parametersFormulaElement: HTMLSpanElement;
  let lossFormulaElement: HTMLSpanElement;
  let updateFormulaElement: HTMLSpanElement;
  
  // LaTeX formulas for each problem
  const modelFormulas: Record<string, string> = {
    'linear-regression': String.raw`Y = \alpha X + \beta`,
    'logistic-regression': String.raw`P(Y\!=\!1) = \sigma(\alpha X + \beta Y) = \frac{1}{1 + \exp(-(\alpha X + \beta Y))}`,
    'polynomial-regression': String.raw`Y = \alpha X^2 + \beta X`
  };
  
  const parametersFormula = String.raw`\boldsymbol{\theta} = \begin{bmatrix} \alpha & \beta \end{bmatrix}^T`;
  
  const lossFormulas: Record<string, string> = {
    'linear-regression': String.raw`\mathcal{L} = \frac{1}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i)^2`,
    'logistic-regression': String.raw`\mathcal{L} = -\frac{1}{n} \sum_{i=1}^{n} \left[ Y_i \log(\hat{Y}_i) + (1-Y_i) \log(1-\hat{Y}_i) \right]`,
    'polynomial-regression': String.raw`\mathcal{L} = \frac{1}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i)^2`
  };
  
  const updateFormula = String.raw`\boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma \nabla \mathcal{L}`;
  
  $: currentModelLatex = modelFormulas[problemType];
  $: currentLossLatex = lossFormulas[problemType];
  
  // Render LaTeX when component mounts or problem changes
  function renderLatex() {
    if (modelFormulaElement && currentModelLatex) {
      try {
        katex.render(currentModelLatex, modelFormulaElement, {
          throwOnError: false,
          displayMode: false
        });
      } catch (e) {
        console.error('KaTeX rendering error:', e);
      }
    }
    
    if (parametersFormulaElement && parametersFormula) {
      try {
        katex.render(parametersFormula, parametersFormulaElement, {
          throwOnError: false,
          displayMode: false
        });
      } catch (e) {
        console.error('KaTeX rendering error:', e);
      }
    }
    
    if (lossFormulaElement && currentLossLatex) {
      try {
        katex.render(currentLossLatex, lossFormulaElement, {
          throwOnError: false,
          displayMode: false
        });
      } catch (e) {
        console.error('KaTeX rendering error:', e);
      }
    }
    
    if (updateFormulaElement && updateFormula) {
      try {
        katex.render(updateFormula, updateFormulaElement, {
          throwOnError: false,
          displayMode: false
        });
      } catch (e) {
        console.error('KaTeX rendering error:', e);
      }
    }
  }
  
  onMount(() => {
    renderLatex();
  });
  
  afterUpdate(() => {
    renderLatex();
  });
</script>

<div class="guide-panel">
  <h3>
    <BookOpen size={18} strokeWidth={2} />
    <span>Formulas</span>
  </h3>
  
  <div class="equation-row">
    <span class="equation-label">Model:</span>
    <span class="latex-inline" bind:this={modelFormulaElement}></span>
  </div>
  
  <div class="equation-row">
    <span class="equation-label">Parameters:</span>
    <span class="latex-inline" bind:this={parametersFormulaElement}></span>
  </div>
  
  <div class="equation-row">
    <span class="equation-label">Loss:</span>
    <span class="latex-inline" bind:this={lossFormulaElement}></span>
  </div>
  
  <div class="equation-row">
    <span class="equation-label">Update:</span>
    <span class="latex-inline" bind:this={updateFormulaElement}></span>
  </div>
</div>

<style>
  .guide-panel {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding-bottom: 0.5rem;
    overflow: hidden;
  }
  
  h3 {
    margin: 0 0 0.375rem 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    opacity: 0.9;
  }
  
  .equation-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0;
  }
  
  .equation-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #10b981;
    flex-shrink: 0;
    min-width: 5.5rem;
  }
  
  .latex-inline {
    color: var(--color-text-primary);
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    display: flex;
    align-items: center;
  }
  
  /* Style KaTeX output */
  .latex-inline :global(.katex) {
    font-size: 1rem;
  }
  
  .latex-inline :global(.katex-html) {
    white-space: nowrap;
  }
</style>
