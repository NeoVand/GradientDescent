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
    divergenceStore
  } from '../stores/stores';
  import type { ModelParameters } from '../types/types';
  import { Mountain } from 'lucide-svelte';

  // Component references
  let svgElement: SVGSVGElement;
  let width = 400;
  let height = 400;
  // Margins shrink on narrow viewports to claw back vertical space
  $: compact = width < 480;
  $: margin = compact
    ? { top: 8, right: 12, bottom: 32, left: 38 }
    : { top: 20, right: 20, bottom: 50, left: 50 };
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

  $: if (scene) {
    minLossValue = scene.grid.visMin;
    maxLossValue = scene.grid.visMax;
  }

  // Live readout: current parameters and gradient at the marker
  $: trainData = data.filter(d => d.isTraining);
  $: currentGradient = computeGrad(trainData, parameters, problemConfig);
  $: gradMag = currentGradient ? Math.hypot(currentGradient.a, currentGradient.b) : 0;

  function computeGrad(
    train: typeof trainData,
    params: typeof parameters,
    config: typeof problemConfig
  ): ModelParameters | null {
    if (!config || train.length === 0) return null;
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

  // Full redraw whenever the cached scene or the theme changes (both cheap:
  // the heavy work already happened in the store).
  $: if (svgElement && scene && theme) {
    redraw();
  }

  // Trail/marker layer updates during training (no full redraw)
  $: if (svgElement && history.length > 0 && !isDragging) {
    updateTrail();
  }

  let isDragging = false;

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

    const container = svgElement.closest('.svg-container');
    if (container) {
      resizeObserver.observe(container);
    }

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
    if (!scene) return;

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

    // Add background
    g.insert('rect', ':first-child')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', isDark ? '#060913' : '#ffffff')
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

    // Gradient field (above heatmap, below contours)
    drawGradients(plotGroup, xScale, yScale, isDark);

    // Contour lines (above gradient field, below trail)
    drawContours(plotGroup, xScale, yScale);

    // Training path with fade effect (above contours, below marker)
    drawTrainingPath(plotGroup, xScale, yScale);

    // Current position last (in main group: never clipped, but clamped)
    drawCurrentPosition(g, xScale, yScale, innerWidth, innerHeight);
  }

  function drawHeatmapImage(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) {
    if (!scene) return;
    const { extMin, extMax } = scene.grid;
    g.append('image')
      .attr('href', scene.imageURL)
      .attr('x', xScale(extMin))
      .attr('y', yScale(extMax))
      .attr('width', xScale(extMax) - xScale(extMin))
      .attr('height', yScale(extMin) - yScale(extMax))
      .attr('preserveAspectRatio', 'none');
  }

  function drawContours(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) {
    if (!scene) return;
    const { res, extMin, extMax, values, thresholds } = scene.grid;
    const extSpan = extMax - extMin;

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

    g.selectAll('.contour')
      .data(contourData)
      .enter()
      .append('path')
      .attr('class', 'contour')
      .attr('d', pathGenerator)
      .attr('fill', 'none')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.5)
      .style('opacity', 0.5);
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
    yScale: d3.ScaleLinear<number, number>,
    isDark: boolean
  ) {
    if (!scene || scene.field.arrows.length === 0) return;
    const { arrows, maxMag } = scene.field;

    // Light slate in dark mode (black vanishes on the dark purples);
    // black in light mode as before.
    const arrowColor = isDark ? '#e2e8f0' : '#000000';

    // Define arrowhead marker
    const defs = g.append('defs');
    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', arrowColor);

    // Draw arrows - balanced size for density
    const baseArrowLength = 12;
    const maxArrowLength = 20;

    for (const item of arrows) {
      const { a, b, ga, gb, mag } = item;
      const normalizedMagnitude = maxMag > 0 ? mag / maxMag : 0;

      // Position
      const x = xScale(a);
      const y = yScale(b);

      // Normalized steepest-descent direction (negative gradient)
      const normGradA = -ga / mag;
      const normGradB = -gb / mag;

      // Arrow length based on magnitude
      const arrowLength = baseArrowLength + (maxArrowLength - baseArrowLength) * normalizedMagnitude;

      // End position
      const x2 = x + normGradA * arrowLength;
      const y2 = y - normGradB * arrowLength; // Negative because SVG y is inverted

      g.append('line')
        .attr('class', 'gradient-arrow')
        .attr('x1', x)
        .attr('y1', y)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('stroke', arrowColor)
        .attr('stroke-width', 0.8 + normalizedMagnitude * 1.2)
        .attr('marker-end', 'url(#arrowhead)')
        .style('opacity', 0.35 + normalizedMagnitude * 0.25);
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

    const setVec = (
      sel: d3.Selection<d3.BaseType, unknown, null, undefined>,
      sx: number,
      sy: number,
      len: number
    ) => {
      const m = Math.hypot(sx, sy);
      if (!Number.isFinite(m) || m < 1e-12) {
        sel.style('display', 'none');
        return;
      }
      sel.style('display', null)
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', (sx / m) * len)
        .attr('y2', (sy / m) * len);
    };

    // Steepest descent: param direction (−ga, −gb) → screen (−ga·kx, +gb·ky)
    const g = currentGradient;
    setVec(
      marker.select('.vec-grad'),
      g ? -g.a * kx : 0,
      g ? g.b * ky : 0,
      32
    );

    // Last actual update Δθ
    const n = history.length;
    if (n >= 2) {
      const da = history[n - 1].parameters.a - history[n - 2].parameters.a;
      const db = history[n - 1].parameters.b - history[n - 2].parameters.b;
      setVec(marker.select('.vec-upd'), da * kx, -db * ky, 24);
    } else {
      marker.select('.vec-upd').style('display', 'none');
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
    for (const [id, color] of [['vec-grad-head', '#3b82f6'], ['vec-upd-head', '#ef4444']] as const) {
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
        // Drag means the user is restarting from a new position, so any
        // accumulated optimizer state (velocity, moment estimates) from
        // prior steps shouldn't carry over — and any divergence warning
        // is now stale.
        resetOptimizerState();
        divergenceStore.set(null);
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
        d3.select(this).style('cursor', 'grab');
      }));
  }

  function updateTrail() {
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
    <h2>
      <Mountain size={20} strokeWidth={2} />
      <span>Loss & Gradient</span>
    </h2>
    <div class="color-legend">
      <span class="legend-label">Loss:</span>
      <div class="legend-scale">
        <span class="scale-value">{maxLossValue.toFixed(2)}</span>
        <div class="color-bar"></div>
        <span class="scale-value">{minLossValue.toFixed(2)}</span>
      </div>
    </div>
  </div>
  <div class="svg-container">
    <svg bind:this={svgElement} {width} {height}></svg>
    <div class="readout" style="left: {margin.left + 8}px; top: {margin.top + 8}px;">
      <span class="readout-item"><em>α</em> {fmtParam(parameters.a)}</span>
      <span class="readout-item"><em>β</em> {fmtParam(parameters.b)}</span>
      <span class="readout-item"><em>‖∇ℒ‖</em> {fmtMag(gradMag)}</span>
    </div>
    {#if $divergenceStore}
      <div class="divergence-banner" role="alert">
        <span>
          <strong>Diverged at step {$divergenceStore.step}!</strong>
          The learning rate γ is too large — each step overshoots the minimum
          and the overshoot compounds. Lower γ (or μ) and train again.
        </span>
        <button class="banner-dismiss" on:click={() => divergenceStore.set(null)} aria-label="Dismiss">×</button>
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

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.375rem;
    margin-right: 20px;
    flex-shrink: 0;
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
  }

  .color-legend {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .legend-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-tertiary);
  }

  .legend-scale {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .color-bar {
    width: 80px;
    height: 12px;
    border-radius: 6px;
    background: linear-gradient(to right,
      #440154, #31688e, #35b779, #fde724);
    border: 1px solid var(--color-border);
  }

  .scale-value {
    font-size: 0.625rem;
    font-weight: 600;
    font-family: 'SF Mono', Monaco, monospace;
    color: var(--color-text-tertiary);
    min-width: 2.5rem;
    text-align: center;
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
    .color-bar { width: 50px; height: 10px; }
    .legend-label { font-size: 0.6875rem; }
    .scale-value { font-size: 0.5625rem; min-width: 2rem; }
    .readout { font-size: 0.625rem; gap: 0.5rem; }
  }

  .svg-container {
    flex: 1;
    min-height: 0;
    max-height: 100%;
    position: relative;
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
