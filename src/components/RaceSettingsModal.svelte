<script lang="ts">
  /**
   * Race settings — a two-column control panel. The left column is the lineup
   * (which optimizers race, click to focus one); the right column holds the
   * race-wide parameters (steps, speed, schedule, batch) on top and the focused
   * optimizer's learning rate + hyperparameters below. Everything persists in
   * `raceConfigStore`; the race and its finish-line report follow the lineup.
   * Overrides are sparse — an untouched value falls back to the active problem's
   * curated default.
   */
  import { onDestroy } from 'svelte';
  import { Flag, X, RotateCcw, Play, Zap, Info, RefreshCw, Gauge, Timer, Layers } from 'lucide-svelte';
  import { raceConfigStore, selectedProblem, type RaceConfig } from '../stores/stores';
  import { optimizers, optimizerGroups, type OptimizerId } from '../utils/optimizers';
  import { resolveLearningRate, hyperForProblem, RACE_COLORS, startRace } from '../utils/trainer';
  import { schedules, scheduleOrder } from '../utils/schedules';
  import { hyperMeta } from '../utils/hyperMeta';
  import { tooltip } from '../utils/tooltip';
  import { portalToApp } from '../utils/portal';
  import type { ProblemType, ScheduleId } from '../types/types';

  export let onClose: () => void;

  $: cfg = $raceConfigStore;
  $: problem = $selectedProblem;
  $: selectedCount = cfg.enabled.length;

  // Phones get a re-imagined single-column bottom sheet (lineup chips, then
  // the focused optimizer's tuning, then race-wide params); wider screens keep
  // the two-column panel exactly as it is.
  const phoneMq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 560px)') : null;
  let isPhone = phoneMq?.matches ?? false;
  const onMqChange = (e: MediaQueryListEvent) => (isPhone = e.matches);
  phoneMq?.addEventListener('change', onMqChange);
  onDestroy(() => phoneMq?.removeEventListener('change', onMqChange));

  // The optimizer whose parameters are shown on the right. Initialised lazily
  // to the first selected one; never auto-reset (you can tune a benched method).
  let active: OptimizerId | null = null;
  $: if (active === null) active = cfg.enabled[0] ?? 'gd';
  $: activeOpt = active ? optimizers[active] : null;

  // On the phone the tuning pills only list the enabled lineup, so the focus
  // must follow it — benched tuning stays a desktop affordance.
  $: if (isPhone && active && cfg.enabled.length > 0 && !cfg.enabled.includes(active)) {
    active = cfg.enabled[0];
  }

  // ---- Learning-rate log mapping (mirrors the sidebar γ slider) ----
  const LR_LOG_MIN = -4, LR_LOG_MAX = 0;
  const lrToPos = (lr: number) =>
    ((Math.log10(Math.max(1e-4, Math.min(1, lr))) - LR_LOG_MIN) / (LR_LOG_MAX - LR_LOG_MIN)) * 100;
  const posToLr = (pos: number) => Math.pow(10, LR_LOG_MIN + (pos / 100) * (LR_LOG_MAX - LR_LOG_MIN));
  const fmtLr = (r: number) => (r >= 0.0995 ? r.toFixed(2) : r >= 0.001 ? r.toFixed(3) : r.toFixed(4));
  function lerpHex(c1: string, c2: string, t: number): string {
    const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
    const ch = (sh: number) => Math.round(((a >> sh) & 255) + (((b >> sh) & 255) - ((a >> sh) & 255)) * t);
    return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
  }
  const lrColor = (lr: number) => {
    const p = lrToPos(lr);
    return p <= 55 ? '#10b981' : p <= 80 ? lerpHex('#10b981', '#f59e0b', (p - 55) / 25) : lerpHex('#f59e0b', '#ef4444', (p - 80) / 20);
  };

  // ---- Batch size discrete stops (mirrors the sidebar) ----
  const batchSteps: (number | 'all')[] = [1, 2, 4, 8, 16, 32, 'all'];
  const batchIndex = (b: number | 'all') => {
    const i = batchSteps.findIndex(v => v === b);
    return i === -1 ? batchSteps.length - 1 : i;
  };
  const batchLabel = (b: number | 'all') => (b === 'all' ? 'All' : String(b));

  const SCHEDULE_LABELS: Record<ScheduleId, string> = {
    constant: 'Const', step: 'Step', cosine: 'Cosine', 'warmup-cosine': 'Warmup'
  };

  // Effective (default + override) values. `c`/`p` are passed so the template
  // tracks them as reactive dependencies.
  const effLr = (id: OptimizerId, c: RaceConfig, p: ProblemType) =>
    c.overrides[id]?.lr ?? resolveLearningRate(id, p);
  const effHyper = (id: OptimizerId, key: string, c: RaceConfig, p: ProblemType) =>
    c.overrides[id]?.hyper?.[key] ?? hyperForProblem(id, p)[key];
  const overridden = (id: OptimizerId, c: RaceConfig) => {
    const o = c.overrides[id];
    return !!o && (o.lr !== undefined || Object.keys(o.hyper ?? {}).length > 0);
  };

  function raceNow() {
    startRace();
    onClose();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window on:keydown={onKey} />

<!-- Portaled to #app: opened from inside the mobile drawer, whose transform
     would otherwise hijack these fixed boxes (off-centre modal, backdrop
     shrunk to the drawer). -->
<button class="rs-backdrop" aria-label="Close race settings" on:click={onClose} use:portalToApp></button>
{#snippet raceParams()}
      <div class="rs-ctl">
        <div class="rs-ctl-row">
          <span class="rs-ctl-icon"><RefreshCw size={15} strokeWidth={2} /></span>
          <span class="rs-ctl-label">Max steps</span>
          <span class="rs-ctl-spring"></span>
          <span class="rs-ctl-val">{cfg.maxSteps}</span>
        </div>
        <input
          class="rs-slider" type="range" min="20" max="1000" step="10" value={cfg.maxSteps}
          style="--fill: {((cfg.maxSteps - 20) / 980) * 100}%; --slider-color: #10b981"
          on:input={(e) => raceConfigStore.setMaxSteps(parseInt(e.currentTarget.value))}
        />
      </div>
      <div class="rs-ctl">
        <div class="rs-ctl-row">
          <span class="rs-ctl-icon"><Gauge size={15} strokeWidth={2} /></span>
          <span class="rs-ctl-label">Speed</span>
          <span class="rs-ctl-spring"></span>
          <span class="rs-ctl-val">{cfg.stepsPerSecond}/s</span>
        </div>
        <input
          class="rs-slider" type="range" min="2" max="60" step="1" value={cfg.stepsPerSecond}
          style="--fill: {((cfg.stepsPerSecond - 2) / 58) * 100}%; --slider-color: #94a3b8"
          on:input={(e) => raceConfigStore.setSpeed(parseInt(e.currentTarget.value))}
        />
      </div>
      <div class="rs-ctl">
        <div class="rs-ctl-row">
          <span class="rs-ctl-icon"><Timer size={15} strokeWidth={2} /></span>
          <span class="rs-ctl-label">Schedule</span>
          <button class="rs-info" aria-label="About the schedule" use:tooltip={'How γ evolves over the race<br/><span style="opacity:0.8;font-size:0.7rem">Applied to every racer by its progress through the budget</span>'}>
            <Info size={12} strokeWidth={2} />
          </button>
        </div>
        <div class="rs-seg" role="group" aria-label="Schedule">
          {#each scheduleOrder as sid}
            <button class:on={cfg.schedule === sid} on:click={() => raceConfigStore.setSchedule(sid)}>{SCHEDULE_LABELS[sid]}</button>
          {/each}
        </div>
      </div>
      <div class="rs-ctl">
        <div class="rs-ctl-row">
          <span class="rs-ctl-icon"><Layers size={15} strokeWidth={2} /></span>
          <span class="rs-ctl-label">Batch size</span>
          <button class="rs-info" aria-label="About batch size" use:tooltip={'How many data points each gradient uses<br/><span style="opacity:0.8;font-size:0.7rem">Smaller = noisier steps · All = full-batch</span>'}>
            <Info size={12} strokeWidth={2} />
          </button>
          <span class="rs-ctl-spring"></span>
          <span class="rs-ctl-val">{batchLabel(cfg.batchSize)}</span>
        </div>
        <input
          class="rs-slider" type="range" min="0" max={batchSteps.length - 1} step="1" value={batchIndex(cfg.batchSize)}
          style="--fill: {(batchIndex(cfg.batchSize) / (batchSteps.length - 1)) * 100}%; --slider-color: #22d3ee"
          on:input={(e) => raceConfigStore.setBatchSize(batchSteps[parseInt(e.currentTarget.value)])}
        />
      </div>
{/snippet}

{#snippet activeParams()}
      {#if active && activeOpt}
        <div class="rs-detail-head">
          <span class="rs-dot" style="background: {RACE_COLORS[active]}"></span>
          <span class="rs-detail-name">{activeOpt.name}</span>
          {#if overridden(active, cfg)}
            <button class="rs-reset" on:click={() => active && raceConfigStore.clearOverride(active)}>
              <RotateCcw size={11} strokeWidth={2.4} /> Reset
            </button>
          {/if}
        </div>
        <!-- Learning rate (log) -->
        <div class="rs-ctl">
          <div class="rs-ctl-row">
            <span class="rs-ctl-icon" style="color: {lrColor(effLr(active, cfg, problem))}"><Zap size={15} strokeWidth={2} /></span>
            <span class="rs-ctl-label">Learn rate <span class="rs-sym">γ</span></span>
            <span class="rs-ctl-spring"></span>
            <span class="rs-ctl-val" style="color: {lrColor(effLr(active, cfg, problem))}">{fmtLr(effLr(active, cfg, problem))}</span>
          </div>
          <input
            class="rs-slider" type="range" min="0" max="100" step="0.5" value={lrToPos(effLr(active, cfg, problem))}
            style="--fill: {lrToPos(effLr(active, cfg, problem))}%; --slider-color: {lrColor(effLr(active, cfg, problem))}"
            on:input={(e) => active && raceConfigStore.setOverride(active, { lr: posToLr(parseFloat(e.currentTarget.value)) })}
          />
        </div>
        <!-- Hyperparameters from the optimizer's spec (icons match the sidebar) -->
        {#each activeOpt.hyperparams as spec}
          {@const m = hyperMeta(spec.label)}
          {@const val = effHyper(active, spec.key, cfg, problem)}
          <div class="rs-ctl">
            <div class="rs-ctl-row">
              <span class="rs-ctl-icon"><svelte:component this={m.icon} size={15} strokeWidth={2} /></span>
              <span class="rs-ctl-label">{spec.label} <span class="rs-sym">{spec.symbol}</span></span>
              <button class="rs-info" aria-label={'About ' + spec.label} use:tooltip={spec.hint}>
                <Info size={12} strokeWidth={2} />
              </button>
              <span class="rs-ctl-spring"></span>
              <span class="rs-ctl-val" style="color: {m.color}">{val.toFixed(spec.step < 0.01 ? 3 : 2)}</span>
            </div>
            <input
              class="rs-slider" type="range" min={spec.min} max={spec.max} step={spec.step} value={val}
              style="--fill: {((val - spec.min) / (spec.max - spec.min)) * 100}%; --slider-color: {m.color}"
              on:input={(e) => active && raceConfigStore.setOverride(active, { hyper: { [spec.key]: parseFloat(e.currentTarget.value) } })}
            />
          </div>
        {/each}
        {#if activeOpt.hyperparams.length === 0}
          <p class="rs-note">No hyperparameters — only the learning rate.</p>
        {/if}
      {/if}
{/snippet}

<div class="rs-modal" class:rs-sheet={isPhone} role="dialog" aria-modal="true" aria-label="Race settings" use:portalToApp>
  <header class="rs-head">
    <span class="rs-title"><Flag size={16} strokeWidth={2.5} /> Race settings</span>
    <button class="rs-x" on:click={onClose} aria-label="Close"><X size={18} strokeWidth={2.5} /></button>
  </header>

  {#if isPhone}
    <!-- ░░░ Phone: one thumb-friendly column — lineup chips, then the focused
         optimizer's tuning right where you tapped, then race-wide params. ░░░ -->
    <div class="rs-sheet-body">
      <div class="rs-col-label">Lineup <span class="rs-count">{selectedCount}</span></div>
      <div class="rs-chips">
        {#each optimizerGroups as group}
          {#each group.ids as id}
            {@const on = cfg.enabled.includes(id)}
            <button
              class="rs-chip" class:on aria-pressed={on}
              style="--c: {RACE_COLORS[id]}"
              on:click={() => raceConfigStore.toggle(id)}
            >
              <span class="rs-dot" style="background: {RACE_COLORS[id]}"></span>
              <span>{optimizers[id].name}</span>
              {#if overridden(id, cfg)}<span class="rs-edited">•</span>{/if}
            </button>
          {/each}
        {/each}
      </div>

      <div class="rs-col-label rs-gap-top">Tune</div>
      {#if selectedCount > 0}
        <div class="rs-pills" role="tablist" aria-label="Optimizer to tune">
          {#each cfg.enabled as id}
            <button class="rs-pill" class:on={active === id} style="--c: {RACE_COLORS[id]}" on:click={() => (active = id)}>
              <span class="rs-dot" style="background: {RACE_COLORS[id]}"></span>
              {optimizers[id].name}
            </button>
          {/each}
        </div>
        {@render activeParams()}
      {:else}
        <p class="rs-note">Add optimizers to the lineup above to tune them.</p>
      {/if}

      <div class="rs-col-label rs-gap-top">Race</div>
      {@render raceParams()}
    </div>
  {:else}
    <div class="rs-cols">
      <!-- ░░░ Left: the lineup ░░░ -->
      <div class="rs-lineup">
        <div class="rs-col-label">Lineup <span class="rs-count">{selectedCount}</span></div>
        {#each optimizerGroups as group}
          <div class="rs-subgroup">{group.label}</div>
          {#each group.ids as id}
            {@const on = cfg.enabled.includes(id)}
            <div class="rs-opt" class:active={active === id}>
              <button
                class="rs-check" class:on aria-pressed={on}
                aria-label={(on ? 'Remove ' : 'Add ') + optimizers[id].name}
                style="--c: {RACE_COLORS[id]}"
                on:click={() => raceConfigStore.toggle(id)}
              >{#if on}<span class="rs-check-dot"></span>{/if}</button>
              <button class="rs-opt-name" on:click={() => (active = id)}>
                <span class="rs-dot" style="background: {RACE_COLORS[id]}"></span>
                <span class="rs-name">{optimizers[id].name}</span>
                {#if overridden(id, cfg)}<span class="rs-edited" title="Custom parameters">•</span>{/if}
              </button>
            </div>
          {/each}
        {/each}
      </div>

      <!-- ░░░ Right: race params + the focused optimizer ░░░ -->
      <div class="rs-detail">
        <div class="rs-col-label">Race</div>
        {@render raceParams()}
        <!-- The focused optimizer's parameters -->
        {@render activeParams()}
      </div>
    </div>
  {/if}

  <footer class="rs-foot">
    <button class="rs-reset-all" on:click={() => raceConfigStore.reset()}>Reset all</button>
    <span class="rs-ctl-spring"></span>
    <button class="rs-race" disabled={selectedCount === 0} on:click={raceNow}>
      <Play size={14} strokeWidth={2.5} /> Race {selectedCount}
    </button>
  </footer>
</div>

<style>
  .rs-backdrop {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(2, 6, 16, 0.55); border: none; padding: 0; cursor: default;
    backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
  }
  .rs-modal {
    position: fixed; z-index: 201;
    top: 50%; left: 50%; transform: translate(-50%, -50%);
    /* dvh: on phones 88vh can outgrow the *visible* viewport once the
       browser chrome collapses — dvh tracks what's actually on screen. */
    width: min(680px, calc(100vw - 1.5rem)); max-height: min(88vh, calc(100dvh - 1.5rem));
    display: flex; flex-direction: column;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 16px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
    overflow: hidden;
  }
  .rs-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.8rem 1rem; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
  }
  .rs-title { display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.98rem; font-weight: 700; color: var(--color-text-primary); }
  .rs-title :global(svg) { color: #10b981; }
  .rs-x {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: 8px; border: 1px solid transparent;
    background: transparent; color: var(--color-text-tertiary); cursor: pointer; transition: all 0.15s;
  }
  .rs-x:hover { background: var(--color-bg-tertiary); color: var(--color-text-primary); }

  .rs-cols { display: flex; min-height: 0; flex: 1; }
  .rs-lineup {
    width: 44%; flex-shrink: 0; overflow-y: auto;
    overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
    padding: 0.7rem 0.8rem 1rem; border-right: 1px solid var(--color-border);
  }
  .rs-detail {
    flex: 1; min-width: 0; overflow-y: auto; padding: 0.7rem 0.9rem 1rem;
    overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
  }

  .rs-col-label {
    display: flex; align-items: baseline; gap: 0.4rem;
    font-size: 0.66rem; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
    color: #10b981; margin: 0 0 0.55rem;
  }
  .rs-count {
    font-size: 0.62rem; font-weight: 700; color: var(--color-text-tertiary);
    background: var(--color-bg-tertiary); border-radius: 999px; padding: 0.02rem 0.4rem;
  }
  .rs-subgroup {
    font-size: 0.6rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--color-text-tertiary); margin: 0.6rem 0 0.2rem;
  }

  /* Lineup rows */
  .rs-opt {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.25rem 0.35rem; border-radius: 8px; transition: background 0.12s;
  }
  .rs-opt.active { background: var(--color-bg-tertiary); }
  .rs-check {
    flex-shrink: 0; width: 18px; height: 18px; border-radius: 5px;
    border: 2px solid var(--color-border); background: transparent;
    display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; transition: all 0.15s;
  }
  .rs-check.on { border-color: var(--c); background: var(--c); }
  .rs-check-dot { width: 7px; height: 7px; border-radius: 2px; background: #fff; }
  .rs-opt-name {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 0.4rem;
    background: transparent; border: none; cursor: pointer; padding: 0.15rem 0;
    color: var(--color-text-primary); text-align: left;
  }
  .rs-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .rs-name { font-size: 0.84rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rs-edited { color: #f59e0b; font-weight: 900; font-size: 0.9rem; line-height: 1; }
  .rs-opt.active .rs-name { color: var(--color-text-primary); }

  /* Right column controls */
  .rs-detail-head {
    display: flex; align-items: center; gap: 0.45rem;
    margin: 1.1rem 0 0.6rem; padding-top: 0.9rem; border-top: 1px solid var(--color-border);
  }
  .rs-detail-name { font-size: 0.92rem; font-weight: 700; color: var(--color-text-primary); }
  .rs-reset {
    margin-left: auto; display: inline-flex; align-items: center; gap: 0.25rem;
    padding: 0.18rem 0.45rem; border: 1px solid var(--color-border); border-radius: 6px;
    background: transparent; color: var(--color-text-secondary); font-size: 0.68rem; font-weight: 600; cursor: pointer; transition: all 0.15s;
  }
  .rs-reset:hover { border-color: #f59e0b; color: #f59e0b; }

  .rs-ctl { margin-bottom: 0.75rem; }
  .rs-ctl-row { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.25rem; }
  .rs-ctl-icon { display: inline-flex; color: var(--color-text-tertiary); flex-shrink: 0; }
  .rs-ctl-label { font-size: 0.8rem; font-weight: 600; color: var(--color-text-secondary); }
  .rs-sym { font-family: 'SF Mono', Monaco, monospace; opacity: 0.7; font-size: 0.74rem; margin-left: 0.1rem; }
  .rs-info {
    display: inline-flex; align-items: center; justify-content: center;
    width: 16px; height: 16px; padding: 0; border: none; background: transparent;
    color: var(--color-text-tertiary); cursor: help; opacity: 0.7; transition: opacity 0.15s;
  }
  .rs-info:hover { opacity: 1; color: #10b981; }
  .rs-ctl-spring { flex: 1; }
  .rs-ctl-val {
    font-family: 'SF Mono', Monaco, monospace; font-size: 0.78rem; font-weight: 700;
    font-variant-numeric: tabular-nums; color: var(--color-text-primary);
  }

  /* Sliders — identical track/thumb to the sidebar's hyper-sliders. */
  .rs-slider {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 6px; border-radius: 3px; outline: none; cursor: pointer; margin: 5px 0;
    background: linear-gradient(to right,
      color-mix(in srgb, var(--slider-color, #10b981) 25%, transparent) 0%,
      var(--slider-color, #10b981) var(--fill, 0%),
      rgba(127, 127, 127, 0.25) var(--fill, 0%),
      rgba(127, 127, 127, 0.25) 100%);
  }
  .rs-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 16px; height: 16px; border-radius: 50%;
    background: white; border: 3px solid var(--slider-color, #10b981);
    cursor: grab; transition: transform 0.15s; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  .rs-slider::-webkit-slider-thumb:hover { transform: scale(1.12); }
  .rs-slider::-moz-range-thumb {
    width: 16px; height: 16px; border-radius: 50%;
    background: white; border: 3px solid var(--slider-color, #10b981); cursor: grab; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  /* Segmented schedule control */
  .rs-seg { display: flex; gap: 3px; padding: 3px; border-radius: 9px; background: rgba(127, 127, 127, 0.1); }
  .rs-seg button {
    flex: 1; padding: 0.3rem 0.2rem; border: none; border-radius: 6px;
    background: transparent; color: var(--color-text-tertiary);
    font-size: 0.68rem; font-weight: 600; cursor: pointer; transition: all 0.15s;
  }
  .rs-seg button:hover { color: var(--color-text-primary); }
  .rs-seg button.on { background: #10b981; color: #fff; }

  /* Day mode: crisp cool recessed track (the flat neutral grey read muddy on
     the light modal); the solid emerald active pill still pops. */
  :global([data-theme='light']) .rs-seg {
    background: rgba(15, 23, 42, 0.05);
    box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.05);
  }
  :global([data-theme='light']) .rs-seg button.on { box-shadow: 0 1px 2px rgba(15, 23, 42, 0.14); }

  .rs-note { margin: 0.5rem 0 0; font-size: 0.74rem; font-style: italic; color: var(--color-text-tertiary); }

  .rs-foot {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.7rem 1rem; border-top: 1px solid var(--color-border); flex-shrink: 0;
  }
  .rs-reset-all {
    padding: 0.4rem 0.7rem; border-radius: 8px; border: 1px solid var(--color-border);
    background: transparent; color: var(--color-text-secondary); font-size: 0.78rem; font-weight: 600; cursor: pointer; transition: all 0.15s;
  }
  .rs-reset-all:hover { border-color: var(--color-text-tertiary); color: var(--color-text-primary); }
  .rs-race {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.45rem 0.95rem; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.5);
    background: rgba(16, 185, 129, 0.14); color: #10b981; font-size: 0.82rem; font-weight: 700; cursor: pointer; transition: all 0.15s;
  }
  .rs-race:hover:not(:disabled) { background: rgba(16, 185, 129, 0.24); border-color: #10b981; }
  .rs-race:disabled { opacity: 0.45; cursor: not-allowed; }

  /* Thin, unobtrusive scrollbars — no permanent chunky gutter. */
  .rs-lineup, .rs-detail { scrollbar-width: thin; scrollbar-color: var(--color-border) transparent; }
  .rs-lineup::-webkit-scrollbar, .rs-detail::-webkit-scrollbar { width: 7px; }
  .rs-lineup::-webkit-scrollbar-track, .rs-detail::-webkit-scrollbar-track { background: transparent; }
  .rs-lineup::-webkit-scrollbar-thumb, .rs-detail::-webkit-scrollbar-thumb {
    background: var(--color-border); border-radius: 999px; border: 2px solid transparent; background-clip: content-box;
  }

  /* ---------- Phone: a bottom sheet with its own one-column layout ----------
     (Paired with the isPhone template branch; ≥561px renders .rs-cols and
     none of these classes, so the desktop panel is untouched.) */
  .rs-modal.rs-sheet {
    top: auto; left: 0; bottom: 0; transform: none;
    width: 100%; max-width: 100%;
    max-height: calc(100dvh - 66px);
    border-radius: 18px 18px 0 0;
    border-left: none; border-right: none; border-bottom: none;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .rs-sheet-body {
    flex: 1; min-height: 0; overflow-y: auto;
    overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
    padding: 0.75rem 0.9rem 1rem;
  }
  .rs-gap-top { margin-top: 1.15rem; }

  /* Lineup: a compact wrap of toggle chips — tap to add/remove. */
  .rs-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .rs-chip {
    display: inline-flex; align-items: center; gap: 0.38rem;
    min-height: 40px; padding: 0.3rem 0.7rem;
    border: 1.5px solid var(--color-border); border-radius: 999px;
    background: transparent; color: var(--color-text-secondary);
    font-size: 0.78rem; font-weight: 600; cursor: pointer;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
  }
  .rs-chip.on {
    border-color: var(--c);
    background: color-mix(in srgb, var(--c) 16%, transparent);
    color: var(--color-text-primary);
  }
  .rs-chip .rs-dot { opacity: 0.55; }
  .rs-chip.on .rs-dot { opacity: 1; }

  /* Tune: the enabled lineup as a swipeable pill row; the focused
     optimizer's sliders render directly beneath. */
  .rs-pills {
    display: flex; gap: 0.4rem; overflow-x: auto;
    padding-bottom: 0.35rem; margin-bottom: 0.55rem;
    overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .rs-pills::-webkit-scrollbar { display: none; }
  .rs-pill {
    display: inline-flex; align-items: center; gap: 0.35rem;
    min-height: 36px; padding: 0.25rem 0.65rem; flex-shrink: 0;
    border: 1.5px solid var(--color-border); border-radius: 999px;
    background: transparent; color: var(--color-text-secondary);
    font-size: 0.75rem; font-weight: 600; cursor: pointer;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
  }
  .rs-pill.on {
    border-color: var(--c);
    background: color-mix(in srgb, var(--c) 20%, transparent);
    color: var(--color-text-primary);
  }

  @media (max-width: 560px) {
    /* Slider thumbs sized for thumbs. */
    .rs-slider { height: 8px; }
    .rs-slider::-webkit-slider-thumb { width: 22px; height: 22px; }
    .rs-slider::-moz-range-thumb { width: 22px; height: 22px; }
  }
</style>
