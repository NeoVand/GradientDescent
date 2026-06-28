<script lang="ts">
  /**
   * The guide figures' "Layers" popover — a compact copy of the app's Loss &
   * Gradient layers control: field (arrows / flow / off), contour toggle,
   * density, and a colormap picker. Owns no state; the parent figure passes the
   * current VizState and a patch callback.
   */
  import { Layers } from 'lucide-svelte';
  import { COLORMAPS, colormapStops, type VizState } from '../utils/guideViz';

  export let state: VizState;
  export let onpatch: (p: Partial<VizState>) => void;
  let open = false;
</script>

<span class="gv-wrap">
  <button
    class="gv-btn"
    class:active={open}
    aria-label="Layers"
    aria-expanded={open}
    title="Layers — gradient field, contours, density, and colormap"
    on:click={() => (open = !open)}
  >
    <Layers size={14} strokeWidth={2.2} />
  </button>
  {#if open}
    <button class="gv-backdrop" aria-label="Close layers" on:click={() => (open = false)}></button>
    <div class="gv-pop" role="menu" aria-label="Layer options">
      <div class="gv-row">
        <span class="gv-label">Field</span>
        <div class="gv-seg">
          <button class:on={state.field === 'arrows'} on:click={() => onpatch({ field: 'arrows' })}>Arrows</button>
          <button class:on={state.field === 'streamlines'} on:click={() => onpatch({ field: 'streamlines' })}>Flow</button>
          <button class:on={state.field === 'off'} on:click={() => onpatch({ field: 'off' })}>Off</button>
        </div>
      </div>
      <div class="gv-row">
        <span class="gv-label">Contours</span>
        <button
          class="gv-switch" class:on={state.contours} role="switch" aria-checked={state.contours}
          aria-label="Contour lines" on:click={() => onpatch({ contours: !state.contours })}
        ><span class="gv-knob"></span></button>
      </div>
      {#if state.field !== 'off' || state.contours}
        <div class="gv-row">
          <span class="gv-label">Density</span>
          <div class="gv-seg">
            <button class:on={state.density === 'sparse'} on:click={() => onpatch({ density: 'sparse' })}>Low</button>
            <button class:on={state.density === 'normal'} on:click={() => onpatch({ density: 'normal' })}>Med</button>
            <button class:on={state.density === 'dense'} on:click={() => onpatch({ density: 'dense' })}>High</button>
          </div>
        </div>
      {/if}
      <div class="gv-divider"></div>
      <div class="gv-row gv-col">
        <span class="gv-label">Colormap</span>
        <div class="gv-cmaps">
          {#each COLORMAPS as cm}
            <button
              class="gv-cmap" class:on={state.colormap === cm}
              style="background: linear-gradient(to right, {colormapStops(cm)});"
              title={cm} aria-label={cm} on:click={() => onpatch({ colormap: cm })}
            ></button>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</span>

<style>
  .gv-wrap { position: absolute; top: 8px; right: 8px; z-index: 6; }
  .gv-btn {
    width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center;
    border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(10, 18, 24, 0.55); color: #e2e8f0; cursor: pointer; padding: 0;
    transition: background 0.15s, color 0.15s;
  }
  .gv-btn:hover, .gv-btn.active { background: rgba(16, 185, 129, 0.55); color: #fff; }
  .gv-backdrop { position: fixed; inset: 0; z-index: 9; background: transparent; border: none; cursor: default; padding: 0; }
  .gv-pop {
    position: absolute; top: 32px; right: 0; z-index: 10;
    width: 190px; padding: 0.65rem 0.7rem;
    background: var(--color-bg-secondary); border: 1px solid var(--color-border);
    border-radius: 10px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
    display: flex; flex-direction: column; gap: 0.5rem;
  }
  .gv-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .gv-row.gv-col { flex-direction: column; align-items: stretch; gap: 0.4rem; }
  .gv-label { font-size: 0.72rem; font-weight: 600; color: var(--color-text-secondary); }
  .gv-seg { display: inline-flex; border: 1px solid var(--color-border); border-radius: 6px; overflow: hidden; }
  .gv-seg button {
    font-size: 0.68rem; padding: 0.2rem 0.42rem; border: none; background: transparent;
    color: var(--color-text-tertiary); cursor: pointer;
  }
  .gv-seg button.on { background: #10b981; color: #fff; }
  .gv-switch {
    width: 34px; height: 18px; border-radius: 9px; border: none;
    background: var(--color-border); position: relative; cursor: pointer; padding: 0; flex-shrink: 0;
  }
  .gv-switch.on { background: #10b981; }
  .gv-knob {
    position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
    border-radius: 50%; background: #fff; transition: left 0.15s;
  }
  .gv-switch.on .gv-knob { left: 18px; }
  .gv-divider { height: 1px; background: var(--color-border); }
  .gv-cmaps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
  .gv-cmap { height: 20px; border-radius: 5px; border: 1px solid var(--color-border); cursor: pointer; padding: 0; }
  .gv-cmap.on { box-shadow: 0 0 0 2px var(--color-bg-secondary), 0 0 0 3.5px #10b981; }
</style>
