<script lang="ts">
  /**
   * Help Modal
   *
   * A guided tour: an animated hero, the prerequisites (loss & gradient
   * intuition), the algorithm, the knobs, the 13 problems, things to try,
   * and a key for the three on-screen panels.
   */

  import { onMount, afterUpdate } from 'svelte';
  import {
    X,
    Activity, Mountain, TrendingUp, TrendingDown, Percent, Waves,
    Target, Radio, ScatterChart,
    Sparkles, Compass, Rocket, Zap, RefreshCw,
    BookOpen, FlaskConical, Layers, Map
  } from 'lucide-svelte';
  import katex from 'katex';
  import 'katex/dist/katex.min.css';

  export let isOpen = false;
  export let onClose: () => void;

  let updateRuleEl: HTMLSpanElement;
  let momentumEl: HTMLSpanElement;
  let lossDefinitionEl: HTMLSpanElement;
  let gradientDefinitionEl: HTMLSpanElement;

  const formulas = {
    updateRule: String.raw`\boldsymbol{\theta}^{(t+1)} \leftarrow \boldsymbol{\theta}^{(t)} - \gamma\, \nabla \mathcal{L}(\boldsymbol{\theta}^{(t)})`,
    momentum: String.raw`\mathbf{v}^{(t+1)} \leftarrow \mu\, \mathbf{v}^{(t)} + \nabla \mathcal{L},\quad \boldsymbol{\theta}^{(t+1)} \leftarrow \boldsymbol{\theta}^{(t)} - \gamma\, \mathbf{v}^{(t+1)}`,
    lossDefinition: String.raw`\mathcal{L}(\boldsymbol{\theta}) = \tfrac{1}{n}\sum_{i=1}^{n} \big(\hat{y}_i - y_i\big)^{2}`,
    gradientDefinition: String.raw`\nabla \mathcal{L} = \begin{bmatrix} \tfrac{\partial \mathcal{L}}{\partial \alpha} \\[2pt] \tfrac{\partial \mathcal{L}}{\partial \beta} \end{bmatrix}`
  };

  function renderLatex() {
    const opts = { throwOnError: false, displayMode: false };
    const safe = (el: HTMLElement | undefined, src: string) => {
      if (!el) return;
      try { katex.render(src, el, opts); } catch (e) { console.error(e); }
    };
    safe(updateRuleEl, formulas.updateRule);
    safe(momentumEl, formulas.momentum);
    safe(lossDefinitionEl, formulas.lossDefinition);
    safe(gradientDefinitionEl, formulas.gradientDefinition);
  }

  onMount(renderLatex);
  afterUpdate(renderLatex);

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (isOpen && e.key === 'Escape') onClose();
  }

  // ----- Gradient concept SVG: a real vector field that fills the whole card -----
  // Same loss as the Loss Landscape panel: L(α, β) = (α − cα)² + (β − cβ)².
  // Negative gradient at every grid cell points toward (cα, cβ).
  // The viewBox is intentionally wide (3:1) so the SVG can stretch across
  // the entire concept card; the basin is placed in the left third so the
  // most informative part of the field stays visible while a gradient
  // overlay on the right side carries the explanatory text.
  const gradVizW = 300;
  const gradVizH = 100;
  const gradVizCx = 75;
  const gradVizCy = 50;
  type Arrow = { x1: number; y1: number; x2: number; y2: number; w: number; o: number };
  const gradFieldArrows: Arrow[] = (() => {
    const arrows: Arrow[] = [];
    const cols = 18, rows = 7;
    const stepX = gradVizW / (cols + 1);
    const stepY = gradVizH / (rows + 1);
    let maxMag = 0;
    const raw: { gx: number; gy: number; ox: number; oy: number; m: number }[] = [];
    for (let j = 1; j <= rows; j++) {
      for (let i = 1; i <= cols; i++) {
        const ox = i * stepX, oy = j * stepY;
        const dx = gradVizCx - ox, dy = gradVizCy - oy;
        const m = Math.sqrt(dx * dx + dy * dy);
        if (m < 5) { raw.push({ gx: 0, gy: 0, ox, oy, m: 0 }); continue; }
        raw.push({ gx: dx / m, gy: dy / m, ox, oy, m });
        if (m > maxMag) maxMag = m;
      }
    }
    for (const r of raw) {
      if (r.m === 0) continue;
      const lenScale = 0.45 + 0.55 * (r.m / maxMag);
      const len = 9 * lenScale;
      arrows.push({
        x1: r.ox, y1: r.oy,
        x2: r.ox + r.gx * len, y2: r.oy + r.gy * len,
        w: 0.7 + 0.6 * lenScale,
        o: 0.5 + 0.4 * lenScale
      });
    }
    return arrows;
  })();

  // The 13 problems, grouped — formulas kept tiny so they fit in card layout.
  type ProblemCard = { name: string; icon: any; customIcon?: string; formula: string; tag: string };
  const problems: Record<string, ProblemCard[]> = {
    'Curve fitting': [
      { name: 'Linear', icon: TrendingUp, formula: 'αX + β', tag: 'one bowl, one minimum' },
      { name: 'Polynomial', icon: null, customIcon: 'x²', formula: 'αX² + βX', tag: 'curvature; convex bowl' },
      { name: 'Sine', icon: Activity, formula: 'α sin(βX)', tag: 'frequency aliasing → many minima' },
      { name: 'Exponential', icon: TrendingDown, formula: 'α e^(−βX)', tag: 'anisotropic; momentum shines' },
      { name: 'Damped Osc.', icon: Waves, formula: 'e^(−αt) cos(βt)', tag: 'decay × ringing; symmetric ±β' },
      { name: 'Gaussian Peak', icon: Mountain, formula: 'exp(−(X−α)²/2β²)', tag: 'vanishing gradients far out' },
      { name: 'Logistic Growth', icon: null, customIcon: 'σ', formula: '1 / (1 + e^(−(αX+β)))', tag: 'sigmoid — saturates at extremes' },
      { name: 'Power Law', icon: null, customIcon: 'xⁿ', formula: 'αX^β', tag: 'long, narrow valley' },
      { name: 'Mixture', icon: null, customIcon: 'ΛΛ', formula: 'e^−(X−α)² + e^−(X−β)²', tag: 'two equivalent minima (α↔β)' },
    ],
    'Classification & geometry': [
      { name: 'Logistic Reg.', icon: Percent, formula: 'σ(αX + βY)', tag: 'find the linear boundary' },
      { name: 'Circle Classifier', icon: Target, formula: 'σ((R²−d²)/τ)', tag: 'find a circle center' },
      { name: 'Source Localization', icon: Radio, formula: 'K / (d² + ε)', tag: 'inverse-square triangulation' },
      { name: 'Mean-Shift Cluster', icon: ScatterChart, formula: 'Σ(1 − kᵢ)/n', tag: 'two cluster modes' }
    ]
  };
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div
    class="modal-backdrop"
    role="presentation"
    on:click={handleBackdropClick}
  >
    <div class="modal-content" role="dialog" aria-modal="true" aria-label="Help and guide">
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
        <!-- ============================== HERO ============================== -->
        <div class="hero">
          <svg class="hero-svg" viewBox="0 0 460 200" preserveAspectRatio="xMidYMid meet">
            <defs>
              <radialGradient id="bowl-glow" cx="60%" cy="55%" r="42%">
                <stop offset="0%" stop-color="#fde047" stop-opacity="0.55" />
                <stop offset="35%" stop-color="#10b981" stop-opacity="0.30" />
                <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
              </radialGradient>
              <clipPath id="hero-clip">
                <rect x="0" y="0" width="460" height="200" rx="10" />
              </clipPath>
              <!-- Curved descent path: starts upper-left, curves into the basin -->
              <path id="descent-path"
                    d="M 50,30 Q 110,45 170,85 T 250,118 Q 285,128 296,116"
                    fill="none" />
            </defs>

            <g clip-path="url(#hero-clip)">
              <!-- Subtle bowl background -->
              <rect x="0" y="0" width="460" height="200" fill="url(#bowl-glow)" rx="10" />

              <!-- Concentric contours around the basin (296, 116). Sized so the
                   biggest one still fits inside the 460-wide viewBox. -->
              <ellipse cx="296" cy="116" rx="14"  ry="10"  class="contour" style="stroke-opacity: 0.55" />
              <ellipse cx="296" cy="116" rx="36"  ry="26"  class="contour" style="stroke-opacity: 0.42" />
              <ellipse cx="296" cy="116" rx="64"  ry="46"  class="contour" style="stroke-opacity: 0.30" />
              <ellipse cx="296" cy="116" rx="98"  ry="68"  class="contour" style="stroke-opacity: 0.20" />
              <ellipse cx="296" cy="116" rx="135" ry="92"  class="contour" style="stroke-opacity: 0.13" />
              <ellipse cx="296" cy="116" rx="160" ry="108" class="contour" style="stroke-opacity: 0.07" />
            </g>

            <!-- Comet trail: dots sliding along the same path with offsets -->
            <g class="trail">
              {#each [0.0, 0.18, 0.34, 0.48] as begin, i}
                <circle r="3" fill="#f59e0b" opacity={0.10 + i * 0.10}>
                  <animateMotion dur="3.2s" repeatCount="indefinite" begin="{begin}s">
                    <mpath xlink:href="#descent-path" />
                  </animateMotion>
                </circle>
              {/each}
            </g>

            <!-- Lead marker -->
            <g>
              <circle r="9" fill="none" stroke="#f59e0b" stroke-width="2" opacity="0.9">
                <animateMotion dur="3.2s" repeatCount="indefinite" begin="0.6s">
                  <mpath xlink:href="#descent-path" />
                </animateMotion>
              </circle>
              <circle r="5.5" fill="#f59e0b" stroke="#fff" stroke-width="2">
                <animateMotion dur="3.2s" repeatCount="indefinite" begin="0.6s">
                  <mpath xlink:href="#descent-path" />
                </animateMotion>
              </circle>
            </g>
          </svg>

          <div class="hero-text">
            <div class="hero-eyebrow">An interactive playground for</div>
            <div class="hero-title">finding the bottom of a bowl.</div>
            <div class="hero-subtitle">Drag the orange marker. Hit Train. Watch loss fall.</div>
          </div>
        </div>

        <!-- ============================== PREREQS ============================== -->
        <section>
          <h3><BookOpen size={18} strokeWidth={2} /> Prerequisites</h3>

          <div class="concept">
            <div class="concept-text">
              <h4>Loss — how wrong is the model?</h4>
              <p>
                A single number that says how badly the model is doing right now.
                Lower is better. The whole game is to make this number small.
              </p>
              <p>
                For most fits here it's <em>mean squared error</em> — average of
                (prediction − truth)² across the data points:
              </p>
              <div class="formula-inline" bind:this={lossDefinitionEl}></div>
            </div>
            <svg class="concept-svg" viewBox="0 0 200 120">
              <!-- Loss curve: a parabola opening up -->
              <path d="M 20,15 Q 100,180 180,15"
                    fill="none" stroke="#10b981" stroke-width="2.5" />
              <!-- Minimum dot -->
              <circle cx="100" cy="98" r="6" fill="#f59e0b" stroke="#fff" stroke-width="2" />
              <text x="100" y="118" class="caption" text-anchor="middle">minimum</text>
              <!-- Loss arrow -->
              <text x="40" y="38" class="caption">loss ↑</text>
            </svg>
          </div>

          <div class="concept concept-bg-overlay">
            <svg class="concept-bg-svg" viewBox={`0 0 ${gradVizW} ${gradVizH}`} preserveAspectRatio="xMidYMid slice">
              <defs>
                <radialGradient id="grad-bowl-bg" cx="25%" cy="50%" r="55%">
                  <stop offset="0%" stop-color="#fde047" stop-opacity="0.55" />
                  <stop offset="45%" stop-color="#10b981" stop-opacity="0.22" />
                  <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
                </radialGradient>
                <marker id="grad-arrowhead" viewBox="0 -5 10 10"
                        refX="8" refY="0" markerWidth="4" markerHeight="4" orient="auto">
                  <path d="M0,-5L10,0L0,5" fill="currentColor" />
                </marker>
              </defs>

              <rect x="0" y="0" width={gradVizW} height={gradVizH} fill="url(#grad-bowl-bg)" />

              {#each gradFieldArrows as a}
                <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
                      stroke="currentColor" stroke-width={a.w}
                      opacity={a.o} marker-end="url(#grad-arrowhead)" />
              {/each}

              <ellipse cx={gradVizCx} cy={gradVizCy} rx="10" ry="7"
                       fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="1" />
              <ellipse cx={gradVizCx} cy={gradVizCy} rx="28" ry="20"
                       fill="none" stroke="#fff" stroke-opacity="0.32" stroke-width="1" />
              <ellipse cx={gradVizCx} cy={gradVizCy} rx="55" ry="40"
                       fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="1" />

              <circle cx={gradVizCx} cy={gradVizCy} r="6" fill="none"
                      stroke="#f59e0b" stroke-width="1.5" />
              <circle cx={gradVizCx} cy={gradVizCy} r="3.5" fill="#f59e0b"
                      stroke="#fff" stroke-width="1.5" />
            </svg>
            <div class="concept-fade"></div>
            <div class="concept-text concept-text-overlay">
              <h4>Gradient — the slope of the loss</h4>
              <p>
                The gradient <strong>∇ℒ</strong> is a vector with one component
                per parameter. Each component measures how loss changes when you
                nudge that parameter:
              </p>
              <div class="overlay-formula" bind:this={gradientDefinitionEl}></div>
              <p>
                It points <em>uphill</em> — the direction of steepest ascent.
                To minimize loss you walk the <strong>opposite</strong> way; the
                arrows here are exactly that <em>negative gradient</em>, longer
                where the surface is steeper.
              </p>
            </div>
          </div>
        </section>

        <!-- ============================== ALGORITHM ============================== -->
        <section>
          <h3><Compass size={18} strokeWidth={2} /> The algorithm</h3>
          <p>
            That's it. One step of gradient descent is just:
          </p>
          <div class="formula-display" bind:this={updateRuleEl}></div>
          <ol class="algo-steps">
            <li>Start with random parameters <strong>θ</strong> (the orange marker).</li>
            <li>Compute the gradient <strong>∇ℒ</strong> at that point.</li>
            <li>Step in the negative-gradient direction with stride <strong>γ</strong> (learning rate).</li>
            <li>Repeat until loss stops dropping.</li>
          </ol>
          <p class="aside">
            All the art is in the step size — too small and you crawl, too big and you ricochet.
          </p>
        </section>

        <!-- ============================== KNOBS ============================== -->
        <section>
          <h3><Sparkles size={18} strokeWidth={2} /> Knobs to play with</h3>

          <div class="knob">
            <div class="knob-head"><Zap size={16} strokeWidth={2} /> Learning rate <em class="g">γ</em></div>
            <p>How big each step is.</p>
            <ul class="knob-bullets">
              <li><strong>Too small:</strong> the marker creeps; you'll burn through your training-step budget without converging.</li>
              <li><strong>Too big:</strong> overshoots the minimum; loss bounces or diverges to infinity.</li>
              <li><strong>Just right:</strong> a smooth curve into the basin. Each problem ships with a sane default.</li>
            </ul>
          </div>

          <div class="knob">
            <div class="knob-head"><Compass size={16} strokeWidth={2} /> Optimizer</div>
            <p>
              How the step is computed from the gradient. Plain <strong>GD</strong> steps
              straight downhill; <strong>Momentum</strong> and <strong>Nesterov</strong> accumulate
              velocity; <strong>AdaGrad</strong>, <strong>RMSProp</strong>, and <strong>Adam</strong> adapt
              each parameter's step size from gradient history. Watch the two arrows on the
              marker: blue is the raw downhill direction, red is the step the optimizer
              actually takes — the gap between them is the optimizer's personality.
            </p>
          </div>

          <div class="knob">
            <div class="knob-head"><Rocket size={16} strokeWidth={2} /> Momentum <em class="g">μ</em></div>
            <p>
              On the Momentum and Nesterov optimizers, the marker keeps a velocity.
              Each step blends a fraction of the previous direction with the current
              gradient:
            </p>
            <div class="formula-display" bind:this={momentumEl}></div>
            <ul class="knob-bullets">
              <li><strong>μ = 0:</strong> plain gradient descent.</li>
              <li><strong>μ ≈ 0.9:</strong> the marker barrels through flat regions and shrugs off small noisy ridges.</li>
              <li><strong>μ → 1:</strong> overshoots wildly and orbits the minimum before settling.</li>
            </ul>
            <p class="aside">
              Try <strong>Gaussian Peak</strong> with μ = 0 — the gradient near the
              edges is so faint the marker stalls. Crank μ up to 0.9 and watch it
              power through.
            </p>
          </div>

          <div class="knob">
            <div class="knob-head"><RefreshCw size={16} strokeWidth={2} /> Training steps</div>
            <p>How many gradient updates to run when you click Train. More = more time, more chances to refine.</p>
          </div>
        </section>

        <!-- ============================== PROBLEMS ============================== -->
        <section>
          <h3><Layers size={18} strokeWidth={2} /> 13 problems to explore</h3>
          <p>
            Each problem has two parameters (α, β), a loss surface you can see live, and a
            curated default for learning rate, momentum, and visible range.
          </p>

          {#each Object.entries(problems) as [groupName, list]}
            <div class="problem-group-label">{groupName}</div>
            <div class="problem-grid">
              {#each list as p}
                <div class="problem-card">
                  <div class="problem-icon">
                    {#if p.customIcon}
                      <span class="custom-icon">{p.customIcon}</span>
                    {:else if p.icon}
                      <svelte:component this={p.icon} size={18} strokeWidth={2} />
                    {/if}
                  </div>
                  <div class="problem-text">
                    <div class="problem-name">{p.name}</div>
                    <div class="problem-formula">{p.formula}</div>
                    <div class="problem-tag">{p.tag}</div>
                  </div>
                </div>
              {/each}
            </div>
          {/each}
        </section>

        <!-- ============================== EXPERIMENTS ============================== -->
        <section>
          <h3><FlaskConical size={18} strokeWidth={2} /> Things to try</h3>

          <div class="experiment">
            <h4>Watch a local minimum trap you</h4>
            <p>
              Pick <strong>Sine Wave</strong>, set <em>μ = 0</em>, train. The frequency
              landscape has many basins; the marker often gets stuck in one. Now bump μ up
              and try again — does momentum let it escape?
            </p>
          </div>

          <div class="experiment">
            <h4>Symmetric pairs</h4>
            <p>
              <strong>Gaussian Peak</strong>, <strong>Damped Oscillator</strong>,
              <strong>Mixture</strong>, and <strong>Mean-Shift</strong> each have
              <em>two</em> equivalent global minima. Re-train a few times — the marker
              picks a basin based on where it starts.
            </p>
          </div>

          <div class="experiment">
            <h4>The vanishing-gradient graveyard</h4>
            <p>
              In <strong>Gaussian Peak</strong>, drag the marker far from center. The
              arrows thin out to nothing. Press Train and the marker barely moves — exactly
              the issue that makes deep networks need careful initialization.
            </p>
          </div>

          <div class="experiment">
            <h4>Anisotropic valleys</h4>
            <p>
              <strong>Power Law</strong> has a long, narrow trench. With μ = 0 the marker
              creeps along the floor; with μ = 0.9 it accelerates and shoots into the
              basin in a fraction of the steps.
            </p>
          </div>

          <div class="experiment">
            <h4>Noise blurs the truth</h4>
            <p>
              Crank <strong>Noise</strong> to 2 on Linear Regression. The loss landscape
              softens and the optimum drifts away from the true line. No amount of training
              can undo noise — only collecting more data can.
            </p>
          </div>

          <div class="experiment">
            <h4>The marker is the parameters</h4>
            <p>
              For the four 2D problems (Logistic Regression, Circle Classifier, Source
              Localization, Mean-Shift) the orange marker on the left plot <em>is</em> the
              parameter (α, β). Drag it around and see the model update directly on the
              data.
            </p>
          </div>
        </section>

        <!-- ============================== VIZ KEY ============================== -->
        <section>
          <h3><Map size={18} strokeWidth={2} /> Reading the panels</h3>
          <ul class="viz-list">
            <li>
              <strong>Data plot</strong> — the data points and the current model.
              For curve fits, blue solid is the current fit, green dashed is the truth.
              For 2D problems, the orange marker shows your parameters directly on the plot.
            </li>
            <li>
              <strong>Loss & Gradient</strong> — the loss surface as a function of (α, β).
              Bright = low loss. White contour lines connect points of equal loss. Field arrows
              show the steepest-descent direction at each grid cell. On the marker itself,
              the <span style="color:#3b82f6; font-weight:600">blue arrow</span> is the local
              steepest descent (−∇ℒ) and the <span style="color:#ef4444; font-weight:600">red
              arrow</span> is the step the optimizer actually took. Drag the marker to teleport.
            </li>
            <li>
              <strong>Loss History</strong> — train and test loss vs. step number. A clean
              decline is a healthy run. Big spikes mean you're overshooting (too much γ or μ).
              A persistent gap between train and test hints at overfitting.
            </li>
          </ul>
        </section>
      </div>

      <footer class="modal-footer">
        <p>Built with ∂ by <strong>Neo Mohsenvand</strong></p>
        <a
          class="github-link"
          href="https://github.com/NeoVand/GradientDescent"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source on GitHub"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
          <span>GitHub</span>
        </a>
      </footer>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
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
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal-content {
    background: var(--color-bg-secondary);
    border-radius: 16px;
    max-width: 760px;
    width: 100%;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.3s ease;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .modal-header {
    padding: 1.25rem 1.5rem;
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
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.01em;
  }

  .close-btn {
    width: 36px; height: 36px;
    flex-shrink: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--color-text-tertiary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    padding: 0;
  }
  .close-btn :global(svg) { width: 22px; height: 22px; flex-shrink: 0; }
  .close-btn:hover { background: var(--color-bg-tertiary); color: var(--color-text-primary); }
  .close-btn:active { transform: scale(0.94); }

  .modal-body {
    padding: 1.25rem 1.5rem 1.5rem;
    overflow-y: auto;
    flex: 1;
  }
  .modal-body::-webkit-scrollbar { width: 8px; }
  .modal-body::-webkit-scrollbar-track { background: var(--color-bg-tertiary); border-radius: 4px; }
  .modal-body::-webkit-scrollbar-thumb { background: rgba(16, 185, 129, 0.3); border-radius: 4px; }
  .modal-body::-webkit-scrollbar-thumb:hover { background: rgba(16, 185, 129, 0.5); }

  /* ---------- Hero ---------- */
  .hero {
    position: relative;
    border-radius: 14px;
    overflow: hidden;
    margin-bottom: 2rem;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
  }
  .hero-svg {
    display: block;
    width: 100%;
    height: 200px;
  }
  .contour {
    fill: none;
    stroke: #10b981;
    stroke-width: 1.4;
  }
  .hero-text {
    position: absolute;
    top: 18px;
    left: 24px;
    right: 24px;
    pointer-events: none;
  }
  .hero-eyebrow {
    font-size: 0.78rem;
    color: var(--color-text-tertiary);
    letter-spacing: 0.03em;
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .hero-title {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--color-text-primary);
    line-height: 1.2;
    letter-spacing: -0.01em;
    margin-bottom: 6px;
  }
  .hero-subtitle {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  /* ---------- Sections ---------- */
  section {
    margin-bottom: 2rem;
  }
  section:last-of-type { margin-bottom: 0.5rem; }

  h3 {
    margin: 0 0 0.875rem 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    letter-spacing: -0.005em;
  }
  h3 :global(svg) { color: #10b981; }

  h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  p {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--color-text-secondary);
  }
  p:last-child { margin-bottom: 0; }

  ul, ol {
    margin: 0.5rem 0 0.75rem 0;
    padding-left: 1.5rem;
  }
  li {
    margin: 0.375rem 0;
    font-size: 0.875rem;
    line-height: 1.55;
    color: var(--color-text-secondary);
  }
  li strong { color: var(--color-text-primary); }
  em.g {
    font-family: Georgia, serif;
    font-style: italic;
    color: #10b981;
    font-weight: 500;
  }

  /* ---------- Concept blocks (loss & gradient) ---------- */
  .concept {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 200px;
    gap: 1.25rem;
    align-items: center;
    padding: 1rem 1.25rem;
    background: var(--color-bg-tertiary);
    border-radius: 12px;
    border: 1px solid var(--color-border);
    margin-bottom: 0.875rem;
  }
  .concept-text { min-width: 0; }
  .concept-text h4 {
    color: #10b981;
    margin-bottom: 0.5rem;
    font-size: 1rem;
  }
  .concept-svg {
    width: 100%;
    height: 120px;
    color: var(--color-text-tertiary);
  }
  .concept :global(.caption) {
    fill: var(--color-text-tertiary);
    font-size: 11px;
    font-family: inherit;
  }

  /* Overlay variant: the SVG fills the whole card and the text sits on
     the right with a left-to-right fade hiding the field underneath it. */
  .concept-bg-overlay {
    display: grid;
    /* Two columns: vector field on the left, text on the right. The right
       column's exact width must match the fade-to-opaque stop in the
       overlay so the text always sits on a fully-opaque background. */
    grid-template-columns: 1fr 50%;
    position: relative;
    padding: 0;
    overflow: hidden;
    /* No min-height — the card grows with the (right-column) text content
       and the SVG stretches to fill via background positioning. */
  }
  .concept-bg-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    color: var(--color-text-secondary);
    pointer-events: none;
  }
  /* The fade overlay: transparent on the left so the field shows through,
     opaque on the right so the text is fully readable. */
  .concept-fade {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      to right,
      transparent 0%,
      transparent 35%,
      var(--color-bg-tertiary) 50%,
      var(--color-bg-tertiary) 100%
    );
  }
  /* The text sits in the second grid column so the card height tracks the
     text — no clipping. The fade lines up because the column starts at 50%. */
  .concept-text-overlay {
    grid-column: 2;
    position: relative;
    padding: 1.25rem 1.5rem 1.25rem 1.25rem;
    z-index: 1;
    align-self: center;
  }
  .concept-text-overlay h4 { margin-top: 0; }
  .concept-text-overlay p { margin-bottom: 0.6rem; }
  .concept-text-overlay p:last-child { margin-bottom: 0; }
  .overlay-formula {
    display: block;
    margin: 0.5rem 0;
    text-align: center;
  }
  .overlay-formula :global(.katex) {
    font-size: 1rem;
    color: var(--color-text-primary);
  }

  /* ---------- Formulas ---------- */
  .formula-display {
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.22);
    border-radius: 8px;
    padding: 0.875rem 1rem;
    margin: 0.5rem 0 0.75rem 0;
    overflow-x: auto;
  }
  .formula-display :global(.katex) {
    font-size: 1.05rem;
    color: var(--color-text-primary);
  }
  .formula-inline {
    display: inline-block;
    background: rgba(16, 185, 129, 0.06);
    border: 1px solid rgba(16, 185, 129, 0.15);
    border-radius: 6px;
    padding: 0.25rem 0.6rem;
    margin: 0.25rem 0;
  }
  .formula-inline :global(.katex) {
    font-size: 0.95rem;
    color: var(--color-text-primary);
  }

  /* ---------- Algorithm steps ---------- */
  .algo-steps { padding-left: 1.5rem; }
  .algo-steps li::marker {
    color: #10b981;
    font-weight: 700;
  }
  .aside {
    font-size: 0.8125rem;
    color: var(--color-text-tertiary);
    font-style: italic;
    border-left: 3px solid rgba(16, 185, 129, 0.4);
    padding-left: 0.75rem;
    margin-top: 0.5rem;
  }

  /* ---------- Knob blocks ---------- */
  .knob {
    background: var(--color-bg-tertiary);
    border-left: 3px solid #10b981;
    border-radius: 8px;
    padding: 0.875rem 1.125rem;
    margin-bottom: 0.875rem;
  }
  .knob-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 0.4rem;
  }
  .knob-head :global(svg) { color: #10b981; }
  .knob-bullets li {
    font-size: 0.84rem;
  }

  /* ---------- Problem grid ---------- */
  .problem-group-label {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #10b981;
    margin: 0.875rem 0 0.5rem 0;
  }
  .problem-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.625rem;
  }
  .problem-card {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.625rem 0.75rem;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    transition: border-color 0.15s, transform 0.15s;
  }
  .problem-card:hover {
    border-color: rgba(16, 185, 129, 0.5);
    transform: translateY(-1px);
  }
  .problem-icon {
    width: 28px; height: 28px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #10b981;
    background: rgba(16, 185, 129, 0.1);
    border-radius: 6px;
  }
  .custom-icon {
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 0.95rem;
    font-weight: 700;
  }
  .problem-text { min-width: 0; flex: 1; }
  .problem-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 1px;
  }
  .problem-formula {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.72rem;
    color: var(--color-text-tertiary);
    margin-bottom: 1px;
  }
  .problem-tag {
    font-size: 0.72rem;
    color: var(--color-text-secondary);
    font-style: italic;
  }

  /* ---------- Experiments ---------- */
  .experiment {
    background: var(--color-bg-tertiary);
    border-left: 3px solid #10b981;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-bottom: 0.625rem;
  }
  .experiment h4 {
    color: #10b981;
    font-size: 0.9rem;
    margin-bottom: 0.35rem;
  }
  .experiment p { margin-bottom: 0; font-size: 0.85rem; }

  /* ---------- Viz list ---------- */
  .viz-list { padding-left: 1.25rem; }
  .viz-list li { margin-bottom: 0.5rem; }

  /* ---------- Footer ---------- */
  .modal-footer {
    border-top: 1px solid var(--color-border);
    padding: 0.875rem 1.5rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .modal-footer p {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-text-tertiary);
  }
  .modal-footer strong { color: #10b981; font-weight: 600; }
  .github-link {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-secondary);
    text-decoration: none;
    font-size: 0.8125rem;
    font-weight: 500;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  .github-link:hover {
    color: #10b981;
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.08);
  }
  .github-link :global(svg) { width: 18px; height: 18px; flex-shrink: 0; }

  /* ---------- Mobile ---------- */
  @media (max-width: 768px) {
    .modal-backdrop { padding: 0.5rem; }
    .modal-content { max-height: 95dvh; border-radius: 14px; }
    .modal-header { padding: 0.875rem 1rem; }
    .modal-header h2 { font-size: 1.1rem; }
    .modal-icon { font-size: 1.5rem; }
    .modal-body { padding: 1rem; }
    .modal-footer { padding: 0.75rem 1rem; }

    .hero-svg { height: 150px; }
    .hero-text { top: 12px; left: 16px; right: 16px; }
    .hero-title { font-size: 1.05rem; }
    .hero-subtitle { font-size: 0.78rem; }
    .hero-eyebrow { font-size: 0.7rem; }

    .concept {
      grid-template-columns: 1fr;
    }
    .concept-svg { height: 100px; }

    /* On mobile, drop the overlay layout: stack SVG on top, text below. */
    .concept-bg-overlay {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .concept-bg-svg {
      position: relative;
      height: 110px;
      flex-shrink: 0;
    }
    .concept-fade { display: none; }
    .concept-text-overlay {
      position: relative;
      width: 100%;
      padding: 1rem 1.25rem;
    }

    .problem-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
