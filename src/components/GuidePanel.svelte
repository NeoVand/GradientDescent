<script lang="ts">
  /**
   * Guide Panel Component
   * 
   * Educational panel showing key formulas with real LaTeX rendering
   */
  
  import { onMount, afterUpdate } from 'svelte';
  import { selectedProblem, optimizerStore } from '../stores/stores';
  import { optimizers } from '../utils/optimizers';
  import { problemConfigs } from '../utils/problems';
  import { BookOpen } from 'lucide-svelte';
  import katex from 'katex';
  import 'katex/dist/katex.min.css';

  $: problemType = $selectedProblem;
  
  let modelFormulaElement: HTMLSpanElement;
  let parametersFormulaElement: HTMLSpanElement;
  let lossFormulaElement: HTMLSpanElement;
  let gradientFormulaElement: HTMLSpanElement;
  let updateFormulaElement: HTMLSpanElement;
  
  // LaTeX formulas for each problem
  const modelFormulas: Record<string, string> = {
    'slope-1d': String.raw`Y = \alpha X`,
    'double-well-1d': String.raw`\text{pure surface}`,
    'bumpy-1d': String.raw`\text{pure surface}`,
    'ar2': String.raw`X_t = \alpha X_{t-1} + \beta X_{t-2}`,
    'tiny-net': String.raw`\hat{Y} = \beta \, \tanh(\alpha X)`,
    'linear-regression': String.raw`Y = \alpha X + \beta`,
    'logistic-regression': String.raw`P(C\!=\!1) = \frac{1}{1 + \exp(-(\alpha X + \beta Y))}`,
    'polynomial-regression': String.raw`Y = \alpha X^2 + \beta X`,
    'sine-wave': String.raw`Y = \alpha \sin(\beta X)`,
    'gaussian-peak': String.raw`Y = \exp\!\left(-\frac{(X - \alpha)^2}{2\beta^2}\right)`,
    'exponential-decay': String.raw`Y = \alpha \, e^{-\beta X}`,
    'damped-oscillator': String.raw`Y = e^{-\alpha X} \cos(\beta X)`,
    'logistic-growth': String.raw`Y = \frac{1}{1 + \exp(-(\alpha X + \beta))}`,
    'power-law': String.raw`Y = \alpha \, X^{\beta}`,
    'gaussian-mixture': String.raw`Y = e^{-(X - \alpha)^2} + e^{-(X - \beta)^2}`,
    'circle-classifier': String.raw`P(\text{inside}) = \sigma\!\left(\frac{R^2 - (X-\alpha)^2 - (Y-\beta)^2}{\tau}\right)`,
    'source-localization': String.raw`\hat{S} = \frac{K}{(X-\alpha)^2 + (Y-\beta)^2 + \varepsilon}`,
    'mean-shift': String.raw`\hat{f}(\alpha,\beta) = \frac{1}{n}\sum_i \exp\!\left(-\frac{(X_i-\alpha)^2 + (Y_i-\beta)^2}{2\sigma^2}\right)`,
    'rosenbrock': String.raw`\text{pure surface}`,
    'saddle-point': String.raw`\text{pure surface}`,
    'himmelblau': String.raw`\text{pure surface}`
  };
  
  // One-parameter problems carry a single scalar θ = α; everything else
  // optimizes the two-vector θ = [α, β]ᵀ.
  $: parametersFormula = problemConfigs[problemType]?.oneParam
    ? String.raw`(\theta = \alpha)`
    : String.raw`(\boldsymbol{\theta} = [\alpha, \beta]^\top)`;

  const lossFormulas: Record<string, string> = {
    'slope-1d': String.raw`\mathcal{L} = \frac{1}{n} \sum_{i=1}^{n} (\alpha X_i - Y_i)^2`,
    'double-well-1d': String.raw`\mathcal{L} = \tfrac{(\alpha^2 - 4)^2}{8} + 0.6\,\alpha + 1.3`,
    'bumpy-1d': String.raw`\mathcal{L} = 0.15\,\alpha^2 + \sin(2\alpha) + 1.4`,
    'ar2': String.raw`\mathcal{L} = \frac{1}{m} \sum_{t} (X_t - \alpha X_{t-1} - \beta X_{t-2})^2`,
    'tiny-net': String.raw`\mathcal{L} = \frac{1}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i)^2`,
    'linear-regression': String.raw`\mathcal{L} = \frac{1}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i)^2`,
    'logistic-regression': String.raw`\mathcal{L} = -\frac{1}{n} \sum_{i=1}^{n} \left[ C_i \log(\hat{p}_i) + (1-C_i) \log(1-\hat{p}_i) \right]`,
    'polynomial-regression': String.raw`\mathcal{L} = \frac{1}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i)^2`,
    'sine-wave': String.raw`\mathcal{L} = \frac{1}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i)^2`,
    'gaussian-peak': String.raw`\mathcal{L} = \frac{1}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i)^2`,
    'exponential-decay': String.raw`\mathcal{L} = \frac{1}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i)^2`,
    'damped-oscillator': String.raw`\mathcal{L} = \frac{1}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i)^2`,
    'logistic-growth': String.raw`\mathcal{L} = \frac{1}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i)^2`,
    'power-law': String.raw`\mathcal{L} = \frac{1}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i)^2`,
    'gaussian-mixture': String.raw`\mathcal{L} = \frac{1}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i)^2`,
    'circle-classifier': String.raw`\mathcal{L} = -\frac{1}{n} \sum_{i=1}^{n} \left[ C_i \log p_i + (1-C_i) \log(1-p_i) \right]`,
    'source-localization': String.raw`\mathcal{L} = \frac{1}{n} \sum_{i=1}^{n} (\hat{S}_i - S_i)^2`,
    'mean-shift': String.raw`\mathcal{L} = \frac{1}{n} \sum_{i=1}^{n} \left( 1 - \exp\!\left(-\frac{\|\mathbf{p}_i - \boldsymbol{c}\|^2}{2\sigma^2}\right) \right)`,
    'rosenbrock': String.raw`\mathcal{L} = (1-\alpha)^2 + 100\,(\beta - \alpha^2)^2`,
    'saddle-point': String.raw`\mathcal{L} = \alpha^2 - \beta^2 + \tfrac{\beta^4}{8} + 2`,
    'himmelblau': String.raw`\mathcal{L} = (\alpha^2 + \beta - 11)^2 + (\alpha + \beta^2 - 7)^2`
  };

  const gradientFormulas: Record<string, string> = {
    'slope-1d': String.raw`\frac{d\mathcal{L}}{d\alpha} = \frac{2}{n} \sum_{i=1}^{n} (\alpha X_i - Y_i)\, X_i`,
    'double-well-1d': String.raw`\frac{d\mathcal{L}}{d\alpha} = \tfrac{\alpha(\alpha^2 - 4)}{2} + 0.6`,
    'bumpy-1d': String.raw`\frac{d\mathcal{L}}{d\alpha} = 0.3\,\alpha + 2\cos(2\alpha)`,
    'ar2': String.raw`\nabla_{\boldsymbol{\theta}} \mathcal{L} = -\frac{2}{m} \sum_{t} e_t \begin{bmatrix} X_{t-1} & X_{t-2} \end{bmatrix}^\top, \;\; e_t = X_t - \hat{X}_t`,
    'tiny-net': String.raw`\nabla_{\boldsymbol{\theta}} \mathcal{L} = \frac{2}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i) \begin{bmatrix} \beta\,(1{-}\tanh^2(\alpha X_i))\, X_i & \tanh(\alpha X_i) \end{bmatrix}^\top`,
    'linear-regression': String.raw`\nabla_{\boldsymbol{\theta}} \mathcal{L} = \frac{2}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i) \begin{bmatrix} X_i & 1 \end{bmatrix}^\top`,
    'logistic-regression': String.raw`\nabla_{\boldsymbol{\theta}} \mathcal{L} = \frac{1}{n} \sum_{i=1}^{n} (\hat{p}_i - C_i) \begin{bmatrix} X_i & Y_i \end{bmatrix}^\top`,
    'polynomial-regression': String.raw`\nabla_{\boldsymbol{\theta}} \mathcal{L} = \frac{2}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i) \begin{bmatrix} X_i^2 & X_i \end{bmatrix}^\top`,
    'sine-wave': String.raw`\nabla_{\boldsymbol{\theta}} \mathcal{L} = \frac{2}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i) \begin{bmatrix} \sin(\beta X_i) & \alpha X_i \cos(\beta X_i) \end{bmatrix}^\top`,
    'gaussian-peak': String.raw`\nabla_{\boldsymbol{\theta}} \mathcal{L} = \frac{2}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i) \hat{Y}_i \begin{bmatrix} \dfrac{X_i - \alpha}{\beta^2} & \dfrac{(X_i - \alpha)^2}{\beta^3} \end{bmatrix}^\top`,
    'exponential-decay': String.raw`\nabla_{\boldsymbol{\theta}} \mathcal{L} = \frac{2}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i) \begin{bmatrix} e^{-\beta X_i} & -X_i \, \hat{Y}_i \end{bmatrix}^\top`,
    'damped-oscillator': String.raw`\nabla_{\boldsymbol{\theta}} \mathcal{L} = \frac{2}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i) \begin{bmatrix} -X_i \, \hat{Y}_i & -X_i \, e^{-\alpha X_i} \sin(\beta X_i) \end{bmatrix}^\top`,
    'logistic-growth': String.raw`\nabla_{\boldsymbol{\theta}} \mathcal{L} = \frac{2}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i) \, \hat{Y}_i (1 - \hat{Y}_i) \begin{bmatrix} X_i & 1 \end{bmatrix}^\top`,
    'power-law': String.raw`\nabla_{\boldsymbol{\theta}} \mathcal{L} = \frac{2}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i) \begin{bmatrix} X_i^{\beta} & \hat{Y}_i \ln X_i \end{bmatrix}^\top`,
    'gaussian-mixture': String.raw`\nabla_{\boldsymbol{\theta}} \mathcal{L} = \frac{4}{n} \sum_{i=1}^{n} (\hat{Y}_i - Y_i) \begin{bmatrix} (X_i - \alpha)\, e^{-(X_i-\alpha)^2} & (X_i - \beta)\, e^{-(X_i-\beta)^2} \end{bmatrix}^\top`,
    'circle-classifier': String.raw`\nabla_{\boldsymbol{\theta}} \mathcal{L} = \frac{2}{n\tau} \sum_{i=1}^{n} (p_i - C_i) \begin{bmatrix} X_i - \alpha & Y_i - \beta \end{bmatrix}^\top`,
    'source-localization': String.raw`\nabla_{\boldsymbol{\theta}} \mathcal{L} = \frac{4}{n} \sum_{i=1}^{n} (\hat{S}_i - S_i) \, \frac{\hat{S}_i}{d_i^2 + \varepsilon} \begin{bmatrix} X_i - \alpha & Y_i' - \beta \end{bmatrix}^\top`,
    'mean-shift': String.raw`\nabla_{\boldsymbol{\theta}} \mathcal{L} = -\frac{1}{n\sigma^2} \sum_{i=1}^{n} k_i \begin{bmatrix} X_i - \alpha & Y_i' - \beta \end{bmatrix}^\top`,
    'rosenbrock': String.raw`\nabla \mathcal{L} = \begin{bmatrix} -2(1-\alpha) - 400\,\alpha(\beta - \alpha^2) & 200\,(\beta - \alpha^2) \end{bmatrix}^\top`,
    'saddle-point': String.raw`\nabla \mathcal{L} = \begin{bmatrix} 2\alpha & -2\beta + \tfrac{\beta^3}{2} \end{bmatrix}^\top`,
    'himmelblau': String.raw`\nabla \mathcal{L} = \begin{bmatrix} 4\alpha u + 2v & 2u + 4\beta v \end{bmatrix}^\top, \;\; u = \alpha^2{+}\beta{-}11,\; v = \alpha{+}\beta^2{-}7`
  };
  
  $: currentModelLatex = modelFormulas[problemType];
  $: currentLossLatex = lossFormulas[problemType];
  $: currentGradientLatex = gradientFormulas[problemType];
  // The update rule tracks the selected optimizer
  $: updateFormula = optimizers[$optimizerStore.id].updateRuleLatex;
  
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
    
    if (gradientFormulaElement && currentGradientLatex) {
      try {
        katex.render(currentGradientLatex, gradientFormulaElement, {
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
    <div class="equation-content">
      <span class="latex-inline" bind:this={modelFormulaElement}></span>
      <span class="latex-inline parameters" bind:this={parametersFormulaElement}></span>
    </div>
  </div>
  
  <div class="equation-row">
    <span class="equation-label">Loss:</span>
    <span class="latex-inline" bind:this={lossFormulaElement}></span>
  </div>
  
  <div class="equation-row">
    <span class="equation-label">Gradient:</span>
    <span class="latex-inline" bind:this={gradientFormulaElement}></span>
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
    padding-left: 50px;
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
    flex-shrink: 0;
  }
  
  .equation-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0;
  }
  
  .equation-label {
    font-size: 0.825rem;
    font-weight: 600;
    flex-shrink: 0;
    min-width: 5.5rem;
  }
  
  /* Light mode labels */
  :global([data-theme='light']) .equation-label {
    color: #059669;
  }
  
  /* Dark mode labels */
  :global([data-theme='dark']) .equation-label {
    color: #10b981;
  }
  
  .equation-content {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    overflow-x: auto;
  }
  
  .latex-inline {
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    overflow-x: auto;
  }
  
  /* Hide scrollbar */
  .latex-inline::-webkit-scrollbar {
    display: none;
  }
  
  .latex-inline {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  
  .latex-inline.parameters {
    opacity: 0.7;
    font-size: 0.9em;
  }
  
  .equation-content {
    overflow-x: auto;
  }
  
  /* Hide scrollbar for equation content */
  .equation-content::-webkit-scrollbar {
    display: none;
  }
  
  .equation-content {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  
  /* Style KaTeX output */
  .latex-inline :global(.katex) {
    font-size: 1.1rem;
  }
  
  .latex-inline :global(.katex-html) {
    white-space: nowrap;
  }
</style>
