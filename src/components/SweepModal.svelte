<script lang="ts">
  /**
   * The γ-sweep: steps-to-basin against a log grid of learning rates, run
   * headlessly from the CURRENT marker with the CURRENT optimizer — the
   * canonical U-curve, measured live. The theoretical plain-GD stability
   * edge 2/λmax is drawn on the same axes, so the reader watches theory and
   * experiment agree (or, for adaptive methods, watch the theory's line
   * stop applying — also a lesson).
   */
  import { onMount } from 'svelte';
  import { X, RotateCcw } from 'lucide-svelte';
  import katex from 'katex';
  import { sweepLearningRates, type SweepResult } from '../utils/sweep';

  export let onClose: () => void;

  const tex = (src: string) => katex.renderToString(src, { throwOnError: false, displayMode: false });

  let result: SweepResult | null = null;

  // Chart geometry
  const W = 560, H = 300;
  const M = { l: 52, r: 18, t: 16, b: 42 };
  const LOG_MIN = Math.log10(1e-4), LOG_MAX = 0;

  const px = (gamma: number) =>
    M.l + ((Math.log10(gamma) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * (W - M.l - M.r);
  // y: log scale over steps 1..maxSteps, low = better = lower on chart? No —
  // steps axis reads bottom-up: fewer steps (better) sits LOWER, like a cost.
  const py = (steps: number, maxSteps: number) =>
    H - M.b - (Math.log10(Math.max(1, steps)) / Math.log10(maxSteps)) * (H - M.t - M.b);

  function run() {
    result = sweepLearningRates();
  }
  onMount(run);

  $: converged = result?.points.filter((p) => p.steps !== null) ?? [];
  $: lineD = converged.length
    ? 'M ' + converged.map((p) => `${px(p.gamma).toFixed(1)},${py(p.steps!, result!.maxSteps).toFixed(1)}`).join(' L ')
    : '';
  $: failed = result?.points.filter((p) => p.steps === null) ?? [];
  $: edgeX = result?.edge && result.edge >= 1e-4 && result.edge <= 1 ? px(result.edge) : null;

  const X_TICKS = [1e-4, 1e-3, 1e-2, 1e-1, 1];
  $: yTicks = result ? [1, 10, 100, result.maxSteps] : [];

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="modal-backdrop" role="presentation" on:click={(e) => e.target === e.currentTarget && onClose()}>
  <div class="sweep-modal" role="dialog" aria-modal="true" aria-label="Learning-rate sweep">
    <div class="head">
      <span class="title">{@html tex(String.raw`\gamma`)} sweep — {result?.optimizerName ?? ''} from the current start</span>
      <button class="icon-btn" on:click={run} aria-label="Re-run sweep" title="Re-run from the current marker">
        <RotateCcw size={14} strokeWidth={2.2} />
      </button>
      <button class="icon-btn" on:click={onClose} aria-label="Close">
        <X size={15} strokeWidth={2.4} />
      </button>
    </div>

    {#if result}
      <svg viewBox="0 0 {W} {H}" class="chart" aria-hidden="true">
        <!-- axes -->
        <line x1={M.l} y1={H - M.b} x2={W - M.r} y2={H - M.b} class="axis" />
        <line x1={M.l} y1={M.t} x2={M.l} y2={H - M.b} class="axis" />
        {#each X_TICKS as tk}
          <line x1={px(tk)} y1={H - M.b} x2={px(tk)} y2={H - M.b + 4} class="axis" />
          <foreignObject x={px(tk) - 22} y={H - M.b + 7} width="44" height="20">
            <span class="tick" style="display:block;text-align:center">{@html tex(tk === 1 ? '1' : `10^{${Math.round(Math.log10(tk))}}`)}</span>
          </foreignObject>
        {/each}
        {#each yTicks as tk}
          <line x1={M.l - 4} y1={py(tk, result.maxSteps)} x2={M.l} y2={py(tk, result.maxSteps)} class="axis" />
          <foreignObject x="0" y={py(tk, result.maxSteps) - 8} width={M.l - 8} height="18">
            <span class="tick" style="display:block;text-align:right">{tk}</span>
          </foreignObject>
        {/each}
        <foreignObject x={W / 2 - 70} y={H - 20} width="140" height="20">
          <span class="tick" style="display:block;text-align:center">{@html tex(String.raw`\gamma`)} (log scale)</span>
        </foreignObject>
        <text x="14" y={(M.t + H - M.b) / 2} class="axis-lbl" transform="rotate(-90, 14, {(M.t + H - M.b) / 2})">steps to basin</text>

        <!-- the theoretical edge, drawn over the measurement -->
        {#if edgeX !== null}
          <line x1={edgeX} y1={M.t} x2={edgeX} y2={H - M.b} class="edge" />
          <foreignObject x={edgeX - 58} y={M.t} width="54" height="18">
            <span class="tick edge-lbl" style="display:block;text-align:right">{@html tex(String.raw`2/\lambda_{\max}`)}</span>
          </foreignObject>
        {/if}

        <!-- failures band: never reached the basin within budget -->
        {#each failed as p}
          {#if p.diverged}
            <path d="M {px(p.gamma) - 3},{M.t + 3} l 6,6 M {px(p.gamma) + 3},{M.t + 3} l -6,6" class="fail diverged" />
          {:else}
            <circle cx={px(p.gamma)} cy={M.t + 6} r="2.2" class="fail stalled" />
          {/if}
        {/each}

        <!-- the measured curve -->
        {#if lineD}
          <path d={lineD} class="curve" />
        {/if}
        {#each converged as p}
          <circle cx={px(p.gamma)} cy={py(p.steps ?? 1, result.maxSteps)} r="2.6" class="dot" />
        {/each}
      </svg>
      <p class="caption">
        Each dot: one full headless run from the marker’s position — the step at which the loss
        first enters the basin (the same criterion the coach uses). Red ✕ along the top: the run
        diverged; grey dots there never arrived within {result.maxSteps} steps.
        {#if edgeX !== null}The dashed red line is the theory from the curvature chapter — plain
        gradient descent must diverge to its right.{/if}
      </p>
    {:else}
      <p class="caption">This landscape has no data yet — generate a dataset first.</p>
    {/if}
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(2px);
  }
  .sweep-modal {
    width: min(620px, calc(100vw - 32px));
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border);
    border-radius: 14px;
    padding: 0.9rem 1.1rem 1rem;
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.4rem;
  }
  .title {
    flex: 1;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }
  .icon-btn {
    display: inline-flex;
    padding: 4px;
    color: var(--color-text-tertiary);
    background: none;
    border: none;
    cursor: pointer;
  }
  .icon-btn:hover { color: var(--color-text-primary); }

  .chart { width: 100%; height: auto; }
  .axis { stroke: var(--color-text-tertiary); stroke-opacity: 0.45; stroke-width: 1; fill: none; }
  .tick {
    font-size: 10px;
    color: var(--color-text-tertiary);
    white-space: nowrap;
  }
  .tick :global(.katex) { font-size: 1em; }
  .axis-lbl {
    font-size: 10px;
    fill: var(--color-text-tertiary);
    text-anchor: middle;
  }
  .curve { fill: none; stroke: #10b981; stroke-width: 1.6; stroke-opacity: 0.9; }
  .dot { fill: #10b981; }
  .fail.diverged { stroke: #ef4444; stroke-width: 1.4; fill: none; }
  .fail.stalled { fill: var(--color-text-tertiary); fill-opacity: 0.6; }
  .edge { stroke: #ef4444; stroke-width: 1.2; stroke-dasharray: 5 4; stroke-opacity: 0.8; }
  .edge-lbl { color: #ef4444; }

  .caption {
    margin: 0.5rem 0 0;
    font-size: 0.74rem;
    line-height: 1.5;
    color: var(--color-text-tertiary);
  }
</style>
