<script lang="ts">
  /**
   * 1D Loss Curve — the landscape view for one-parameter problems.
   *
   * The whole loss "landscape" is a single curve ℒ(α), so everything the 2D
   * view encodes spatially becomes directly readable:
   *   - the curve itself, over the problem's α range
   *   - a viridis strip along the bottom: the SAME color mapping as the 2D
   *     heatmap (a 2D map is just many of these strips stacked)
   *   - the draggable marker ball ON the curve, with the tangent line at it
   *   - blue −∇ℒ / red Δθ arrows (same semantics as the 2D marker)
   *   - a dashed ghost ball previewing one plain-GD step: α − γ·dℒ/dα
   *   - a fading red trail of past positions, pinned to the current curve
   *
   * Shares the parent's width/height/margins so the plot frame aligns
   * exactly with the Data panel and the 2D landscape.
   */

  import * as d3 from 'd3';
  import {
    datasetStore,
    parametersStore,
    historyStore,
    currentProblemConfig,
    themeStore,
    trainingStore,
    resetOptimizerState,
    divergenceStore,
    clearCoach,
    raceStore
  } from '../stores/stores';
  import { viridisRGB } from '../utils/lossGrid';

  export let width = 400;
  export let height = 400;
  export let margin = { top: 20, right: 20, bottom: 50, left: 50 };

  let svgElement: SVGSVGElement | null = null;

  const CURVE_SAMPLES = 240;
  const STRIP_HEIGHT = 10;
  // Same ε as the 2D heatmap's log color mapping, so strip colors agree.
  const LOG_EPS = 0.001;

  const defaultParameterRange = { min: -7, max: 7 };

  $: data = $datasetStore.data;
  $: trainData = data.filter(d => d.isTraining);
  $: parameters = $parametersStore;
  $: history = $historyStore;
  $: problemConfig = $currentProblemConfig;
  $: theme = $themeStore;
  $: learningRate = $trainingStore.learningRate;
  $: race = $raceStore;
  $: parameterRange = problemConfig?.parameterRange ?? defaultParameterRange;

  let isDragging = false;

  // Current curve samples + scales, rebuilt by redraw() and reused by the
  // dynamic layers (marker, tangent, trail) in between.
  let curve: { a: number; loss: number }[] = [];
  let xScale: d3.ScaleLinear<number, number> | null = null;
  let yScale: d3.ScaleLinear<number, number> | null = null;

  function lossAt(a: number): number {
    const loss = problemConfig.computeLoss(trainData, { a, b: 0 });
    return Number.isFinite(loss) ? loss : 1e300;
  }

  function slopeAt(a: number): number {
    return problemConfig.computeGradient(trainData, { a, b: parameters.b }).a;
  }

  // Full rebuild when the curve shape itself can change.
  $: if (svgElement && problemConfig && data && theme && width && height) {
    redraw();
  }

  // Light updates while training / dragging elsewhere
  $: if (svgElement && (parameters || history) && learningRate && !isDragging) {
    updateDynamics();
  }

  $: if (svgElement && race !== undefined) {
    updateRaceDots();
  }

  function redraw() {
    if (!svgElement || !problemConfig?.oneParam) return;
    if (trainData.length === 0 && !problemConfig.noData) return;

    d3.select(svgElement).selectAll('*').remove();

    const svg = d3.select(svgElement);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    if (innerWidth <= 0 || innerHeight <= 0) return;

    // Sample the curve
    const span = parameterRange.max - parameterRange.min;
    curve = [];
    let yMax = -Infinity;
    let yMin = Infinity;
    for (let i = 0; i <= CURVE_SAMPLES; i++) {
      const a = parameterRange.min + (i / CURVE_SAMPLES) * span;
      const loss = lossAt(a);
      curve.push({ a, loss });
      if (loss > yMax) yMax = loss;
      if (loss < yMin) yMin = loss;
    }
    if (!Number.isFinite(yMax) || yMax <= 0) yMax = 1;

    xScale = d3.scaleLinear().domain([parameterRange.min, parameterRange.max]).range([0, innerWidth]);
    yScale = d3.scaleLinear().domain([0, yMax * 1.06]).range([innerHeight, 0]);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const axisColor = isDark ? '#527a75' : '#064e3b';

    // Clip path for plot content
    svg.append('defs')
      .append('clipPath')
      .attr('id', 'curve-clip-path')
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', innerWidth)
      .attr('height', innerHeight);

    // Background
    g.insert('rect', ':first-child')
      .attr('x', 0).attr('y', 0)
      .attr('width', innerWidth).attr('height', innerHeight)
      .attr('fill', isDark ? '#060913' : '#ffffff')
      .attr('rx', 4);

    // Axes (same styling as the 2D landscape)
    const xAxis = d3.axisBottom(xScale).tickSizeOuter(0);
    const yAxis = d3.axisLeft(yScale).ticks(6).tickSizeOuter(0);

    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call(sel => sel.selectAll('line').attr('stroke', axisColor))
      .call(sel => sel.selectAll('path').attr('stroke', axisColor))
      .call(sel => sel.selectAll('text').attr('fill', axisColor));

    g.append('g')
      .attr('class', 'y-axis')
      .call(yAxis)
      .call(sel => sel.selectAll('line').attr('stroke', axisColor))
      .call(sel => sel.selectAll('path').attr('stroke', axisColor))
      .call(sel => sel.selectAll('text').attr('fill', axisColor));

    g.append('g')
      .call(d3.axisTop(xScale).tickSizeOuter(0).tickSize(0).tickFormat(() => ''))
      .call(sel => sel.selectAll('line').remove())
      .call(sel => sel.select('.domain').attr('stroke', axisColor));

    g.append('g')
      .attr('transform', `translate(${innerWidth},0)`)
      .call(d3.axisRight(yScale).tickSizeOuter(0).tickSize(0).tickFormat(() => ''))
      .call(sel => sel.selectAll('line').remove())
      .call(sel => sel.select('.domain').attr('stroke', axisColor));

    // Axis labels: α below, ℒ at the left — matching the formulas
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + (width < 480 ? 26 : 38))
      .attr('fill', axisColor)
      .attr('font-size', '14px')
      .attr('font-style', 'italic')
      .attr('font-family', 'Georgia, serif')
      .style('text-anchor', 'middle')
      .text('α');

    g.append('text')
      .attr('x', -(width < 480 ? 26 : 35))
      .attr('y', innerHeight / 2)
      .attr('fill', axisColor)
      .attr('font-size', '14px')
      .attr('font-style', 'italic')
      .attr('font-family', 'Georgia, serif')
      .style('text-anchor', 'middle')
      .text('ℒ');

    const clippedGroup = g.append('g')
      .attr('clip-path', 'url(#curve-clip-path)')
      .attr('transform', `translate(${-margin.left},${-margin.top})`);

    const plotGroup = clippedGroup.append('g')
      .attr('class', 'plot-group')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Viridis strip along the bottom: the 1D heatmap. Same log mapping and
    // alpha as the 2D image so the two views speak the same color language.
    const logMin = Math.log(yMin + LOG_EPS);
    const logMax = Math.log(yMax + LOG_EPS);
    const logSpan = logMax - logMin || 1;
    const stripCanvas = document.createElement('canvas');
    stripCanvas.width = CURVE_SAMPLES;
    stripCanvas.height = 1;
    const ctx = stripCanvas.getContext('2d')!;
    const img = ctx.createImageData(CURVE_SAMPLES, 1);
    for (let i = 0; i < CURVE_SAMPLES; i++) {
      let t = (Math.log(curve[i].loss + LOG_EPS) - logMin) / logSpan;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const [r, gg, b] = viridisRGB(1 - t); // bright = low loss
      img.data[i * 4] = Math.round(r * 255);
      img.data[i * 4 + 1] = Math.round(gg * 255);
      img.data[i * 4 + 2] = Math.round(b * 255);
      img.data[i * 4 + 3] = 217;
    }
    ctx.putImageData(img, 0, 0);
    plotGroup.append('image')
      .attr('href', stripCanvas.toDataURL())
      .attr('x', 0)
      .attr('y', innerHeight - STRIP_HEIGHT)
      .attr('width', innerWidth)
      .attr('height', STRIP_HEIGHT)
      .attr('preserveAspectRatio', 'none');

    // Soft area under the curve, then the curve itself
    const area = d3.area<{ a: number; loss: number }>()
      .x(d => xScale!(d.a))
      .y0(innerHeight)
      .y1(d => yScale!(d.loss))
      .curve(d3.curveMonotoneX);

    plotGroup.append('path')
      .datum(curve)
      .attr('d', area)
      .attr('fill', isDark ? 'rgba(16, 185, 129, 0.07)' : 'rgba(5, 150, 105, 0.06)');

    const line = d3.line<{ a: number; loss: number }>()
      .x(d => xScale!(d.a))
      .y(d => yScale!(d.loss))
      .curve(d3.curveMonotoneX);

    plotGroup.append('path')
      .datum(curve)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', isDark ? '#10b981' : '#059669')
      .attr('stroke-width', 2.5)
      .attr('stroke-linejoin', 'round');

    // Dynamic layers (cleared and refilled by updateDynamics)
    plotGroup.append('g').attr('class', 'tangent-layer');
    plotGroup.append('g').attr('class', 'trail-layer');
    plotGroup.append('g').attr('class', 'ghost-layer');
    plotGroup.append('g').attr('class', 'race-layer');

    drawMarker(g, innerWidth, innerHeight);
    updateDynamics();
    updateRaceDots();
  }

  /** Clamp α to the visible range; y always sits on the (clamped) curve. */
  function markerScreenPos(a: number): { x: number; y: number; offMap: boolean } {
    const aClamped = Math.max(parameterRange.min, Math.min(parameterRange.max, Number.isFinite(a) ? a : 0));
    const innerHeight = height - margin.top - margin.bottom;
    const rawY = yScale!(lossAt(aClamped));
    return {
      x: xScale!(aClamped),
      y: Math.max(0, Math.min(innerHeight, rawY)),
      offMap: aClamped !== a || rawY < 0
    };
  }

  function drawMarker(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    _innerWidth: number,
    _innerHeight: number
  ) {
    const defs = g.append('defs');
    for (const [id, color] of [['vec-grad-head-1d', '#3b82f6'], ['vec-upd-head-1d', '#ef4444']] as const) {
      defs.append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 8).attr('refY', 0)
        .attr('markerWidth', 4.5).attr('markerHeight', 4.5)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color);
    }

    const marker = g.append('g')
      .attr('class', 'current-position')
      .style('touch-action', 'none');

    marker.append('circle')
      .attr('class', 'hit-area')
      .attr('r', 22)
      .attr('fill', 'transparent')
      .style('cursor', 'grab')
      .style('touch-action', 'none');

    // Blue −∇ℒ above the ball, red Δθ below — collinear in 1D, so the small
    // vertical offsets keep both readable.
    marker.append('line')
      .attr('class', 'vec-grad')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2.5)
      .attr('stroke-linecap', 'round')
      .attr('marker-end', 'url(#vec-grad-head-1d)')
      .style('opacity', 0.95)
      .style('pointer-events', 'none');

    marker.append('line')
      .attr('class', 'vec-upd')
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 2.5)
      .attr('stroke-linecap', 'round')
      .attr('marker-end', 'url(#vec-upd-head-1d)')
      .style('opacity', 0.95)
      .style('pointer-events', 'none');

    marker.append('circle')
      .attr('class', 'marker-ring')
      .attr('r', 10)
      .attr('fill', 'none')
      .attr('stroke', '#f59e0b')
      .attr('stroke-width', 2)
      .style('pointer-events', 'none');

    marker.append('circle')
      .attr('class', 'marker-dot')
      .attr('r', 6)
      .attr('fill', '#f59e0b')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('pointer-events', 'none');

    marker.call(d3.drag<SVGGElement, unknown>()
      .touchable(() => true)
      .on('start', function () {
        isDragging = true;
        resetOptimizerState();
        divergenceStore.set(null);
        clearCoach();
        d3.select(this).style('cursor', 'grabbing');
      })
      .on('drag', function (event) {
        if (!xScale) return;
        const newA = Math.max(parameterRange.min, Math.min(parameterRange.max, xScale.invert(event.x)));
        parametersStore.set({ a: newA, b: parameters.b });

        const train = data.filter(d => d.isTraining);
        const test = data.filter(d => !d.isTraining);
        const nextStep = history.length > 0 ? history[history.length - 1].step + 1 : 0;
        historyStore.addPoint({
          step: nextStep,
          trainLoss: problemConfig.computeLoss(train, { a: newA, b: parameters.b }),
          testLoss: problemConfig.computeLoss(test, { a: newA, b: parameters.b }),
          parameters: { a: newA, b: parameters.b }
        });

        updateDynamics();
      })
      .on('end', function () {
        isDragging = false;
        d3.select(this).style('cursor', 'grab');
      }));
  }

  /** Marker position, tangent line, ghost GD step, trail. */
  function updateDynamics() {
    if (!svgElement || !xScale || !yScale) return;
    const svg = d3.select(svgElement);
    const plotGroup = svg.select<SVGGElement>('.plot-group');
    const marker = svg.select<SVGGElement>('.current-position');
    if (plotGroup.empty() || marker.empty()) return;

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const span = parameterRange.max - parameterRange.min;

    const a0 = parameters.a;
    const pos = markerScreenPos(a0);
    const slope = slopeAt(a0);

    marker.attr('transform', `translate(${pos.x}, ${pos.y})`);
    marker.select('.marker-ring')
      .attr('stroke-dasharray', pos.offMap ? '4,3' : null)
      .style('opacity', pos.offMap ? 0.7 : 1);
    marker.select('.marker-dot').style('opacity', pos.offMap ? 0.7 : 1);

    // Marker arrows: blue −∇ℒ (direction −sign(slope)), red Δθ (last step)
    const setVec = (sel: d3.Selection<d3.BaseType, unknown, null, undefined>, dir: number, len: number, dy: number) => {
      if (!Number.isFinite(dir) || dir === 0) {
        sel.style('display', 'none');
        return;
      }
      sel.style('display', null)
        .attr('x1', 0).attr('y1', dy)
        .attr('x2', Math.sign(dir) * len).attr('y2', dy);
    };

    setVec(marker.select('.vec-grad'), Math.abs(slope) < 1e-12 ? 0 : -Math.sign(slope), 32, -9);

    const n = history.length;
    const da = n >= 2 ? history[n - 1].parameters.a - history[n - 2].parameters.a : 0;
    setVec(marker.select('.vec-upd'), Math.abs(da) < 1e-9 * span ? 0 : Math.sign(da), 24, 9);

    // Tangent line through (α₀, ℒ(α₀)) with slope dℒ/dα
    const tangentLayer = plotGroup.select<SVGGElement>('.tangent-layer');
    tangentLayer.selectAll('*').remove();
    if (Number.isFinite(slope) && !pos.offMap) {
      const L0 = lossAt(Math.max(parameterRange.min, Math.min(parameterRange.max, a0)));
      const dx = span * 0.16;
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      tangentLayer.append('line')
        .attr('x1', xScale(a0 - dx)).attr('y1', yScale(L0 - slope * dx))
        .attr('x2', xScale(a0 + dx)).attr('y2', yScale(L0 + slope * dx))
        .attr('stroke', isDark ? '#94a3b8' : '#64748b')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '5,4')
        .style('opacity', 0.85);
    }

    // Ghost: one plain-GD step from here, α − γ·dℒ/dα
    const ghostLayer = plotGroup.select<SVGGElement>('.ghost-layer');
    ghostLayer.selectAll('*').remove();
    if (Number.isFinite(slope) && !pos.offMap && !race) {
      const aNext = Math.max(parameterRange.min, Math.min(parameterRange.max, a0 - learningRate * slope));
      if (Math.abs(aNext - a0) > span * 0.005) {
        const gx = xScale(aNext);
        const gy = Math.max(0, Math.min(innerHeight, yScale(lossAt(aNext))));
        ghostLayer.append('line')
          .attr('x1', pos.x).attr('y1', pos.y)
          .attr('x2', gx).attr('y2', pos.y)
          .attr('stroke', '#f59e0b')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '2,3')
          .style('opacity', 0.55);
        ghostLayer.append('line')
          .attr('x1', gx).attr('y1', pos.y)
          .attr('x2', gx).attr('y2', gy)
          .attr('stroke', '#f59e0b')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '2,3')
          .style('opacity', 0.55);
        ghostLayer.append('circle')
          .attr('cx', gx).attr('cy', gy)
          .attr('r', 6)
          .attr('fill', 'none')
          .attr('stroke', '#f59e0b')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '3,3')
          .style('opacity', 0.8);
      }
    }

    // Trail: fading red dots pinned to the *current* curve (data edits move
    // the curve; recomputing y keeps old positions honest).
    const trailLayer = plotGroup.select<SVGGElement>('.trail-layer');
    trailLayer.selectAll('*').remove();
    if (history.length >= 2) {
      const windowSize = 100;
      const recent = history.slice(Math.max(0, history.length - windowSize));
      for (let i = 0; i < recent.length - 1; i++) {
        const progress = i / (recent.length - 1);
        const a = recent[i].parameters.a;
        if (a < parameterRange.min || a > parameterRange.max) continue;
        trailLayer.append('circle')
          .attr('cx', xScale(a))
          .attr('cy', Math.max(0, Math.min(innerHeight, yScale(lossAt(a)))))
          .attr('r', 1.5 + progress * 3.5)
          .attr('fill', '#ef4444')
          .style('opacity', 0.05 + progress * 0.7);
      }
    }
  }

  /** Colored racer balls riding the curve during a race. */
  function updateRaceDots() {
    if (!svgElement || !xScale || !yScale) return;
    const plotGroup = d3.select(svgElement).select<SVGGElement>('.plot-group');
    if (plotGroup.empty()) return;
    const layer = plotGroup.select<SVGGElement>('.race-layer');
    layer.selectAll('*').remove();
    if (!race) return;

    const innerHeight = height - margin.top - margin.bottom;
    for (const r of race.racers) {
      const a = Math.max(parameterRange.min, Math.min(parameterRange.max, r.params.a));
      layer.append('circle')
        .attr('cx', xScale(a))
        .attr('cy', Math.max(0, Math.min(innerHeight, yScale(lossAt(a)))))
        .attr('r', r.finished ? 5.5 : 4.5)
        .attr('fill', r.color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.2)
        .style('opacity', r.diverged ? 0.35 : 1);
    }
  }
</script>

<svg bind:this={svgElement} {width} {height}></svg>

<style>
  svg {
    display: block;
    background: transparent;
    max-width: 100%;
    max-height: 100%;
  }
</style>
