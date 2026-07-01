<script lang="ts">
  /**
   * Loss Landscape Component
   *
   * Visualizes the loss surface over parameter space: a heatmap (bright =
   * low loss), contour lines, the gradient vector field, the descent trail,
   * and a draggable marker for the current parameters.
   *
   * All expensive computation lives in lossSceneStore (one cached grid per
   * data/problem pair). This component only *renders*: theme toggles and
   * resizes redraw from the cache; training and drags move marker + trail
   * layers without touching the rest.
   */

  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { contours } from 'd3-contour';
  import {
    datasetStore,
    parametersStore,
    historyStore,
    currentProblemConfig,
    themeStore,
    resetOptimizerState,
    lossSceneStore,
    divergenceStore,
    coachStore,
    clearCoach,
    landscapeViewStore,
    raceStore,
    raceHoverStore,
    trainingStore,
    challengeStore,
    optimizerStore,
    optimizerStateStore,
    markerDragging,
    vizLayersStore,
    basinsEnabledStore,
    COLORMAPS,
    type FieldDensity
  } from '../stores/stores';
  import { gridToImageURL, colormapStops, contourThresholds, CONTOUR_COUNT } from '../utils/lossGrid';
  import { placeStreamlines } from '../utils/streamlines';
  import { poissonDiskSample } from '../utils/poisson';
  import { basinStore, ensureBasins, BASIN_COLORS } from '../utils/basins';
  import { optimizers } from '../utils/optimizers';
  import { runStartStep } from '../utils/trainer';
  import { previewNextStep } from '../utils/preview';
  import {
    computeHessian,
    eigenSym2,
    conditionNumber,
    newtonStep,
    classifyDefiniteness,
    type Hessian2,
    type Eigen2,
    type Definiteness
  } from '../utils/hessian';
  import { canExportVideo, exportRunWebM } from '../utils/replay';
  import type { ModelParameters } from '../types/types';
  import { Mountain, Orbit, Map as MapIcon, Video, Layers } from 'lucide-svelte';
  import { tooltip } from '../utils/tooltip';
  import LossCurve1D from './LossCurve1D.svelte';

  // Component references
  let svgElement: SVGSVGElement | null = null;
  let containerEl: HTMLDivElement;
  let width = 400;
  let height = 400;
  $: view = $landscapeViewStore;
  // Margins shrink on narrow viewports to claw back vertical space
  $: compact = width < 480;
  $: margin = compact
    ? { top: 8, right: 12, bottom: 32, left: 38 }
    : { top: 12, right: 20, bottom: 50, left: 50 };
  $: xLabelOffset = compact ? 26 : 38;
  $: yLabelOffset = compact ? 26 : 35;

  const defaultParameterRange = { min: -7, max: 7 };

  // Loss range for legend
  let minLossValue = 0;
  let maxLossValue = 1;

  // Reactive data
  $: data = $datasetStore.data;
  $: parameters = $parametersStore;
  $: history = $historyStore;
  $: problemConfig = $currentProblemConfig;
  $: theme = $themeStore;
  $: scene = $lossSceneStore;
  $: parameterRange = scene?.range ?? problemConfig?.parameterRange ?? defaultParameterRange;
  // One-parameter problems render as a loss-vs-α curve; the 2D/3D toggle
  // doesn't apply (there is no β axis).
  $: oneParam = problemConfig?.oneParam ?? false;

  // ---------- Visualization layers (field glyph, contours, colormap) ----------
  $: layers = $vizLayersStore;
  // The heatmap is re-tinted from the cached grid whenever the colormap
  // changes — cheap (one 110² canvas), no grid/field recompute.
  $: heatURL = scene ? gridToImageURL(scene.grid, layers.colormap, theme) : '';
  $: legendStops = colormapStops(layers.colormap, 8, theme);
  // Only two settings are exposed (Low → normal, High → dense); 'sparse' is kept
  // for the type/guide but unreachable here. Low = the old medium, High = a touch
  // denser than the old high.
  const DENSITY_RES: Record<FieldDensity, number> = { sparse: 15, normal: 23, dense: 38 };

  // Theme palette for the plot interior. Dark keeps the original values (basins
  // glow bright on a near-black backdrop); day flips to "dark basins on light" —
  // a white backdrop with dark contours/arrows so the plot stays bright and the
  // overlays stay legible. Read from the live data-theme so every draw path
  // (full redraw and the marker-only updates) always uses the current theme.
  type LandPalette = {
    bg: string; contour: string; contourOp: number; field: string; stream: string;
    lens: string; lensDown: string; lensFill: string; ghost: string; ar2: string; basinRing: string;
  };
  const DARK_PAL: LandPalette = {
    bg: '#060913', contour: '#ffffff', contourOp: 0.5, field: '#cdd9f2', stream: '#dbe7fb',
    lens: '#e0f2fe', lensDown: '#f87171', lensFill: '#67e8f9', ghost: '#fbbf24', ar2: '#e2e8f0', basinRing: '#ffffff'
  };
  const LIGHT_PAL: LandPalette = {
    bg: '#ffffff', contour: '#334155', contourOp: 0.5, field: '#475569', stream: '#475569',
    lens: '#0e7490', lensDown: '#dc2626', lensFill: '#0891b2', ghost: '#d97706', ar2: '#475569', basinRing: '#1e293b'
  };
  const curPal = (): LandPalette =>
    document.documentElement.getAttribute('data-theme') === 'dark' ? DARK_PAL : LIGHT_PAL;

  let showLayers = false;
  let layersBtn: HTMLButtonElement;
  // The panel header clips its overflow, so the popover is fixed-positioned
  // from the button's on-screen rect instead of absolutely inside the header.
  let layersPos = { top: 0, right: 0 };
  function toggleLayers() {
    showLayers = !showLayers;
    if (showLayers && layersBtn) {
      const r = layersBtn.getBoundingClientRect();
      layersPos = { top: r.bottom + 8, right: window.innerWidth - r.right };
    }
  }

  $: if (scene) {
    minLossValue = scene.grid.visMin;
    maxLossValue = scene.grid.visMax;
  }

  // Live readout: current parameters and gradient at the marker
  $: trainData = data.filter(d => d.isTraining);
  $: currentGradient = computeGrad(trainData, parameters, problemConfig);
  $: gradMag = currentGradient ? Math.hypot(currentGradient.a, currentGradient.b) : 0;

  // ---------- Curvature lens ----------
  // Local Hessian at the marker: principal-axis ellipse, condition number,
  // and the Newton ghost step. Off by default; persisted per visitor.
  let lensOn = typeof window !== 'undefined' && localStorage.getItem('gd-lens') === '1';

  function toggleLens() {
    lensOn = !lensOn;
    if (typeof window !== 'undefined') localStorage.setItem('gd-lens', lensOn ? '1' : '0');
    updateTrail(); // repaint the marker layer with/without the lens
  }

  interface LensInfo {
    hess: Hessian2;
    eig: Eigen2;
    kappa: number;
    newton: ModelParameters | null;
    type: Definiteness;
  }

  $: lensInfo = computeLensInfo(lensOn, oneParam, parameters, trainData, problemConfig, currentGradient);

  function computeLensInfo(
    on: boolean,
    is1D: boolean,
    params: ModelParameters,
    train: typeof trainData,
    config: typeof problemConfig,
    grad: ModelParameters | null
  ): LensInfo | null {
    if (!on || is1D || !config || !grad) return null;
    if (train.length === 0 && !config.noData) return null;
    const hess = computeHessian(config, train, params);
    if (![hess.h11, hess.h12, hess.h22].every(Number.isFinite)) return null;
    const eig = eigenSym2(hess);
    return {
      hess,
      eig,
      kappa: conditionNumber(eig),
      newton: newtonStep(hess, grad),
      type: classifyDefiniteness(eig)
    };
  }

  // Repaint the marker layer when the lens recomputes outside drags/training
  $: if (svgElement && lensInfo !== undefined && !isDragging) {
    updateTrail();
  }

  function fmtKappa(k: number): string {
    if (!Number.isFinite(k)) return '∞';
    if (k >= 100) return k.toExponential(1).replace('e+', 'e');
    return k.toFixed(1);
  }

  // The definiteness chip in the stats — so κ can't be read as a stretched bowl
  // when the point is actually a saddle.
  const LENS_TYPE_LABEL: Record<Definiteness, string> = {
    bowl: 'bowl', saddle: 'saddle', ridge: 'ridge', flat: 'flat'
  };
  const LENS_TYPE_HINT: Record<Definiteness, string> = {
    bowl: 'Both curvatures positive — a local bowl. Newton (violet) jumps toward its bottom.',
    saddle: 'Curvatures of opposite sign — a saddle/pass. Red dashed = the downhill escape direction.',
    ridge: 'Both curvatures negative — a ridge/local max. Every direction curves downhill (red dashed).',
    flat: 'No measurable curvature here — a plateau. κ is undefined (∞).'
  };

  // ---------- Basins of attraction ----------
  // Color every cell by which minimum plain GD (at the current γ) reaches
  // from there. Computed in a Web Worker, cached per scenario.
  // Toggle lives in a global store so the 3D surface can color by basin too.
  $: basinsOn = $basinsEnabledStore;

  function toggleBasins() {
    basinsEnabledStore.toggle();
  }

  $: basin = $basinStore;
  $: learningRate = $trainingStore.learningRate;

  // Keep the basin map in sync with the visible scenario while the toggle
  // is on (debounced + cached inside ensureBasins).
  // Resolution by cost: analytic surfaces evaluate in nanoseconds, so
  // they get a fine grid (smoother basin boundaries); data problems pay
  // n× per gradient and stay a step coarser.
  $: if (basinsOn && scene && problemConfig) {
    ensureBasins(
      problemConfig.type,
      trainData,
      parameterRange,
      learningRate,
      oneParam,
      oneParam ? 360 : problemConfig.noData ? 220 : 160
    );
  }

  $: basinActive = basinsOn && basin.status === 'ready' && basin.scene !== null && basin.scene.oneParam === oneParam;
  $: basinComputing = basinsOn && basin.status === 'computing';

  // ---------- Run export ----------
  const videoSupported = canExportVideo();
  let exporting = false;
  $: canExport = videoSupported && !exporting && history.length >= 2 && !!scene;

  async function exportRun() {
    if (!canExport || !scene) return;
    exporting = true;
    try {
      await exportRunWebM({
        scene,
        history,
        problemName: problemConfig?.name ?? '',
        isDark: document.documentElement.getAttribute('data-theme') === 'dark'
      });
    } finally {
      exporting = false;
    }
  }

  // ---------- Next-step ghost ----------
  // A dry run of the SELECTED optimizer's next update from the current
  // position — velocity and adaptive state included, schedule applied.
  $: nextPreview = previewNextStep(
    parameters,
    currentGradient,
    $optimizerStore,
    $optimizerStateStore,
    $trainingStore,
    $runStartStep,
    problemConfig,
    trainData
  );

  // Repaint the marker layer whenever the preview moves — this is what
  // makes the ghost track the γ slider, schedule, and optimizer switches
  // live, not just training steps.
  $: if (svgElement && nextPreview !== undefined && !isDragging) {
    updateTrail();
  }

  // ---------- SGD gradient fan ----------
  // With a minibatch selected, the gradient is a random variable: each
  // batch points somewhere slightly different. The fan draws a dozen
  // batch-gradient directions as a faint cloud around the solid −∇ℒ arrow.
  $: batchSize = $trainingStore.batchSize;
  $: fanActive =
    !oneParam && batchSize !== 'all' && trainData.length > 0 && (batchSize as number) < trainData.length;

  // Repaint the marker layer when the batch setting changes
  $: if (svgElement && fanActive !== undefined && !isDragging) {
    updateTrail();
  }

  const FAN_SAMPLES = 12;

  /** Steepest-descent directions of FAN_SAMPLES random minibatches. */
  function batchGradientDirections(): { a: number; b: number }[] {
    if (!fanActive || !problemConfig) return [];
    const bs = batchSize as number;
    const out: { a: number; b: number }[] = [];
    const idx = trainData.map((_, i) => i);
    for (let k = 0; k < FAN_SAMPLES; k++) {
      // Partial Fisher-Yates: only the first bs slots need shuffling
      for (let i = 0; i < bs; i++) {
        const j = i + Math.floor(Math.random() * (idx.length - i));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      const batch = idx.slice(0, bs).map(i => trainData[i]);
      const g = problemConfig.computeGradient(batch, parameters);
      if (Number.isFinite(g.a) && Number.isFinite(g.b)) out.push(g);
    }
    return out;
  }

  function computeGrad(
    train: typeof trainData,
    params: typeof parameters,
    config: typeof problemConfig
  ): ModelParameters | null {
    // Analytic surfaces have no data but a perfectly good gradient.
    if (!config || (train.length === 0 && !config.noData)) return null;
    return config.computeGradient(train, params);
  }

  function fmtParam(v: number): string {
    if (!Number.isFinite(v)) return '—';
    return v.toFixed(3);
  }

  function fmtMag(v: number): string {
    if (!Number.isFinite(v)) return '—';
    if (v === 0) return '0';
    return v >= 0.01 ? v.toFixed(3) : v.toExponential(1);
  }

  /** Signed variant for the 1D slope readout. */
  function fmtSlope(v: number): string {
    if (!Number.isFinite(v)) return '—';
    if (v === 0) return '0';
    const s = Math.abs(v) >= 0.01 ? Math.abs(v).toFixed(3) : Math.abs(v).toExponential(1);
    return (v < 0 ? '−' : '') + s;
  }

  // Full redraw whenever the cached scene, the theme, the basin overlay, or
  // the visualization layers change (all cheap: the heavy work already
  // happened off-thread).
  $: if (svgElement && scene && theme && basinActive !== undefined && layers) {
    redraw();
  }

  // Trail/marker layer updates during training (no full redraw)
  $: if (svgElement && history.length > 0 && !isDragging) {
    updateTrail();
  }

  // Race trails layer follows the race store. Hovering a legend entry spotlights
  // that racer (others dim) — the same mechanism as the guide's race figure,
  // shared via a store so the 3D view reacts to it too.
  $: race = $raceStore;
  $: hover = $raceHoverStore;
  $: if (svgElement && race !== undefined) {
    void hover; // re-highlight the trails when the hovered racer changes
    updateRaceTrails();
  }

  let isDragging = false;
  let markerOffMap = false;

  let resizeTimer: number | null = null;

  onMount(() => {
    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        width = entry.contentRect.width;
        height = entry.contentRect.height;

        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          redraw();
        }, 100);
      }
    });

    resizeObserver.observe(containerEl);

    return () => {
      resizeObserver.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  });

  function makeScales(innerWidth: number, innerHeight: number) {
    const xScale = d3.scaleLinear()
      .domain([parameterRange.min, parameterRange.max])
      .range([0, innerWidth]);
    const yScale = d3.scaleLinear()
      .domain([parameterRange.min, parameterRange.max])
      .range([innerHeight, 0]);
    return { xScale, yScale };
  }

  function redraw() {
    if (!scene || !svgElement) return;

    // Clear previous content
    d3.select(svgElement).selectAll('*').remove();

    const svg = d3.select(svgElement);
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    if (innerWidth <= 0 || innerHeight <= 0) return;

    // Create clipping path
    svg.append('defs')
      .append('clipPath')
      .attr('id', 'gradient-clip-path')
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', innerWidth)
      .attr('height', innerHeight);

    const { xScale, yScale } = makeScales(innerWidth, innerHeight);

    // Add axes
    const xAxis = d3.axisBottom(xScale).tickSizeOuter(0);
    const yAxis = d3.axisLeft(yScale).tickSizeOuter(0);

    // Tick labels and the frame live in the margins, which stay the app's
    // theme — so they keep the readable day/night colors. Only the plot
    // *interior* (background, field, contours) is forced dark below.
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const axisColor = isDark ? '#527a75' : '#064e3b';

    // Bottom axis
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call(sel => sel.selectAll('line').attr('stroke', axisColor))
      .call(sel => sel.selectAll('path').attr('stroke', axisColor).attr('stroke-width', 1))
      .call(sel => sel.selectAll('text').attr('fill', axisColor));

    // Left axis
    g.append('g')
      .attr('class', 'y-axis')
      .call(yAxis)
      .call(sel => sel.selectAll('line').attr('stroke', axisColor))
      .call(sel => sel.selectAll('path').attr('stroke', axisColor).attr('stroke-width', 1))
      .call(sel => sel.selectAll('text').attr('fill', axisColor));

    // Top axis (frame - no ticks)
    g.append('g')
      .attr('class', 'x-axis-top')
      .call(d3.axisTop(xScale).tickSizeOuter(0).tickSize(0).tickFormat(() => ''))
      .call(sel => sel.selectAll('line').remove())
      .call(sel => sel.select('.domain').attr('stroke', axisColor).attr('stroke-width', 1));

    // Right axis (frame - no ticks)
    g.append('g')
      .attr('class', 'y-axis-right')
      .attr('transform', `translate(${innerWidth},0)`)
      .call(d3.axisRight(yScale).tickSizeOuter(0).tickSize(0).tickFormat(() => ''))
      .call(sel => sel.selectAll('line').remove())
      .call(sel => sel.select('.domain').attr('stroke', axisColor).attr('stroke-width', 1));

    // Add axis labels (Greek letters)
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + xLabelOffset)
      .attr('fill', axisColor)
      .attr('font-size', '14px')
      .attr('font-weight', '400')
      .attr('font-style', 'italic')
      .attr('font-family', 'Georgia, serif')
      .style('text-anchor', 'middle')
      .text('α');

    g.append('text')
      .attr('x', -yLabelOffset)
      .attr('y', innerHeight / 2)
      .attr('fill', axisColor)
      .attr('font-size', '14px')
      .attr('font-weight', '400')
      .attr('font-style', 'italic')
      .attr('font-family', 'Georgia, serif')
      .style('text-anchor', 'middle')
      .text('β');

    // Plot interior: near-black in dark mode (basins glow), white in day mode
    // (the "dark basins on light" heatmap fades its far field into it).
    g.insert('rect', ':first-child')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', curPal().bg)
      .attr('rx', 4);

    // Create clipped group for landscape content
    const clippedGroup = g.append('g')
      .attr('clip-path', 'url(#gradient-clip-path)')
      .attr('transform', `translate(${-margin.left},${-margin.top})`);

    const plotGroup = clippedGroup.append('g')
      .attr('class', 'plot-group')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Heatmap: single pre-rendered image, stretched over the extended range
    drawHeatmapImage(plotGroup, xScale, yScale);

    // Contour lines (above the heatmap)
    drawContours(plotGroup, xScale, yScale);

    // Gradient field — arrows or flowing streamlines, drawn LAST of the field
    // layers so they sit on top of both the heatmap and the contours.
    // Always dark-styled: these ride on the dark plot interior, not the margins.
    drawGradients(plotGroup, xScale, yScale);
    drawStreamlines(plotGroup, xScale, yScale);

    // Basin destination dots (above contours so each region's target pops)
    drawBasinMinima(plotGroup, xScale, yScale);

    // AR(2) Rollout: the stationarity triangle — the rollout loss climbs
    // like ρ^2k outside it, so the dashed edge traces the visible cliff.
    // (The one-step AR(2) stays clean: its quadratic valley needs no map.)
    if (problemConfig?.type === 'ar2-rollout') {
      const tri = [
        [0, 1],
        [2, -1],
        [-2, -1]
      ] as const;
      plotGroup.append('path')
        .attr('d', `M ${tri.map(([a, b]) => `${xScale(a)},${yScale(b)}`).join(' L ')} Z`)
        .attr('fill', 'none')
        .attr('stroke', curPal().ar2)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '7,5')
        .style('opacity', 0.75);
      plotGroup.append('text')
        .attr('x', xScale(0))
        .attr('y', yScale(-0.55))
        .attr('fill', curPal().ar2)
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('letter-spacing', '0.08em')
        .style('text-anchor', 'middle')
        .style('opacity', 0.7)
        .text('STABLE');
    }

    // Training path with fade effect (above contours, below marker)
    drawTrainingPath(plotGroup, xScale, yScale);

    // Current position last (in main group: never clipped, but clamped)
    drawCurrentPosition(g, xScale, yScale, innerWidth, innerHeight);

    // Restore race trails after a full rebuild (theme/resize mid-race)
    updateRaceTrails();
  }

  /** Colored per-optimizer trails + head dots while a race is running. */
  function updateRaceTrails() {
    if (!svgElement) return;
    const svg = d3.select(svgElement);
    const plotGroup = svg.select<SVGGElement>('.plot-group');
    if (plotGroup.empty()) return;

    plotGroup.selectAll('.race-layer').remove();
    if (!race) return;

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const { xScale, yScale } = makeScales(innerWidth, innerHeight);
    const layer = plotGroup.append('g').attr('class', 'race-layer');

    const lineGen = d3.line<ModelParameters>()
      .x(p => xScale(p.a))
      .y(p => yScale(p.b));

    for (const r of race.racers) {
      const hot = hover === r.id;
      const dim = hover !== null && !hot;
      if (r.trail.length >= 2) {
        layer.append('path')
          .attr('d', lineGen(r.trail))
          .attr('fill', 'none')
          .attr('stroke', r.color)
          .attr('stroke-width', hot ? 3.4 : 2.2)
          .attr('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round')
          .style('opacity', r.diverged ? (dim ? 0.12 : 0.3) : hot ? 1 : dim ? 0.12 : 0.9);
      }
      // Pin a head that has wandered off the visible frame to the edge with a
      // dashed, faded look — exactly how the training marker handles off-map
      // positions — instead of letting the clip swallow it whole.
      const head = r.trail[r.trail.length - 1];
      const rad = r.finished ? 5.5 : 4.5;
      const rawX = xScale(head.a);
      const rawY = yScale(head.b);
      const offMap =
        !Number.isFinite(rawX) || !Number.isFinite(rawY) ||
        rawX < 0 || rawX > innerWidth || rawY < 0 || rawY > innerHeight;
      const cx = Math.max(rad, Math.min(innerWidth - rad, Number.isFinite(rawX) ? rawX : innerWidth / 2));
      const cy = Math.max(rad, Math.min(innerHeight - rad, Number.isFinite(rawY) ? rawY : innerHeight / 2));
      layer.append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', hot ? rad + 1.4 : rad)
        .attr('fill', r.color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.2)
        .attr('stroke-dasharray', offMap ? '3,2.5' : null)
        .style('opacity', r.diverged ? (dim ? 0.18 : 0.35) : hot ? 1 : dim ? 0.12 : offMap ? 0.7 : 1);
    }
  }

  function drawHeatmapImage(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) {
    if (!scene) return;

    if (basinActive && basin.scene) {
      // Basin mode: categorical destination map over the VISIBLE range
      // (the basin grid isn't extended). Pixelated on purpose — smoothing
      // would blend category colors into lies at the boundaries.
      g.append('image')
        .attr('href', basin.scene.imageURL)
        .attr('x', xScale(parameterRange.min))
        .attr('y', yScale(parameterRange.max))
        .attr('width', xScale(parameterRange.max) - xScale(parameterRange.min))
        .attr('height', yScale(parameterRange.min) - yScale(parameterRange.max))
        .attr('preserveAspectRatio', 'none')
        .style('image-rendering', 'pixelated');
      return;
    }

    const { extMin, extMax } = scene.grid;
    g.append('image')
      .attr('href', heatURL || scene.imageURL)
      .attr('x', xScale(extMin))
      .attr('y', yScale(extMax))
      .attr('width', xScale(extMax) - xScale(extMin))
      .attr('height', yScale(extMin) - yScale(extMax))
      .attr('preserveAspectRatio', 'none');
  }

  /** Destination dots: one ringed dot per basin, colored like its region. */
  function drawBasinMinima(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) {
    if (!basinActive || !basin.scene) return;
    basin.scene.minima.forEach((m, i) => {
      g.append('circle')
        .attr('class', 'basin-minimum')
        .attr('cx', xScale(m.a))
        .attr('cy', yScale(m.b))
        .attr('r', 4.5)
        .attr('fill', BASIN_COLORS[i % BASIN_COLORS.length])
        .attr('stroke', curPal().basinRing)
        .attr('stroke-width', 1.8);
    });
  }

  function drawContours(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) {
    if (!scene || !layers.contours) return;
    const { res, extMin, extMax, values } = scene.grid;
    const extSpan = extMax - extMin;
    // Density also sets how many rings to draw (re-derived from the grid's log
    // range, so no recompute is needed).
    const thresholds = contourThresholds(scene.grid, CONTOUR_COUNT[layers.density] ?? 16);

    const contourGenerator = contours()
      .size([res, res])
      .smooth(true)
      .thresholds(thresholds);

    const contourData = contourGenerator(values as unknown as number[]);

    const pathGenerator = d3.geoPath()
      .projection(d3.geoTransform({
        point: function (x, y) {
          // Contour coordinates live in grid space [0, res]; samples sit at
          // cell centers, so x / res maps back to parameter space exactly.
          const paramA = extMin + (x / res) * extSpan;
          const paramB = extMin + (y / res) * extSpan;
          this.stream.point(xScale(paramA), yScale(paramB));
        }
      }));

    const pal = curPal();
    g.selectAll('.contour')
      .data(contourData)
      .enter()
      .append('path')
      .attr('class', 'contour')
      .attr('d', pathGenerator)
      .attr('fill', 'none')
      .attr('stroke', pal.contour)
      .attr('stroke-width', 1.5)
      .style('opacity', pal.contourOp);
  }

  function drawTrainingPath(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) {
    if (history.length < 2) return;

    // Get last 100 points
    const windowSize = 100;
    const recentHistory = history.slice(Math.max(0, history.length - windowSize));

    // Draw path with gradient fade effect (always fades from old to new)
    for (let i = 0; i < recentHistory.length - 1; i++) {
      const current = recentHistory[i];
      const next = recentHistory[i + 1];

      // Calculate progress (0 = oldest, 1 = newest)
      const progress = i / (recentHistory.length - 1);

      // Opacity fades from nearly invisible to visible
      const opacity = 0.05 + progress * 0.75; // 0.05 to 0.8

      // Thickness increases from thin to thick (almost as thick as handle)
      const thickness = 2 + progress * 10; // 2 to 12 (handle is ~20px diameter)

      g.append('line')
        .attr('class', 'path-segment')
        .attr('x1', xScale(current.parameters.a))
        .attr('y1', yScale(current.parameters.b))
        .attr('x2', xScale(next.parameters.a))
        .attr('y2', yScale(next.parameters.b))
        .attr('stroke', '#ef4444')
        .attr('stroke-width', thickness)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .style('opacity', opacity);
    }
  }

  function drawGradients(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) {
    if (!scene || layers.field !== 'arrows' || !problemConfig) return;

    // Blue-noise (Poisson-disk) arrow placement — even spread with no grid
    // rows, like the streamlines. The layout is stable for a given domain +
    // density, so arrows don't reshuffle when the marker moves or data changes.
    const span = parameterRange.max - parameterRange.min;
    const res = DENSITY_RES[layers.density] ?? 23;
    const cfg = problemConfig;
    const data = trainData;
    let maxMag = 0;
    const arrows = poissonDiskSample(parameterRange.min, parameterRange.max, span / res).map(p => {
      const gr = cfg.computeGradient(data, { a: p.x, b: p.y });
      const mag = Math.hypot(gr.a, gr.b);
      if (Number.isFinite(mag) && mag > maxMag) maxMag = mag;
      return { a: p.x, b: p.y, ga: gr.a, gb: gr.b, mag };
    });
    if (!arrows.length || !(maxMag > 0)) return;

    // Cool-white lines on the dark canvas; a dark slate on the day canvas.
    // Magnitude still fades the faint ones down.
    const arrowColor = curPal().field;
    const baseOpacity = 0.42;
    const spanOpacity = 0.5;

    const defs = g.append('defs');
    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 4.5)
      .attr('markerHeight', 4.5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', arrowColor);

    // Length ∝ magnitude with no floor: flat regions get tiny faint marks and
    // steep regions get bold ones, so the field declutters itself instead of
    // showing a uniform 12px lattice everywhere.
    const MAX_LEN = 18;

    for (const item of arrows) {
      const { a, b, ga, gb, mag } = item;
      const norm = maxMag > 0 ? mag / maxMag : 0;

      const x = xScale(a);
      const y = yScale(b);

      const normGradA = -ga / mag;
      const normGradB = -gb / mag;

      const arrowLength = 2 + (MAX_LEN - 2) * norm;
      const x2 = x + normGradA * arrowLength;
      const y2 = y - normGradB * arrowLength; // SVG y is inverted

      g.append('line')
        .attr('class', 'gradient-arrow')
        .attr('x1', x)
        .attr('y1', y)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('stroke', arrowColor)
        .attr('stroke-width', 0.7 + norm * 1.1)
        .attr('marker-end', 'url(#arrowhead)')
        .style('opacity', baseOpacity + norm * spanOpacity);
    }
  }

  /**
   * Streamlines of the −∇ℒ flow, placed evenly by farthest-point seeding
   * (utils/streamlines): each new line fills the biggest remaining void, so
   * coverage is uniform and lines run all the way into the basins instead of
   * stopping short. No animation — plateaus thin out, walls bunch up, basins
   * are where the lines converge.
   */
  function drawStreamlines(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) {
    if (!scene || layers.field !== 'streamlines' || !problemConfig) return;
    const range = parameterRange;
    const span = range.max - range.min;
    const sepDiv = ({ sparse: 20, normal: 30, dense: 64 } as Record<FieldDensity, number>)[layers.density] ?? 30;

    const cfg = problemConfig;
    const data = trainData;
    const lines = placeStreamlines(
      { min: range.min, max: range.max, gradient: (a, b) => cfg.computeGradient(data, { a, b }) },
      { dSep: span / sepDiv }
    );

    const lineGen = d3.line<ModelParameters>()
      .x(p => xScale(p.a))
      .y(p => yScale(p.b))
      .curve(d3.curveCatmullRom.alpha(0.5));

    // Clean white lines on the dark canvas — no gray core, no dark halo (the
    // 3D view does the same). The black SVG backdrop gives them all the
    // contrast they need over both the basins and the peaks.
    const streamColor = curPal().stream;
    for (const line of lines) {
      g.append('path')
        .attr('class', 'streamline')
        .attr('d', lineGen(line))
        .attr('fill', 'none')
        .attr('stroke', streamColor)
        .attr('stroke-width', 1.05)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .style('opacity', 0.62);
    }
  }

  /**
   * Place the marker, clamping to the plot frame. When the true position is
   * outside the visible range (e.g. mid-divergence), the marker pins to the
   * edge and switches to a dashed "off-map" look instead of floating over
   * axes and headers.
   */
  function positionMarker(
    marker: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    innerWidth: number,
    innerHeight: number
  ) {
    const rawX = xScale(parameters.a);
    const rawY = yScale(parameters.b);
    const x = Math.max(0, Math.min(innerWidth, Number.isFinite(rawX) ? rawX : 0));
    const y = Math.max(0, Math.min(innerHeight, Number.isFinite(rawY) ? rawY : 0));
    const offMap = x !== rawX || y !== rawY;

    marker.attr('transform', `translate(${x}, ${y})`);
    marker.select('.marker-ring')
      .attr('stroke-dasharray', offMap ? '4,3' : null)
      .style('opacity', offMap ? 0.7 : 1);
    marker.select('.marker-dot').style('opacity', offMap ? 0.7 : 1);
    // A pinned-to-the-edge marker isn't at its true position — local
    // curvature there would be misleading (drawLens checks this flag).
    markerOffMap = offMap;

    updateMarkerVectors(marker, xScale, yScale);
  }

  /**
   * Two direction arrows anchored at the marker:
   *  - blue: steepest descent (−∇ℒ) at the current position
   *  - red:  the actual last update (Δθ, from history)
   * For plain GD they coincide; for momentum and adaptive optimizers they
   * visibly part ways — that gap IS the optimizer. Directions are computed
   * in screen space so anisotropic plots keep faithful angles.
   */
  function updateMarkerVectors(
    marker: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) {
    const kx = xScale(1) - xScale(0);
    const ky = yScale(0) - yScale(1);

    // Arrows are sized by magnitude (not pinned to a fixed length), so they
    // shrink toward a dot as the run converges — only the angle carries
    // meaning when both are short. Below ARROW_HIDE px they vanish.
    const ARROW_HIDE = 2.5;
    const GRAD_MAX_LEN = 42; // −∇ℒ length at the steepest point on the field
    const STEP_MAX_LEN = 46; // cap Δθ so a bold first step still fits the frame

    const setVec = (
      sel: d3.Selection<d3.BaseType, unknown, null, undefined>,
      sx: number,
      sy: number,
      len: number
    ) => {
      const m = Math.hypot(sx, sy);
      if (!Number.isFinite(m) || m < 1e-9 || len < ARROW_HIDE) {
        sel.style('display', 'none');
        return;
      }
      sel.style('display', null)
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', (sx / m) * len)
        .attr('y2', (sy / m) * len);
    };

    // Steepest descent −∇ℒ: length ∝ how steep it is here relative to the
    // steepest point on the visible field (the same normalization the field
    // arrows use), so it's a bold field arrow at the marker — and it fades
    // out at a minimum where the gradient goes to zero.
    const g = currentGradient;
    const fieldMaxMag = scene?.field?.maxMag ?? 0;
    const gradFrac = fieldMaxMag > 0 && gradMag > 0 ? Math.min(1.3, gradMag / fieldMaxMag) : 0;
    setVec(
      marker.select('.vec-grad'),
      g ? -g.a * kx : 0,
      g ? g.b * ky : 0,
      gradFrac * GRAD_MAX_LEN
    );

    // Last actual update Δθ: the literal screen distance the marker moved last
    // step (clamped), so it grows with a bold step and disappears at convergence.
    const n = history.length;
    if (n >= 2) {
      const da = history[n - 1].parameters.a - history[n - 2].parameters.a;
      const db = history[n - 1].parameters.b - history[n - 2].parameters.b;
      const stepPx = Math.hypot(da * kx, db * ky);
      setVec(marker.select('.vec-upd'), da * kx, -db * ky, Math.min(STEP_MAX_LEN, stepPx));
    } else {
      marker.select('.vec-upd').style('display', 'none');
    }

    drawLens(marker, kx, ky);
    drawFan(marker, kx, ky);
    drawGhost(marker, kx, ky);
  }

  /** Dashed circle at the optimizer's predicted next position. */
  function drawGhost(
    marker: d3.Selection<SVGGElement, unknown, null, undefined>,
    kx: number,
    ky: number
  ) {
    const layer = marker.select<SVGGElement>('.ghost-layer');
    if (layer.empty()) return;
    layer.selectAll('*').remove();
    if (!nextPreview || markerOffMap || race) return;

    const dx = (nextPreview.a - parameters.a) * kx;
    const dy = -(nextPreview.b - parameters.b) * ky;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    // Converged (or a microscopic step): no ghost — it would just sit
    // under the marker.
    if (Math.hypot(dx, dy) < 4) return;

    const ghost = curPal().ghost;
    layer.append('line')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', dx).attr('y2', dy)
      .attr('stroke', ghost)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '3,3')
      .style('opacity', 0.8);
    layer.append('circle')
      .attr('cx', dx).attr('cy', dy)
      .attr('r', 7)
      .attr('fill', 'rgba(251, 191, 36, 0.15)')
      .attr('stroke', ghost)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4,3')
      .style('opacity', 1);
    layer.append('circle')
      .attr('cx', dx).attr('cy', dy)
      .attr('r', 1.8)
      .attr('fill', ghost);
  }

  /** The minibatch noise cloud: faint −∇ℒ_batch rays around the marker. */
  function drawFan(
    marker: d3.Selection<SVGGElement, unknown, null, undefined>,
    kx: number,
    ky: number
  ) {
    const layer = marker.select<SVGGElement>('.fan-layer');
    if (layer.empty()) return;
    layer.selectAll('*').remove();
    if (!fanActive || markerOffMap) return;

    for (const g of batchGradientDirections()) {
      const sx = -g.a * kx;
      const sy = g.b * ky;
      const m = Math.hypot(sx, sy);
      if (m < 1e-12) continue;
      layer.append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', (sx / m) * 30)
        .attr('y2', (sy / m) * 30)
        .attr('stroke', '#3b82f6')
        .attr('stroke-width', 1.4)
        .attr('stroke-linecap', 'round')
        .style('opacity', 0.18);
    }
  }

  /**
   * The curvature lens at the marker. The drawing matches the local shape:
   *  - bowl   : a level-set ellipse (computed in SCREEN space, so it lines up
   *             with the contours even when the α/β pixel scales differ) plus a
   *             violet Newton arrow drawn at TRUE scale — it visibly jumps toward
   *             the bowl's bottom, the contrast against steepest-descent −∇ℒ.
   *  - saddle : the two principal axes — solid = the uphill wall, red dashed =
   *             the downhill escape direction.
   *  - ridge  : both axes red dashed (every direction curves down).
   *  - flat   : nothing (κ reads ∞ in the stats).
   */
  function drawLens(
    marker: d3.Selection<SVGGElement, unknown, null, undefined>,
    kx: number,
    ky: number
  ) {
    const layer = marker.select<SVGGElement>('.lens-layer');
    if (layer.empty()) return;
    layer.selectAll('*').remove();
    if (!lensInfo || markerOffMap || lensInfo.type === 'flat') return;

    const { hess, newton, type } = lensInfo;

    // Curvature as it appears ON SCREEN: H_screen = M⁻ᵀ H M⁻¹ with the
    // (anisotropic) param→pixel map M = diag(kx, −ky). Its eigenvectors are the
    // on-screen principal axes; eigenvalues keep H's signs (Sylvester inertia).
    const Hs: Hessian2 = {
      h11: hess.h11 / (kx * kx),
      h12: -hess.h12 / (kx * ky),
      h22: hess.h22 / (ky * ky)
    };
    const es = eigenSym2(Hs);
    const absS1 = Math.abs(es.lambda1); // larger |λ| → steep screen axis
    const absS2 = Math.abs(es.lambda2); // smaller |λ| → shallow screen axis
    if (absS1 < 1e-12) return;

    const R_MAX = 40, R_MIN = 4;
    const rSteep = Math.max(R_MIN, R_MAX * Math.sqrt(absS2 / absS1)); // along v1
    const rShallow = R_MAX; // along v2
    const angOf = (v: [number, number]) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;

    const lensPal = curPal();
    if (type === 'bowl') {
      // Level-set ellipse: long (shallow, v2) axis = R_MAX, short (steep) = rSteep.
      layer.append('ellipse')
        .attr('rx', rShallow)
        .attr('ry', rSteep)
        .attr('transform', `rotate(${angOf(es.v2)})`)
        .attr('fill', lensPal.lensFill)
        .attr('fill-opacity', 0.06)
        .attr('stroke', lensPal.lens)
        .attr('stroke-width', 1.4)
        .style('opacity', 0.85);
    } else {
      // saddle / ridge: principal axes, red dashed where curvature is downhill.
      const drawAxis = (v: [number, number], r: number, lam: number) => {
        const down = lam < 0;
        layer.append('line')
          .attr('x1', -r).attr('x2', r).attr('y1', 0).attr('y2', 0)
          .attr('transform', `rotate(${angOf(v)})`)
          .attr('stroke', down ? lensPal.lensDown : lensPal.lens)
          .attr('stroke-width', 1.7)
          .attr('stroke-dasharray', down ? '6,4' : null)
          .attr('stroke-linecap', 'round')
          .style('opacity', down ? 0.9 : 0.8);
      };
      drawAxis(es.v1, rSteep, es.lambda1);
      drawAxis(es.v2, rShallow, es.lambda2);
    }

    // Newton step −H⁻¹∇ℒ, drawn at TRUE screen scale (capped), only where it
    // actually minimizes (a bowl). Length shows how far one second-order jump
    // lands — short near the bottom, a bold leap from up the wall.
    if (type === 'bowl' && newton) {
      const sx = newton.a * kx;
      const sy = -newton.b * ky;
      const L = Math.hypot(sx, sy);
      if (Number.isFinite(L) && L > 1e-9) {
        const CAP = 72;
        const s = Math.min(L, CAP) / L;
        layer.append('line')
          .attr('x1', 0).attr('y1', 0)
          .attr('x2', sx * s).attr('y2', sy * s)
          .attr('stroke', '#8b5cf6')
          .attr('stroke-width', 2.5)
          .attr('stroke-dasharray', '5,3')
          .attr('stroke-linecap', 'round')
          .attr('marker-end', 'url(#vec-newton-head)')
          .style('opacity', 0.95);
      }
    }
  }

  function drawCurrentPosition(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    innerWidth: number,
    innerHeight: number
  ) {
    // Arrowheads for the marker's direction vectors
    const defs = g.append('defs');
    for (const [id, color] of [
      ['vec-grad-head', '#3b82f6'],
      ['vec-upd-head', '#ef4444'],
      ['vec-newton-head', '#8b5cf6']
    ] as const) {
      defs.append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 8)
        .attr('refY', 0)
        .attr('markerWidth', 4.5)
        .attr('markerHeight', 4.5)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color);
    }

    const marker = g.append('g')
      .attr('class', 'current-position')
      .style('touch-action', 'none');

    // Invisible hit area: makes the marker tappable on touch screens (≈44px)
    marker.append('circle')
      .attr('class', 'hit-area')
      .attr('r', 22)
      .attr('fill', 'transparent')
      .style('cursor', 'grab')
      .style('touch-action', 'none');

    // Curvature lens (under the rings and arrows; filled by updateMarkerVectors)
    marker.append('g')
      .attr('class', 'lens-layer')
      .style('pointer-events', 'none');

    // SGD gradient fan (under the solid arrows)
    marker.append('g')
      .attr('class', 'fan-layer')
      .style('pointer-events', 'none');

    // Next-step ghost (dashed preview of the optimizer's landing point)
    marker.append('g')
      .attr('class', 'ghost-layer')
      .style('pointer-events', 'none');

    // Direction vectors (under the ring, above the hit area). Blue =
    // steepest descent −∇ℒ; red = the optimizer's actual last step Δθ.
    marker.append('line')
      .attr('class', 'vec-grad')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2.5)
      .attr('stroke-linecap', 'round')
      .attr('marker-end', 'url(#vec-grad-head)')
      .style('opacity', 0.95)
      .style('pointer-events', 'none');

    marker.append('line')
      .attr('class', 'vec-upd')
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 2.5)
      .attr('stroke-linecap', 'round')
      .attr('marker-end', 'url(#vec-upd-head)')
      .style('opacity', 0.95)
      .style('pointer-events', 'none');

    // Outer ring
    marker.append('circle')
      .attr('class', 'marker-ring')
      .attr('r', 10)
      .attr('fill', 'none')
      .attr('stroke', '#f59e0b')
      .attr('stroke-width', 2)
      .style('pointer-events', 'none');

    // Inner circle
    marker.append('circle')
      .attr('class', 'marker-dot')
      .attr('r', 6)
      .attr('fill', '#f59e0b')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('pointer-events', 'none');

    positionMarker(marker, xScale, yScale, innerWidth, innerHeight);

    // Make draggable (force touch support so it works on mobile regardless
    // of the viewport's touch detection at render time)
    marker.call(d3.drag<SVGGElement, unknown>()
      .touchable(() => true)
      .on('start', function () {
        isDragging = true;
        // Hold any running (esp. continuous/∞) training so the marker
        // tracks the cursor cleanly; it resumes and springs back on release.
        markerDragging.set(true);
        // Drag means the user is restarting from a new position, so any
        // accumulated optimizer state (velocity, moment estimates) from
        // prior steps shouldn't carry over — and any divergence warning
        // or coach verdict is now stale.
        resetOptimizerState();
        divergenceStore.set(null);
        clearCoach();
        d3.select(this).style('cursor', 'grabbing');
      })
      .on('drag', function (event) {
        // Convert pixel coordinates to parameter values
        const newA = xScale.invert(event.x);
        const newB = yScale.invert(event.y);

        // Clamp to valid range
        const clampedA = Math.max(parameterRange.min, Math.min(parameterRange.max, newA));
        const clampedB = Math.max(parameterRange.min, Math.min(parameterRange.max, newB));

        // Update position immediately (visual feedback)
        d3.select(this)
          .attr('transform', `translate(${xScale(clampedA)}, ${yScale(clampedB)})`);

        // Update parameters store (will trigger other diagrams to update)
        parametersStore.set({ a: clampedA, b: clampedB });

        // Add to history
        const train = data.filter(d => d.isTraining);
        const test = data.filter(d => !d.isTraining);
        const nextStep = history.length > 0 ? history[history.length - 1].step + 1 : 0;

        historyStore.addPoint({
          step: nextStep,
          trainLoss: problemConfig.computeLoss(train, { a: clampedA, b: clampedB }),
          testLoss: problemConfig.computeLoss(test, { a: clampedA, b: clampedB }),
          parameters: { a: clampedA, b: clampedB }
        });

        // Manually update the trail during dragging
        const svg = d3.select(svgElement);
        const plotGroup = svg.select<SVGGElement>('.plot-group');
        if (!plotGroup.empty()) {
          plotGroup.selectAll('.path-segment').remove();
          drawTrainingPath(plotGroup, xScale, yScale);
        }

        // Keep the marker's direction vectors live while dragging
        updateMarkerVectors(d3.select(this), xScale, yScale);
      })
      .on('end', function () {
        isDragging = false;
        markerDragging.set(false);
        d3.select(this).style('cursor', 'grab');
      }));
  }

  function updateTrail() {
    if (!svgElement) return;
    // Only update the trail without redrawing everything
    const svg = d3.select(svgElement);
    const plotGroup = svg.select<SVGGElement>('.plot-group');

    if (plotGroup.empty()) return;

    // Remove old trail
    plotGroup.selectAll('.path-segment').remove();

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const { xScale, yScale } = makeScales(innerWidth, innerHeight);

    // Redraw trail
    drawTrainingPath(plotGroup, xScale, yScale);

    // Update marker position (clamped to the frame)
    const marker = svg.select<SVGGElement>('.current-position');
    if (!marker.empty()) {
      positionMarker(marker, xScale, yScale, innerWidth, innerHeight);
    }
  }
</script>

<div class="gradient-container">
  <div class="header">
    <div class="header-left">
      <h2>
        <Mountain size={20} strokeWidth={2} />
        <span>Loss & Gradient</span>
      </h2>
      {#if !oneParam}
        <div class="view-toggle" role="group" aria-label="Landscape view" data-tour="landscape-view-toggle">
          <button
            class:active={view === '2d'}
            on:click={() => landscapeViewStore.set('2d')}
          >2D</button>
          <button
            class:active={view === '3d'}
            on:click={() => landscapeViewStore.set('3d')}
          >3D</button>
        </div>
      {/if}
    </div>
    <div class="header-tools" role="toolbar" aria-label="Landscape tools" data-tour="landscape-tools">
        <span class="layers-control">
          <button
            class="tool-btn"
            class:active={showLayers}
            bind:this={layersBtn}
            use:tooltip={'Layers — show or hide the gradient field and contours, change density, and pick a colormap'}
            aria-label="Layers"
            aria-expanded={showLayers}
            on:click={toggleLayers}
          >
            <Layers size={15} strokeWidth={2.2} />
          </button>
          {#if showLayers}
            <button class="layers-backdrop" aria-label="Close layers" on:click={() => (showLayers = false)}></button>
            <div class="layers-pop" role="menu" aria-label="Layer options" style="top: {layersPos.top}px; right: {layersPos.right}px;">
              <div class="lp-row">
                <span class="lp-label">Field</span>
                <div class="lp-seg">
                  <button class:on={layers.field === 'arrows'} on:click={() => vizLayersStore.patch({ field: 'arrows' })}>Arrows</button>
                  <button class:on={layers.field === 'streamlines'} on:click={() => vizLayersStore.patch({ field: 'streamlines' })}>Flow</button>
                  <button class:on={layers.field === 'off'} on:click={() => vizLayersStore.patch({ field: 'off' })}>Off</button>
                </div>
              </div>
              <div class="lp-row">
                <span class="lp-label">Contours</span>
                <button
                  class="lp-switch"
                  class:on={layers.contours}
                  role="switch"
                  aria-checked={layers.contours}
                  aria-label="Contour lines"
                  on:click={() => vizLayersStore.patch({ contours: !layers.contours })}
                ><span class="lp-knob"></span></button>
              </div>
              {#if layers.field !== 'off' || layers.contours}
                <div class="lp-row">
                  <span class="lp-label">Density</span>
                  <div class="lp-seg">
                    <button class:on={layers.density !== 'dense'} on:click={() => vizLayersStore.patch({ density: 'normal' })}>Low</button>
                    <button class:on={layers.density === 'dense'} on:click={() => vizLayersStore.patch({ density: 'dense' })}>High</button>
                  </div>
                </div>
              {/if}
              <div class="lp-divider"></div>
              <div class="lp-row lp-col">
                <span class="lp-label">Colormap</span>
                <div class="lp-cmaps">
                  {#each COLORMAPS as cm}
                    <button
                      class="lp-cmap"
                      class:on={layers.colormap === cm}
                      style="background: linear-gradient(to right, {colormapStops(cm)});"
                      aria-label={cm}
                      title={cm}
                      on:click={() => vizLayersStore.patch({ colormap: cm })}
                    ></button>
                  {/each}
                </div>
              </div>
            </div>
          {/if}
        </span>
        <!-- Curvature lens: a 2D-only overlay (the Hessian ellipse is drawn on
             the SVG plot), so it stays gated to the 2D view. -->
        {#if view === '2d' && !oneParam}
          <button
            class="tool-btn"
            class:active={lensOn}
            use:tooltip={"Curvature lens — the local Hessian's ellipse at the marker, condition number κ, and the Newton step a second-order method would take"}
            aria-label="Curvature lens"
            aria-pressed={lensOn}
            on:click={toggleLens}
          >
            <Orbit size={15} strokeWidth={2.2} />
          </button>
        {/if}
        <!-- Basins of attraction work in every view (2D heatmap, 1D curve, and
             now the colorized 3D surface), so the toggle is always available. -->
        <button
          class="tool-btn"
          class:active={basinsOn}
          use:tooltip={'Basins of attraction — every point colored by WHICH minimum plain gradient descent (at the current γ) reaches from there. Same color = same destination.'}
          aria-label="Basins of attraction"
          aria-pressed={basinsOn}
          on:click={toggleBasins}
        >
          {#if basinComputing}
            <span class="tool-spinner" aria-hidden="true"></span>
          {:else}
            <MapIcon size={15} strokeWidth={2.2} />
          {/if}
        </button>
        <!-- Video export records the 2D canvas — 2D, multi-parameter only. -->
        {#if view === '2d' && videoSupported && !oneParam}
          <button
            class="tool-btn"
            disabled={!canExport}
            use:tooltip={exporting
              ? 'Recording…'
              : canExport
                ? 'Export the last run as a WebM video for slides'
                : 'Run a training first — then export it as a video'}
            aria-label="Export run as video"
            on:click={exportRun}
          >
            {#if exporting}
              <span class="tool-spinner" aria-hidden="true"></span>
            {:else}
              <Video size={15} strokeWidth={2.2} />
            {/if}
          </button>
        {/if}
    </div>
  </div>
  <div class="svg-container" bind:this={containerEl}>
    {#if oneParam}
      <LossCurve1D {width} {height} {margin} {basinsOn} />
    {:else if view === '3d'}
      <!-- Inset to the same margins as the 2D plot frame, so the 3D window
           aligns exactly with the Data panel and the 2D view. -->
      <div
        class="three-inset"
        style="left: {margin.left}px; right: {margin.right}px; top: {margin.top}px; bottom: {margin.bottom}px;"
      >
        {#await import('./LossLandscape3D.svelte') then mod}
          <svelte:component this={mod.default} />
        {/await}
      </div>
    {:else}
      <svg bind:this={svgElement} {width} {height}></svg>
    {/if}
    <div class="readout" style="left: {margin.left + 8}px; top: {margin.top + 8}px;">
      <span class="readout-item"><em>α</em> {fmtParam(parameters.a)}</span>
      {#if oneParam}
        <span class="readout-item"><em>dℒ/dα</em> {fmtSlope(currentGradient?.a ?? 0)}</span>
      {:else}
        <span class="readout-item"><em>β</em> {fmtParam(parameters.b)}</span>
        <span class="readout-item"><em>‖∇ℒ‖</em> {fmtMag(gradMag)}</span>
        {#if lensInfo}
          <span class="readout-item" title="Condition number |λ₁|/|λ₂| of the local Hessian — how stretched the bowl is here. Big κ = ill-conditioned = plain GD zig-zags."><em>κ</em> {fmtKappa(lensInfo.kappa)}</span>
          <span class="readout-item lens-type lens-{lensInfo.type}" title={LENS_TYPE_HINT[lensInfo.type]}>{LENS_TYPE_LABEL[lensInfo.type]}</span>
        {/if}
      {/if}
    </div>
    <!-- Loss color key — or, in basin mode, what the colors mean instead -->
    {#if basinActive}
      <div class="loss-key" style="right: {margin.right + 8}px; bottom: {margin.bottom + 8}px;">
        <span class="key-title">Basins</span>
        <span class="key-note">color =<br />destination</span>
      </div>
    {:else}
      <div class="loss-key" style="right: {margin.right + 8}px; bottom: {margin.bottom + 8}px;">
        <span class="key-title">Loss</span>
        <span class="key-val">{maxLossValue.toFixed(2)}</span>
        <div class="vbar" style="background: linear-gradient(to bottom, {legendStops});"></div>
        <span class="key-val">{minLossValue.toFixed(2)}</span>
      </div>
    {/if}
    <!-- Marker-arrow key, bottom-left corner (all views speak this language).
         Hidden during a race — the single-marker vectors don't apply, and the
         race legend takes the left side. -->
    {#if !race}
    <div class="vec-key" style="left: {margin.left + 8}px; bottom: {margin.bottom + 8}px;">
        <span class="vec-item" title="Steepest-descent direction at the marker: −∇ℒ, straight downhill">
          <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true">
            <line x1="1" y1="5" x2="12" y2="5" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" />
            <path d="M12,1.5 L19,5 L12,8.5 Z" fill="#3b82f6" />
          </svg>
          <span>−∇ℒ</span>
        </span>
        <span class="vec-item" title="The optimizer's actual last step: Δθ (momentum and adaptive methods bend away from −∇ℒ)">
          <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true">
            <line x1="1" y1="5" x2="12" y2="5" stroke="#ef4444" stroke-width="2" stroke-linecap="round" />
            <path d="M12,1.5 L19,5 L12,8.5 Z" fill="#ef4444" />
          </svg>
          <span>Δθ</span>
        </span>
        <span class="vec-item" title="Where the selected optimizer's next update would land from here — momentum velocity, adaptive scaling, and the γ schedule all included. A dry run of the real step.">
          <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true">
            <circle cx="10" cy="5" r="4" fill="rgba(251,191,36,0.18)" stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="2.5,2" />
          </svg>
          <span>next step</span>
        </span>
        {#if fanActive && view === '2d' && !oneParam}
          <span class="vec-item" title="Each faint ray is −∇ℒ on a different random minibatch — the gradient is a noisy estimate, and this is its spread. The solid blue arrow is the full-batch direction.">
            <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true">
              <line x1="2" y1="8" x2="17" y2="5" stroke="#3b82f6" stroke-width="1.3" opacity="0.35" stroke-linecap="round" />
              <line x1="2" y1="5" x2="18" y2="2" stroke="#3b82f6" stroke-width="1.3" opacity="0.35" stroke-linecap="round" />
              <line x1="2" y1="2" x2="16" y2="8" stroke="#3b82f6" stroke-width="1.3" opacity="0.35" stroke-linecap="round" />
            </svg>
            <span>batch ∇ spread</span>
          </span>
        {/if}
        {#if lensInfo && view === '2d'}
          <span class="vec-item" title="The Newton step −H⁻¹∇ℒ, drawn at true scale: where one second-order jump lands. In a stretched bowl it heads straight for the bottom while −∇ℒ would zig-zag. Shown only in a bowl, where it actually minimizes.">
            <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true">
              <line x1="1" y1="5" x2="12" y2="5" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="3,2" stroke-linecap="round" />
              <path d="M12,1.5 L19,5 L12,8.5 Z" fill="#8b5cf6" />
            </svg>
            <span>Newton</span>
          </span>
          <span class="vec-item" title="Local curvature at the marker. In a bowl: a level-set ellipse (long axis = shallow direction). At a saddle or ridge: the principal axes, red dashed = a downhill (escape) direction. The κ chip in the stats names the shape.">
            <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true">
              <ellipse cx="10" cy="5" rx="8" ry="3.5" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7" />
            </svg>
            <span>curvature</span>
          </span>
        {/if}
    </div>
    {/if}
    {#if $challengeStore}
      <div
        class="challenge-pill {$challengeStore.status}"
        style="top: {margin.top + 8}px; right: {margin.right + 8}px;"
        title="A challenge link sets a goal — the coach judges every finished run against it"
      >
        <span>🎯</span>
        <span>basin in ≤ {$challengeStore.target} steps</span>
        {#if $challengeStore.status === 'beaten'}<span class="pill-mark">✓</span>{/if}
        {#if $challengeStore.status === 'missed'}<span class="pill-mark">↻</span>{/if}
      </div>
    {/if}
    {#if race}
      <div class="race-legend" style="left: {margin.left + 8}px; top: {margin.top + 34}px;">
        {#each race.racers as r (r.id)}
          <span
            class="race-item" class:dim={r.diverged} class:hot={hover === r.id}
            role="listitem"
            on:mouseenter={() => raceHoverStore.set(r.id)}
            on:mouseleave={() => raceHoverStore.set(null)}
          >
            <span class="race-dot" style="background: {r.color}"></span>
            <span class="race-name">{optimizers[r.id].name}</span>
            {#if r.finished}<span class="race-flag">✓</span>{/if}
            {#if r.diverged}<span class="race-flag">✗</span>{/if}
          </span>
        {/each}
      </div>
    {/if}
    {#if $divergenceStore}
      <div class="divergence-banner" role="alert">
        <span>
          <strong>Diverged at step {$divergenceStore.step}!</strong>
          The learning rate γ is too large — each step overshoots the minimum
          and the overshoot compounds. Lower γ (or μ) and train again.
        </span>
        <button class="banner-dismiss" on:click={() => divergenceStore.set(null)} aria-label="Dismiss">×</button>
      </div>
    {:else if $coachStore}
      <div class="divergence-banner coach-{$coachStore.kind}" role="status">
        <span>{$coachStore.text}</span>
        <button class="banner-dismiss" on:click={clearCoach} aria-label="Dismiss">×</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .gradient-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  /* Fixed-height, never-wrapping header: the plot area below always starts
     at the same y in 2D, 3D, and the Data panel, so the frames stay aligned. */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: nowrap;
    height: 28px;
    margin-bottom: 0.25rem;
    margin-right: 20px;
    flex-shrink: 0;
    overflow: hidden;
  }

  h2 {
    margin: 0 0 0 50px;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    opacity: 0.9;
    white-space: nowrap;
    flex-shrink: 0;
    min-width: 0;
  }

  /* 2D / 3D segmented toggle */
  /* Same clean segmented-control language as the sidebar's Schedule toggle:
     subtle track, no dividers, selected = bordered emerald pill. */
  .view-toggle {
    display: flex;
    gap: 3px;
    padding: 3px;
    border-radius: 9px;
    background: rgba(127, 127, 127, 0.1);
    flex-shrink: 0;
    margin: 0 0.75rem;
  }

  .view-toggle button {
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-text-tertiary);
    font-size: 0.6875rem;
    font-weight: 700;
    padding: 0.2rem 0.6rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    letter-spacing: 0.03em;
  }

  .view-toggle button:hover:not(.active) {
    color: var(--color-text-secondary);
  }

  .view-toggle button.active {
    background: rgba(16, 185, 129, 0.16);
    border-color: rgba(16, 185, 129, 0.55);
    color: #10b981;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }

  .header-left {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  /* Right-side header toolbar: compact icon-only buttons; the title
     attribute carries the explanation on hover. */
  .header-tools {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 1px;
  }

  .tool-btn {
    width: 26px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--color-text-tertiary);
    padding: 0;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tool-btn:hover:not(:disabled) {
    color: #10b981;
    background: rgba(16, 185, 129, 0.1);
  }

  .tool-btn.active {
    background: rgba(16, 185, 129, 0.16);
    color: #10b981;
  }

  .tool-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .tool-spinner {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 2px solid rgba(16, 185, 129, 0.25);
    border-top-color: #10b981;
    animation: toolSpin 0.7s linear infinite;
  }

  @keyframes toolSpin {
    to { transform: rotate(360deg); }
  }

  /* ---------- Layers popover ---------- */
  .layers-control { position: relative; display: inline-flex; }
  .layers-backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    border: none;
    padding: 0;
    cursor: default;
    z-index: 40;
  }
  .layers-pop {
    position: fixed;
    z-index: 60;
    width: 214px;
    padding: 0.6rem 0.7rem;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    box-shadow: 0 12px 30px var(--color-shadow);
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    animation: lpIn 0.14s ease;
  }
  @keyframes lpIn {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .lp-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .lp-row.lp-col { flex-direction: column; align-items: stretch; gap: 0.4rem; }
  .lp-label {
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .lp-seg {
    display: inline-flex;
    border: 1px solid var(--color-border);
    border-radius: 7px;
    overflow: hidden;
  }
  .lp-seg button {
    border: none;
    background: transparent;
    color: var(--color-text-tertiary);
    font-size: 0.68rem;
    font-weight: 600;
    padding: 0.2rem 0.45rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .lp-seg button:hover { color: var(--color-text-primary); }
  .lp-seg button.on { background: rgba(16, 185, 129, 0.16); color: #10b981; }
  .lp-switch {
    width: 34px;
    height: 19px;
    border-radius: 19px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-tertiary);
    position: relative;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s;
  }
  .lp-switch.on { background: rgba(16, 185, 129, 0.22); border-color: rgba(16, 185, 129, 0.5); }
  .lp-knob {
    position: absolute;
    top: 1.5px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--color-text-tertiary);
    transition: transform 0.15s, background 0.15s;
  }
  .lp-switch.on .lp-knob { transform: translateX(15px); background: #10b981; }
  .lp-divider { height: 1px; background: var(--color-border); margin: 0.05rem 0; }
  .lp-cmaps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
  .lp-cmap {
    height: 19px;
    border-radius: 5px;
    border: none;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
    padding: 0;
    /* Fill edge-to-edge with the gradient. A transparent border + the default
       padding-box origin makes Chromium paint a stray END-color pixel at the
       left edge (the gradient reads as "circular"); border-box origin + no
       border avoids it. The selected ring uses box-shadow, not a border. */
    background-origin: border-box;
    background-clip: border-box;
    transition: box-shadow 0.12s, transform 0.12s;
  }
  .lp-cmap:hover { transform: translateY(-1px); }
  .lp-cmap.on { box-shadow: 0 0 0 2px var(--color-bg-secondary), 0 0 0 3.5px #10b981; }

  /* ---------- In-plot corner keys ---------- */

  /* Vertical loss color key, bottom-right of the plot */
  .loss-key {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 0.35rem 0.45rem;
    border-radius: 8px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.625rem;
    font-weight: 600;
    pointer-events: none;
    z-index: 3;
  }

  .key-title {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .vbar {
    width: 10px;
    height: 56px;
    border-radius: 5px;
    background: linear-gradient(to bottom,
      #440154, #31688e, #35b779, #fde724);
    border: 1px solid var(--color-border);
  }

  .key-note {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-weight: 600;
    font-size: 0.625rem;
    text-align: center;
    line-height: 1.35;
    opacity: 0.85;
  }

  /* Marker-arrow key (−∇ℒ vs Δθ), bottom-left of the plot, 2D only */
  .vec-key {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 0.35rem 0.5rem;
    border-radius: 8px;
    z-index: 3;
  }

  :global([data-theme='light']) .loss-key,
  :global([data-theme='light']) .vec-key {
    background: rgba(255, 255, 255, 0.78);
    color: #475569;
  }

  :global([data-theme='dark']) .loss-key,
  :global([data-theme='dark']) .vec-key {
    background: rgba(6, 9, 19, 0.68);
    color: #94a3b8;
  }

  .vec-item {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.6875rem;
    font-weight: 600;
    font-family: 'SF Mono', Monaco, monospace;
    cursor: help;
    white-space: nowrap;
  }

  .vec-item svg {
    flex-shrink: 0;
  }

  /* Live α / β / gradient readout, pinned inside the plot frame */
  .readout {
    position: absolute;
    display: flex;
    gap: 0.625rem;
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.6875rem;
    font-weight: 600;
    pointer-events: none;
    white-space: nowrap;
  }

  :global([data-theme='light']) .readout {
    background: rgba(255, 255, 255, 0.75);
    color: #334155;
  }

  :global([data-theme='dark']) .readout {
    background: rgba(6, 9, 19, 0.65);
    color: #cbd5e1;
  }

  .readout-item em {
    font-family: Georgia, serif;
    font-style: italic;
    font-weight: 400;
    opacity: 0.7;
    margin-right: 0.2rem;
  }

  /* Definiteness chip next to κ — names the local shape so κ can't mislead. */
  .lens-type {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.625rem;
    padding: 0.04rem 0.34rem;
    border-radius: 999px;
    line-height: 1.4;
  }
  .lens-bowl { color: #34d399; background: rgba(52, 211, 153, 0.16); }
  .lens-saddle { color: #f59e0b; background: rgba(245, 158, 11, 0.16); }
  .lens-ridge { color: #f87171; background: rgba(248, 113, 113, 0.16); }
  .lens-flat { color: #94a3b8; background: rgba(148, 163, 184, 0.16); }

  /* Challenge target pill: top-right corner of the plot (readout owns
     the top-left) */
  .challenge-pill {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.22rem 0.65rem;
    border-radius: 999px;
    font-size: 0.6875rem;
    font-weight: 700;
    font-family: 'SF Mono', Monaco, monospace;
    white-space: nowrap;
    pointer-events: auto;
    cursor: help;
    z-index: 4;
    border: 1px solid;
  }

  :global([data-theme='light']) .challenge-pill.open {
    background: rgba(255, 255, 255, 0.85);
    border-color: #cbd5e1;
    color: #334155;
  }

  :global([data-theme='dark']) .challenge-pill.open {
    background: rgba(6, 9, 19, 0.75);
    border-color: #475569;
    color: #cbd5e1;
  }

  .challenge-pill.beaten {
    background: rgba(16, 185, 129, 0.16) !important;
    border-color: rgba(16, 185, 129, 0.6) !important;
    color: #10b981 !important;
  }

  .challenge-pill.missed {
    background: rgba(245, 158, 11, 0.14) !important;
    border-color: rgba(245, 158, 11, 0.55) !important;
    color: #d97706 !important;
  }

  :global([data-theme='dark']) .challenge-pill.missed {
    color: #fbbf24 !important;
  }

  .pill-mark {
    font-size: 0.75rem;
  }

  /* Race legend: who's which color, bottom center of the plot */
  /* Vertical lineup overlaid on the top-left of the plot, just below the
     param/grad readout. Hover an entry to spotlight that racer in the plot. */
  .race-legend {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    max-height: calc(100% - 48px);
    padding: 0.3rem 0.4rem;
    border-radius: 8px;
    font-size: 0.6875rem;
    font-weight: 600;
    pointer-events: none;
    white-space: nowrap;
    z-index: 4;
  }

  :global([data-theme='light']) .race-legend {
    background: rgba(255, 255, 255, 0.42);
    color: #334155;
  }

  :global([data-theme='dark']) .race-legend {
    background: rgba(6, 9, 19, 0.4);
    color: #cbd5e1;
  }

  .race-item {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.1rem 0.25rem;
    border-radius: 5px;
    pointer-events: auto;
    cursor: default;
    transition: opacity 0.15s ease, background 0.15s ease;
  }

  .race-item.dim { opacity: 0.5; }
  .race-item.hot { background: rgba(127, 127, 127, 0.22); }
  .race-item.hot .race-name { font-weight: 800; }
  :global([data-theme='light']) .race-item.hot { color: #0f172a; }
  :global([data-theme='dark']) .race-item.hot { color: #fff; }

  .race-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .race-flag {
    font-size: 0.625rem;
  }

  /* Divergence explainer */
  .divergence-banner {
    position: absolute;
    top: 12%;
    left: 50%;
    transform: translateX(-50%);
    max-width: min(92%, 420px);
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    border-radius: 10px;
    font-size: 0.8125rem;
    line-height: 1.45;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    animation: bannerIn 0.25s ease;
    z-index: 5;
  }

  @keyframes bannerIn {
    from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  :global([data-theme='light']) .divergence-banner {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #7f1d1d;
  }

  :global([data-theme='dark']) .divergence-banner {
    background: #2a1215;
    border: 1px solid #7f1d1d;
    color: #fecaca;
  }

  /* Coach variants reuse the banner shell with their own palettes */
  :global([data-theme='light']) .divergence-banner.coach-success {
    background: #ecfdf5;
    border-color: #a7f3d0;
    color: #065f46;
  }

  :global([data-theme='dark']) .divergence-banner.coach-success {
    background: #0a2620;
    border-color: #047857;
    color: #a7f3d0;
  }

  :global([data-theme='light']) .divergence-banner.coach-info {
    background: #f0f9ff;
    border-color: #bae6fd;
    color: #075985;
  }

  :global([data-theme='dark']) .divergence-banner.coach-info {
    background: #0c1f2e;
    border-color: #0369a1;
    color: #bae6fd;
  }

  :global([data-theme='light']) .divergence-banner.coach-warn {
    background: #fffbeb;
    border-color: #fde68a;
    color: #92400e;
  }

  :global([data-theme='dark']) .divergence-banner.coach-warn {
    background: #2a2008;
    border-color: #b45309;
    color: #fde68a;
  }

  .divergence-banner strong {
    font-weight: 700;
  }

  .banner-dismiss {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    opacity: 0.7;
  }

  .banner-dismiss:hover {
    opacity: 1;
  }

  @media (max-width: 768px) {
    h2 {
      margin-left: 0;
      font-size: 0.875rem;
      gap: 0.375rem;
    }
    .header { margin-right: 0; margin-bottom: 0.125rem; }
    .readout { font-size: 0.625rem; gap: 0.5rem; }
    .vec-item { font-size: 0.625rem; }
    .vec-item svg { width: 14px; }
    .vbar { height: 40px; }
    .loss-key { font-size: 0.5625rem; padding: 0.25rem 0.35rem; }
  }

  .svg-container {
    flex: 1;
    min-height: 0;
    max-height: 100%;
    position: relative;
    overflow: hidden;
  }

  .three-inset {
    position: absolute;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    overflow: hidden;
  }

  svg {
    display: block;
    background: transparent;
    border-radius: 0;
    max-width: 100%;
    max-height: 100%;
  }
</style>
