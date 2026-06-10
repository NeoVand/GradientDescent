<script lang="ts">
  /**
   * Data Visualization Component
   * 
   * This component renders the main data plot showing:
   * - Training and test data points
   * - The true underlying function (if known)
   * - Our current model's predictions
   * 
   * We use D3.js for data visualization with Svelte's reactivity
   */
  
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { datasetStore, parametersStore, currentProblemConfig, selectedProblem, themeStore } from '../stores/stores';
  import type { DataPoint, ModelParameters } from '../types/types';
  import { ScatterChart, Eraser } from 'lucide-svelte';
  
  let svgElement: SVGSVGElement;
  let width = 400;
  let height = 400;
  // Margins shrink on narrow viewports to claw back vertical space
  $: compact = width < 480;
  $: margin = compact
    ? { top: 8, right: 12, bottom: 32, left: 38 }
    : { top: 20, right: 20, bottom: 50, left: 50 };
  $: xLabelOffset = compact ? 26 : 35;
  $: yLabelOffset = compact ? 28 : 35;
  
  // Reactive declarations
  $: data = $datasetStore.data;
  $: parameters = $parametersStore;
  $: problemConfig = $currentProblemConfig;
  $: problemType = $selectedProblem;
  $: theme = $themeStore;

  // 2D-point problems: parameters (α, β) live in the *same* coordinate system
  // as the data points (a 2D position). The marker is drawn directly on the
  // data plot, and the plot's range is forced to match parameterRange so the
  // marker's screen position matches the loss landscape's marker exactly.
  $: is2DPointProblem =
    problemType === 'circle-classifier' ||
    problemType === 'source-localization' ||
    problemType === 'mean-shift';

  // 1D curve-fitting plots are hand-editable via the toolbar: add train
  // points, add test points, or erase. The loss landscape morphs live —
  // the landscape IS the data.
  $: isEditable = !is2DPointProblem && problemType !== 'logistic-regression';

  // Active editor tool (the toolbar's pressed button)
  let editTool: 'train' | 'test' | 'erase' = 'train';

  // Last-drawn scales, kept for click → data-space inversion
  let lastXScale: d3.ScaleLinear<number, number> | null = null;
  let lastYScale: d3.ScaleLinear<number, number> | null = null;

  /** Inner-plot pixel position of a pointer event, or null outside. */
  function plotPos(event: MouseEvent): { px: number; py: number } | null {
    if (!svgElement) return null;
    const rect = svgElement.getBoundingClientRect();
    const px = event.clientX - rect.left - margin.left;
    const py = event.clientY - rect.top - margin.top;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    if (px < 0 || px > innerWidth || py < 0 || py > innerHeight) return null;
    return { px, py };
  }

  /** Index of the data point nearest to (px, py) within reach, or −1. */
  function nearestPoint(px: number, py: number, reach: number): number {
    let best = -1;
    let bestD = reach * reach;
    $datasetStore.data.forEach((p, i) => {
      const dx = lastXScale!(p.x) - px;
      const dy = lastYScale!(p.y) - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /**
   * Erase-mode hover: a red ring + ✗ on the point a click would remove.
   * Add modes draw nothing here — the tool-shaped cursor already shows
   * exactly what a click creates (one indicator, not two).
   */
  function handlePlotHover(event: PointerEvent) {
    if (!svgElement) return;
    const layer = d3.select(svgElement).select<SVGGElement>('.edit-preview');
    if (!isEditable || !lastXScale || !lastYScale || layer.empty()) return;

    layer.selectAll('*').remove();
    if (editTool !== 'erase') return;
    const pos = plotPos(event);
    if (!pos) return;

    const target = nearestPoint(pos.px, pos.py, 14);
    if (target >= 0) {
      const t = $datasetStore.data[target];
      layer.append('circle')
        .attr('cx', lastXScale(t.x)).attr('cy', lastYScale(t.y))
        .attr('r', 11)
        .attr('fill', 'rgba(239, 68, 68, 0.12)')
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2);
      layer.append('line')
        .attr('x1', lastXScale(t.x) - 4).attr('y1', lastYScale(t.y) - 4)
        .attr('x2', lastXScale(t.x) + 4).attr('y2', lastYScale(t.y) + 4)
        .attr('stroke', '#ef4444').attr('stroke-width', 2).attr('stroke-linecap', 'round');
      layer.append('line')
        .attr('x1', lastXScale(t.x) - 4).attr('y1', lastYScale(t.y) + 4)
        .attr('x2', lastXScale(t.x) + 4).attr('y2', lastYScale(t.y) - 4)
        .attr('stroke', '#ef4444').attr('stroke-width', 2).attr('stroke-linecap', 'round');
    }
  }

  function clearPlotHover() {
    if (!svgElement) return;
    d3.select(svgElement).select('.edit-preview').selectAll('*').remove();
  }

  // Tool switches restyle the preview in place
  $: if (editTool && svgElement) clearPlotHover();

  function handlePlotClick(event: MouseEvent) {
    if (!isEditable || !lastXScale || !lastYScale || !svgElement) return;
    const pos = plotPos(event);
    if (!pos) return;
    const { px, py } = pos;

    if (editTool === 'erase') {
      const best = nearestPoint(px, py, 14);
      if (best >= 0) datasetStore.removePoint(best);
    } else {
      datasetStore.addPoint({
        x: lastXScale.invert(px),
        y: lastYScale.invert(py),
        isTraining: editTool === 'train'
      });
    }
    // Re-render the hover preview against the updated dataset
    handlePlotHover(event as PointerEvent);
  }
  
  // Redraw when data or theme changes
  $: if (svgElement && data && parameters && problemConfig) {
    drawVisualization();
  }
  
  // Redraw when theme changes
  $: if (svgElement && theme) {
    drawVisualization();
  }
  
  let resizeTimer: number | null = null;
  
  onMount(() => {
    // Attached imperatively (not via template) so the plot stays a plain
    // graphic to assistive tech — editing is an auxiliary pointer affordance.
    svgElement.addEventListener('click', handlePlotClick);
    svgElement.addEventListener('pointermove', handlePlotHover);
    svgElement.addEventListener('pointerleave', clearPlotHover);

    // Set up resize observer with debouncing
    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        width = entry.contentRect.width;
        height = entry.contentRect.height;
        
        // Debounce the redraw
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          drawVisualization();
        }, 100);
      }
    });
    
    const container = svgElement.closest('.svg-container');
    if (container) {
      resizeObserver.observe(container);
    }
    
    return () => {
      svgElement?.removeEventListener('click', handlePlotClick);
      svgElement?.removeEventListener('pointermove', handlePlotHover);
      svgElement?.removeEventListener('pointerleave', clearPlotHover);
      resizeObserver.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  });

  function drawVisualization() {
    // Clear previous content
    d3.select(svgElement).selectAll('*').remove();
    
    const svg = d3.select(svgElement);
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Create clipping path to keep everything within frame
    svg.append('defs')
      .append('clipPath')
      .attr('id', 'data-clip-path')
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', innerWidth)
      .attr('height', innerHeight);
    
    // Create scales
    let xScale: d3.ScaleLinear<number, number>;
    let yScale: d3.ScaleLinear<number, number>;
    if (is2DPointProblem) {
      // Lock the plot range to the per-problem parameter range so the marker's
      // (α, β) position lines up with the same point on the loss landscape.
      const range = problemConfig.parameterRange ?? { min: -2, max: 2 };
      xScale = d3.scaleLinear().domain([range.min, range.max]).range([0, innerWidth]);
      yScale = d3.scaleLinear().domain([range.min, range.max]).range([innerHeight, 0]);
    } else {
      const xExtent = d3.extent(data, d => d.x) as [number, number];
      const yExtent = d3.extent(data, d => d.y) as [number, number];
      const xPadding = (xExtent[1] - xExtent[0]) * 0.1;
      const yPadding = (yExtent[1] - yExtent[0]) * 0.1;
      xScale = d3.scaleLinear()
        .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
        .range([0, innerWidth]);
      yScale = d3.scaleLinear()
        .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
        .range([innerHeight, 0]);
    }

    // Remember the scales for click-to-edit inversion
    lastXScale = xScale;
    lastYScale = yScale;
    
    // Create axes
    const xAxis = d3.axisBottom(xScale).tickSizeOuter(0);
    const yAxis = d3.axisLeft(yScale).tickSizeOuter(0);
    
    // Style axes with theme-aware colors
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const axisColor = isDarkMode ? '#527a75' : '#064e3b';
    
    // Bottom axis
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call(g => g.selectAll('line, path').attr('stroke', axisColor))
      .call(g => g.selectAll('text').attr('fill', axisColor));
    
    // Left axis
    g.append('g')
      .attr('class', 'y-axis')
      .call(yAxis)
      .call(g => g.selectAll('line, path').attr('stroke', axisColor))
      .call(g => g.selectAll('text').attr('fill', axisColor));
    
    // Top axis (frame - no ticks)
    g.append('g')
      .attr('class', 'x-axis-top')
      .call(d3.axisTop(xScale).tickSizeOuter(0).tickSize(0).tickFormat(() => ''))
      .call(g => g.selectAll('line').remove())
      .call(g => g.select('.domain').attr('stroke', axisColor));
    
    // Right axis (frame - no ticks)
    g.append('g')
      .attr('class', 'y-axis-right')
      .attr('transform', `translate(${innerWidth},0)`)
      .call(d3.axisRight(yScale).tickSizeOuter(0).tickSize(0).tickFormat(() => ''))
      .call(g => g.selectAll('line').remove())
      .call(g => g.select('.domain').attr('stroke', axisColor));
    
    // Add axis labels
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + xLabelOffset)
      .attr('fill', axisColor)
      .style('text-anchor', 'middle')
      .attr('font-size', '12px')
      .text('X');

    g.append('text')
      .attr('x', -yLabelOffset)
      .attr('y', innerHeight / 2)
      .attr('fill', axisColor)
      .style('text-anchor', 'middle')
      .attr('font-size', '12px')
      .text('Y');
    
    // Add background for the plot area
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    g.insert('rect', ':first-child')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', isDark ? '#060913' : '#ffffff')
      .attr('rx', 4);
    
    // Create a group with clipping for all plot content
    const clippedGroup = g.append('g')
      .attr('clip-path', 'url(#data-clip-path)')
      .attr('transform', `translate(${-margin.left},${-margin.top})`);
    
    const plotGroup = clippedGroup.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Add grid lines to clipped group (isDark already declared above)
    // Skip grid for logistic regression and 2D-point problems (heatmap fills it)
    if (problemType !== 'logistic-regression' && !is2DPointProblem) {
      const gridColor = isDark ? '#64748b' : '#9ca3af';
      
      // Regular grid lines
      plotGroup.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis.tickSize(-innerHeight).tickFormat(() => ''))
        .call(g => g.selectAll('line').attr('stroke', gridColor))
        .call(g => g.selectAll('path').attr('stroke', 'none'))
        .style('stroke-dasharray', '2,4')
        .style('opacity', isDark ? 0.3 : 0.35);
      
      plotGroup.append('g')
      .attr('class', 'grid')
      .call(yAxis.tickSize(-innerWidth).tickFormat(() => ''))
        .call(g => g.selectAll('line').attr('stroke', gridColor))
        .call(g => g.selectAll('path').attr('stroke', 'none'))
        .style('stroke-dasharray', '2,4')
        .style('opacity', isDark ? 0.3 : 0.35);
    }
    
    // Emphasize X=0 and Y=0 axes
    if (xScale(0) >= 0 && xScale(0) <= innerWidth) {
      plotGroup.append('line')
        .attr('class', 'zero-axis')
        .attr('x1', xScale(0))
        .attr('y1', 0)
        .attr('x2', xScale(0))
        .attr('y2', innerHeight)
        .attr('stroke', axisColor)
        .attr('stroke-width', 1.5)
        .style('opacity', 0.4);
    }
    
    if (yScale(0) >= 0 && yScale(0) <= innerHeight) {
      plotGroup.append('line')
        .attr('class', 'zero-axis')
        .attr('x1', 0)
        .attr('y1', yScale(0))
        .attr('x2', innerWidth)
        .attr('y2', yScale(0))
        .attr('stroke', axisColor)
        .attr('stroke-width', 1.5)
        .style('opacity', 0.4);
    }
    
    // Draw the model prediction line/curve (will be clipped)
    drawModelPrediction(plotGroup, xScale, yScale, innerWidth);

    // Draw data points (will be clipped)
    drawDataPoints(plotGroup, xScale, yScale);

    // For 2D-point problems, overlay the marker (α, β) directly on the plot
    if (is2DPointProblem) {
      drawParamsMarker(plotGroup, xScale, yScale);
    }

    // Editor hover preview rides above everything (filled on pointermove)
    g.append('g')
      .attr('class', 'edit-preview')
      .style('pointer-events', 'none');
  }

  /**
   * Heatmap renderer for 2D-point problems. `valueAt(x, y)` returns the
   * scalar field at (x, y) given current params; the result is mapped to a
   * color via `colorFor(t)` where t ∈ [0, 1] (after normalisation).
   */
  function draw2DHeatmap(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    innerWidth: number,
    innerHeight: number,
    valueAt: (x: number, y: number) => number,
    colorFor: (normalized: number) => string,
    opacity: number = 0.6
  ) {
    const res = 50;
    const cellW = innerWidth / res;
    const cellH = innerHeight / res;
    // First pass: collect values for normalization
    const vals: number[] = [];
    for (let i = 0; i < res; i++) {
      for (let j = 0; j < res; j++) {
        const cx = xScale.invert((i + 0.5) * cellW);
        const cy = yScale.invert((j + 0.5) * cellH);
        vals.push(valueAt(cx, cy));
      }
    }
    let lo = Infinity, hi = -Infinity;
    for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = hi - lo || 1;
    // Second pass: render
    let k = 0;
    for (let i = 0; i < res; i++) {
      for (let j = 0; j < res; j++) {
        const px = Math.round(i * cellW);
        const py = Math.round(j * cellH);
        const pxN = Math.round((i + 1) * cellW);
        const pyN = Math.round((j + 1) * cellH);
        const t = (vals[k++] - lo) / span;
        g.append('rect')
          .attr('x', px).attr('y', py)
          .attr('width', pxN - px).attr('height', pyN - py)
          .attr('fill', colorFor(t))
          .style('opacity', opacity);
      }
    }
  }

  /**
   * Marker overlay drawn on the data plot for 2D-point problems. The marker
   * sits at (params.a, params.b) and matches the orange marker on the loss
   * landscape so the user can see the geometric meaning of the parameters.
   */
  function drawParamsMarker(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) {
    const cx = xScale(parameters.a);
    const cy = yScale(parameters.b);
    const marker = g.append('g').attr('class', 'params-marker').attr('transform', `translate(${cx}, ${cy})`);
    marker.append('circle').attr('r', 10).attr('fill', 'none').attr('stroke', '#f59e0b').attr('stroke-width', 2);
    marker.append('circle').attr('r', 6).attr('fill', '#f59e0b').attr('stroke', '#fff').attr('stroke-width', 2);
  }
  
  function drawModelPrediction(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    innerWidth: number
  ) {
    const innerHeight = height - margin.top - margin.bottom;
    const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
    const middleColor = isDarkTheme ? '#1e293b' : '#ffffff';

    if (problemType === 'circle-classifier') {
      // Probability heatmap: blue (outside) → mid → green (inside) of model circle
      const R = 1.0, tau = 0.4;
      const probAt = (x: number, y: number) => {
        const d2 = (x - parameters.a) ** 2 + (y - parameters.b) ** 2;
        const z = (R * R - d2) / tau;
        return 1 / (1 + Math.exp(-z));
      };
      draw2DHeatmap(g, xScale, yScale, innerWidth, innerHeight,
        probAt,
        (t) => t < 0.5
          ? d3.interpolateRgb('#3b82f6', middleColor)(t * 2)
          : d3.interpolateRgb(middleColor, '#10b981')((t - 0.5) * 2),
        isDarkTheme ? 0.5 : 0.35);
      // Model circle outline (decision boundary)
      const circle = d3.path();
      const N = 100;
      for (let i = 0; i <= N; i++) {
        const ang = (i / N) * Math.PI * 2;
        const x = parameters.a + R * Math.cos(ang);
        const y = parameters.b + R * Math.sin(ang);
        if (i === 0) circle.moveTo(xScale(x), yScale(y));
        else circle.lineTo(xScale(x), yScale(y));
      }
      g.append('path').attr('d', circle.toString())
        .attr('fill', 'none').attr('stroke', '#3b82f6').attr('stroke-width', 2.5).style('opacity', 1);
      return;
    }

    if (problemType === 'source-localization') {
      // Heatmap of predicted signal field for the current source guess
      const K = 1.0, eps = 0.5;
      const sigAt = (x: number, y: number) => K / ((x - parameters.a) ** 2 + (y - parameters.b) ** 2 + eps);
      draw2DHeatmap(g, xScale, yScale, innerWidth, innerHeight,
        sigAt,
        (t) => d3.interpolateViridis(t),
        0.55);
      return;
    }

    if (problemType === 'mean-shift') {
      // Faint kernel-density heatmap centered on the marker
      const sigma2 = 0.2;
      const trainData = data.filter(d => d.isTraining);
      const kde = (x: number, y: number) => {
        let s = 0;
        for (const p of trainData) {
          const d2 = (x - p.x) ** 2 + (y - p.y) ** 2;
          s += Math.exp(-d2 / (2 * sigma2));
        }
        return s / Math.max(1, trainData.length);
      };
      draw2DHeatmap(g, xScale, yScale, innerWidth, innerHeight,
        kde,
        (t) => d3.interpolateRgb(middleColor, '#10b981')(t),
        0.35);
      return;
    }

    // For classification, draw probability heatmap with decision boundary
    if (problemType === 'logistic-regression') {
      const xDomain = xScale.domain();
      const yDomain = yScale.domain();
      
      // Create probability heatmap - draw as single image for smooth appearance
      const heatmapResolution = 60;
      const cellWidth = innerWidth / heatmapResolution;
      const cellHeight = innerHeight / heatmapResolution;
      
      // Get theme for gradient colors
      const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
      const middleColor = isDarkTheme ? '#1e293b' : '#ffffff'; // Dark gray for dark mode, white for light mode
      
      // Create all cells with exact sizing (no overlap, no gaps)
      for (let i = 0; i < heatmapResolution; i++) {
        for (let j = 0; j < heatmapResolution; j++) {
          // Calculate exact pixel position
          const pixelX = Math.round(i * cellWidth);
          const pixelY = Math.round(j * cellHeight);
          
          // Calculate exact cell dimensions
          const nextPixelX = Math.round((i + 1) * cellWidth);
          const nextPixelY = Math.round((j + 1) * cellHeight);
          const exactWidth = nextPixelX - pixelX;
          const exactHeight = nextPixelY - pixelY;
          
          // Convert pixel position back to data space for center of cell
          const x = xScale.invert(pixelX + exactWidth / 2);
          const y = yScale.invert(pixelY + exactHeight / 2);
          
          // Calculate probability at this point
          const z = parameters.a * x + parameters.b * y;
          const probability = 1 / (1 + Math.exp(-z));
          
          // Color based on probability with theme-aware middle color
          // Blue for class 0 (p near 0), middle color at p=0.5, green for class 1 (p near 1)
          let color;
          if (probability < 0.5) {
            // Interpolate from blue to middle color
            const t = probability * 2; // 0 to 1
            color = d3.interpolateRgb('#3b82f6', middleColor)(t);
          } else {
            // Interpolate from middle color to green
            const t = (probability - 0.5) * 2; // 0 to 1
            color = d3.interpolateRgb(middleColor, '#10b981')(t);
          }
          
          // Draw cell with exact dimensions - no overlap, no gaps
          g.append('rect')
            .attr('x', pixelX)
            .attr('y', pixelY)
            .attr('width', exactWidth)
            .attr('height', exactHeight)
            .attr('fill', color)
            .style('opacity', isDarkTheme ? 0.5 : 0.35);
        }
      }
      
      // Current model decision boundary with confidence bands
      if (parameters.b !== 0) {
        const linePoints = [];
        const numPoints = 100;
        
        for (let i = 0; i <= numPoints; i++) {
          const x = xDomain[0] + (i / numPoints) * (xDomain[1] - xDomain[0]);
          const y = -parameters.a * x / parameters.b;
          linePoints.push({ x, y });
        }
        
        const lineGenerator = d3.line<{x: number, y: number}>()
          .x(d => xScale(d.x))
          .y(d => yScale(d.y));
        
        // Draw confidence bands as dashed lines
        const bandWidth = 0.25; // Distance from boundary
        const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
        const bandColor = isDarkTheme ? '#94a3b8' : '#475569';
        
        // Upper confidence line (dashed)
        const upperBand = linePoints.map(p => ({ 
          x: p.x, 
          y: p.y + bandWidth 
        }));
        
        g.append('path')
          .datum(upperBand)
          .attr('fill', 'none')
          .attr('stroke', bandColor)
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '4,3')
          .attr('d', lineGenerator)
          .style('opacity', 0.6);
        
        // Lower confidence line (dashed)
        const lowerBand = linePoints.map(p => ({ 
          x: p.x, 
          y: p.y - bandWidth 
        }));
        
        g.append('path')
          .datum(lowerBand)
          .attr('fill', 'none')
          .attr('stroke', bandColor)
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '4,3')
          .attr('d', lineGenerator)
          .style('opacity', 0.6);
        
        // Draw current model decision boundary (solid line)
        g.append('path')
          .datum(linePoints)
          .attr('fill', 'none')
          .attr('stroke', '#3b82f6')
          .attr('stroke-width', 2.5)
          .attr('d', lineGenerator)
          .style('opacity', 1);
      }
    } else {
      // For regression, draw prediction curves
    const numPoints = 100;
    const xDomain = xScale.domain();
    const step = (xDomain[1] - xDomain[0]) / numPoints;
    
    // Generate points for current model
    const modelData = [];
    for (let i = 0; i <= numPoints; i++) {
      const x = xDomain[0] + i * step;
      const y = problemConfig.predict(x, parameters);
      modelData.push({ x, y });
    }
    
    // Generate points for true model
    const trueModelData = [];
    for (let i = 0; i <= numPoints; i++) {
      const x = xDomain[0] + i * step;
      const y = problemConfig.predict(x, problemConfig.trueParameters);
      trueModelData.push({ x, y });
    }
    
    const line = d3.line<{ x: number; y: number }>()
      .x(d => xScale(d.x))
      .y(d => yScale(d.y))
      .curve(d3.curveMonotoneX);
    
    // Draw the true model line (dashed)
    g.append('path')
      .datum(trueModelData)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '8,4')
      .attr('d', line)
      .style('opacity', 0.6);
    
    // Draw the current model prediction line
    g.append('path')
      .datum(modelData)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 3)
      .attr('d', line)
      .style('opacity', 1);
    }
  }
  
  function drawDataPoints(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) {
    // Separate training and test data
    const trainData = data.filter(d => d.isTraining);
    const testData = data.filter(d => !d.isTraining);

    const pointSize = 7;  // Slightly larger for better visibility

    // Get theme for stroke colors
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const strokeColor = isDark ? '#fff' : '#000';

    // -------- 2D-point problems --------

    if (problemType === 'circle-classifier') {
      const all = [...trainData, ...testData];
      // Class 0 (outside, blue circles), Class 1 (inside, green squares)
      for (const p of all) {
        const isTrain = p.isTraining;
        const isInside = p.label === 1;
        const px = xScale(p.x), py = yScale(p.y);
        if (isInside) {
          g.append('rect')
            .attr('x', px - pointSize).attr('y', py - pointSize)
            .attr('width', pointSize * 2).attr('height', pointSize * 2)
            .attr('fill', '#10b981').attr('stroke', strokeColor).attr('stroke-width', 1.5)
            .attr('stroke-dasharray', isTrain ? null : '3,2')
            .style('opacity', isTrain ? 0.85 : 0.7);
        } else {
          g.append('circle')
            .attr('cx', px).attr('cy', py).attr('r', pointSize)
            .attr('fill', '#3b82f6').attr('stroke', strokeColor).attr('stroke-width', 1.5)
            .attr('stroke-dasharray', isTrain ? null : '3,2')
            .style('opacity', isTrain ? 0.85 : 0.75);
        }
        // Misclassified marker (model says inside iff dist < R)
        const R = 1.0;
        const d2 = (p.x - parameters.a) ** 2 + (p.y - parameters.b) ** 2;
        const predInside = d2 < R * R;
        if (predInside !== isInside) {
          const xs = 4;
          g.append('line').attr('x1', px - xs).attr('y1', py - xs).attr('x2', px + xs).attr('y2', py + xs)
            .attr('stroke', '#ef4444').attr('stroke-width', 2.5).attr('stroke-linecap', 'round');
          g.append('line').attr('x1', px - xs).attr('y1', py + xs).attr('x2', px + xs).attr('y2', py - xs)
            .attr('stroke', '#ef4444').attr('stroke-width', 2.5).attr('stroke-linecap', 'round');
        }
      }
      return;
    }

    if (problemType === 'source-localization') {
      // Size each sensor dot by its measured signal strength
      const all = [...trainData, ...testData];
      const sigs = all.map(d => d.label ?? 0);
      const lo = Math.min(...sigs), hi = Math.max(...sigs);
      const span = hi - lo || 1;
      const sizeFor = (s: number) => 4 + ((s - lo) / span) * 10;
      for (const p of all) {
        g.append('circle')
          .attr('cx', xScale(p.x)).attr('cy', yScale(p.y))
          .attr('r', sizeFor(p.label ?? 0))
          .attr('fill', '#fbbf24').attr('stroke', strokeColor).attr('stroke-width', 1.5)
          .attr('stroke-dasharray', p.isTraining ? null : '3,2')
          .style('opacity', p.isTraining ? 0.9 : 0.7);
      }
      // Mark the *true* source position with a green dashed star (target)
      const tx = xScale(problemConfig.trueParameters.a);
      const ty = yScale(problemConfig.trueParameters.b);
      g.append('circle').attr('cx', tx).attr('cy', ty).attr('r', 4)
        .attr('fill', '#10b981').attr('stroke', '#10b981')
        .attr('stroke-width', 2).attr('stroke-dasharray', '4,2').style('opacity', 0.7);
      return;
    }

    if (problemType === 'mean-shift') {
      // Just plain 2D scatter
      for (const p of trainData) {
        g.append('circle').attr('cx', xScale(p.x)).attr('cy', yScale(p.y)).attr('r', pointSize - 1)
          .attr('fill', '#3b82f6').attr('stroke', strokeColor).attr('stroke-width', 1.5)
          .style('opacity', 0.85);
      }
      for (const p of testData) {
        g.append('circle').attr('cx', xScale(p.x)).attr('cy', yScale(p.y)).attr('r', pointSize - 1)
          .attr('fill', '#10b981').attr('stroke', strokeColor).attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '3,2')
          .style('opacity', 0.7);
      }
      return;
    }

    // Helper function to check if a classification point is correctly classified
    const isCorrectlyClassified = (point: DataPoint): boolean => {
      if (problemType !== 'logistic-regression' || point.label === undefined) return true;
      const z = parameters.a * point.x + parameters.b * point.y;
      const predicted = z > 0 ? 1 : 0;
      return predicted === point.label;
    };

    if (problemType === 'logistic-regression') {
      // For classification: circles for class 0 (blue), squares for class 1 (green)
      
      // Class 0 training points (circles - solid, blue)
      const class0Train = trainData.filter(d => d.label === 0);
      g.selectAll('.train-class0')
        .data(class0Train)
        .enter()
        .append('circle')
        .attr('class', 'train-class0')
        .attr('cx', d => xScale(d.x))
        .attr('cy', d => yScale(d.y))
        .attr('r', pointSize)
        .attr('fill', '#3b82f6')
        .attr('stroke', strokeColor)
        .attr('stroke-width', 1.5)
        .style('opacity', 0.85);
      
      // Class 1 training points (squares - solid, green)
      const class1Train = trainData.filter(d => d.label === 1);
      g.selectAll('.train-class1')
        .data(class1Train)
        .enter()
        .append('rect')
        .attr('class', 'train-class1')
        .attr('x', d => xScale(d.x) - pointSize)
        .attr('y', d => yScale(d.y) - pointSize)
        .attr('width', pointSize * 2)
        .attr('height', pointSize * 2)
        .attr('fill', '#10b981')
        .attr('stroke', strokeColor)
        .attr('stroke-width', 1.5)
        .style('opacity', 0.85);
      
      // Class 0 test points (circles - dashed, blue)
      const class0Test = testData.filter(d => d.label === 0);
      g.selectAll('.test-class0')
        .data(class0Test)
        .enter()
        .append('circle')
        .attr('class', 'test-class0')
        .attr('cx', d => xScale(d.x))
        .attr('cy', d => yScale(d.y))
        .attr('r', pointSize)
        .attr('fill', '#3b82f6')
        .attr('stroke', strokeColor)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '3,2')
        .style('opacity', 0.75);
      
      // Class 1 test points (squares - dashed, green)
      const class1Test = testData.filter(d => d.label === 1);
      g.selectAll('.test-class1')
        .data(class1Test)
        .enter()
        .append('rect')
        .attr('class', 'test-class1')
        .attr('x', d => xScale(d.x) - pointSize)
        .attr('y', d => yScale(d.y) - pointSize)
        .attr('width', pointSize * 2)
        .attr('height', pointSize * 2)
        .attr('fill', '#10b981')
        .attr('stroke', strokeColor)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '3,2')
        .style('opacity', 0.75);
      
      // Mark misclassified points with red X
      [...trainData, ...testData].forEach(d => {
        if (!isCorrectlyClassified(d)) {
          const gMark = g.append('g')
            .attr('transform', `translate(${xScale(d.x)},${yScale(d.y)})`);
          
          // Red X marker
          const xSize = 4;
          gMark.append('line')
            .attr('x1', -xSize)
            .attr('y1', -xSize)
            .attr('x2', xSize)
            .attr('y2', xSize)
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 2.5)
            .attr('stroke-linecap', 'round');
          
          gMark.append('line')
            .attr('x1', -xSize)
            .attr('y1', xSize)
            .attr('x2', xSize)
            .attr('y2', -xSize)
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 2.5)
            .attr('stroke-linecap', 'round');
        }
      });
    } else {
      // For regression: traditional visualization
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const strokeColor = isDark ? '#fff' : '#000';
      
      // Draw training points (circles - solid)
    g.selectAll('.train-point')
      .data(trainData)
      .enter()
      .append('circle')
      .attr('class', 'train-point')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
        .attr('r', pointSize)
        .attr('fill', '#3b82f6')
        .attr('stroke', strokeColor)
        .attr('stroke-width', 1.5)
      .style('opacity', 0.8);
    
      // Draw test points (circles - dashed)
    g.selectAll('.test-point')
      .data(testData)
      .enter()
        .append('circle')
      .attr('class', 'test-point')
        .attr('cx', d => xScale(d.x))
        .attr('cy', d => yScale(d.y))
        .attr('r', pointSize)
        .attr('fill', '#10b981')
        .attr('stroke', strokeColor)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '3,2')
        .style('opacity', 0.7);
    }
    
  }
  
</script>

<div class="visualization-container">
  <div class="header">
    <h2>
      <ScatterChart size={20} strokeWidth={2} />
      <span>Data</span>
    </h2>
    {#if isEditable}
      <div class="header-tools" role="toolbar" aria-label="Data editor">
        <button
          class="tool-btn"
          class:active={editTool === 'train'}
          title="Add training points — click anywhere on the plot. The loss landscape reshapes live."
          aria-label="Add training points"
          aria-pressed={editTool === 'train'}
          on:click={() => (editTool = 'train')}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
            <circle cx="6" cy="9" r="4" fill="#3b82f6" />
            <path d="M10.5 4.5 H14.5 M12.5 2.5 V6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
        </button>
        <button
          class="tool-btn"
          class:active={editTool === 'test'}
          title="Add test points — held out of training, they only score the fit"
          aria-label="Add test points"
          aria-pressed={editTool === 'test'}
          on:click={() => (editTool = 'test')}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
            <circle cx="6" cy="9" r="4" fill="none" stroke="#10b981" stroke-width="1.8" stroke-dasharray="2.5,1.8" />
            <path d="M10.5 4.5 H14.5 M12.5 2.5 V6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
        </button>
        <button
          class="tool-btn erase-btn"
          class:active={editTool === 'erase'}
          title="Erase points — click a point to remove it (a dataset keeps at least 3)"
          aria-label="Erase points"
          aria-pressed={editTool === 'erase'}
          on:click={() => (editTool = 'erase')}
        >
          <Eraser size={15} strokeWidth={2.2} />
        </button>
      </div>
    {/if}
  </div>
  <div class="svg-container">
    <svg
      bind:this={svgElement}
      width={width}
      height={height}
      class:tool-train={isEditable && editTool === 'train'}
      class:tool-test={isEditable && editTool === 'test'}
      class:tool-erase={isEditable && editTool === 'erase'}
    ></svg>
    <!-- Point legend, tucked into the plot like the landscape's keys -->
    <div class="data-key" style="right: {margin.right + 8}px; bottom: {margin.bottom + 8}px;">
      {#if problemType === 'logistic-regression' || problemType === 'circle-classifier'}
        <span class="key-item">
          <svg width="12" height="12" viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="9" cy="9" r="6" fill="#3b82f6" stroke="currentColor" stroke-width="1.5" />
          </svg>
          <span>{problemType === 'circle-classifier' ? 'Outside' : 'Class 0'}</span>
        </span>
        <span class="key-item">
          <svg width="12" height="12" viewBox="0 0 18 18" aria-hidden="true">
            <rect x="3" y="3" width="12" height="12" fill="#10b981" stroke="currentColor" stroke-width="1.5" />
          </svg>
          <span>{problemType === 'circle-classifier' ? 'Inside' : 'Class 1'}</span>
        </span>
        <span class="key-item">
          <svg width="12" height="12" viewBox="0 0 18 18" aria-hidden="true">
            <line x1="5" y1="5" x2="13" y2="13" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" />
            <line x1="5" y1="13" x2="13" y2="5" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" />
          </svg>
          <span>Error</span>
        </span>
      {:else if problemType === 'source-localization'}
        <span class="key-item">
          <svg width="12" height="12" viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="9" cy="9" r="6" fill="#fbbf24" stroke="currentColor" stroke-width="1.5" />
          </svg>
          <span>Sensor</span>
        </span>
        <span class="key-item">
          <svg width="12" height="12" viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="9" cy="9" r="4" fill="#10b981" stroke="#10b981" stroke-width="2" stroke-dasharray="3,1.5" />
          </svg>
          <span>True source</span>
        </span>
      {:else}
        <span class="key-item">
          <svg width="12" height="12" viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="9" cy="9" r="6" fill="#3b82f6" stroke="#fff" stroke-width="1.5" />
          </svg>
          <span>Train</span>
        </span>
        <span class="key-item">
          <svg width="12" height="12" viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="9" cy="9" r="6" fill="#10b981" stroke="#fff" stroke-width="1.5" stroke-dasharray="3,2" />
          </svg>
          <span>Test</span>
        </span>
      {/if}
    </div>
  </div>
</div>

<style>
  .visualization-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  
  /* Same fixed header height as the Loss & Gradient panel so the two plot
     frames always start at the same y. */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: nowrap;
    height: 28px;
    margin-bottom: 0.375rem;
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
  }

  @media (max-width: 768px) {
    h2 {
      margin-left: 0;
      font-size: 0.875rem;
      gap: 0.375rem;
    }
    .header { margin-right: 0; margin-bottom: 0.125rem; }
    .data-key { font-size: 0.625rem; }
  }

  /* ---------- Data editor toolbar (same family as the landscape's) ---------- */
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

  .tool-btn:hover {
    color: #10b981;
    background: rgba(16, 185, 129, 0.1);
  }

  .tool-btn.active {
    background: rgba(16, 185, 129, 0.16);
    color: #10b981;
  }

  /* The eraser is a destructive tool — it speaks red, not emerald */
  .tool-btn.erase-btn:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }

  .tool-btn.erase-btn.active {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  /* Tool-shaped cursors: the pointer itself says what a click will do */
  svg.tool-train {
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='5.5' fill='%233b82f6' stroke='white' stroke-width='1.5'/%3E%3Cpath d='M18.5 2.5v6M15.5 5.5h6' stroke='%233b82f6' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") 12 12, crosshair;
  }

  svg.tool-test {
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='5.5' fill='rgba(16,185,129,0.3)' stroke='%2310b981' stroke-width='2' stroke-dasharray='3 2'/%3E%3Cpath d='M18.5 2.5v6M15.5 5.5h6' stroke='%2310b981' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") 12 12, crosshair;
  }

  svg.tool-erase {
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='7' fill='rgba(239,68,68,0.12)' stroke='%23ef4444' stroke-width='2'/%3E%3Cpath d='M8 16 16 8' stroke='%23ef4444' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") 12 12, pointer;
  }

  /* ---------- In-plot point legend (mirrors the landscape's corner keys) ---------- */
  .data-key {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 0.35rem 0.5rem;
    border-radius: 8px;
    pointer-events: none;
    z-index: 3;
  }

  :global([data-theme='light']) .data-key {
    background: rgba(255, 255, 255, 0.78);
    color: #475569;
  }

  :global([data-theme='dark']) .data-key {
    background: rgba(6, 9, 19, 0.68);
    color: #94a3b8;
  }

  .key-item {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.6875rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .key-item svg {
    flex-shrink: 0;
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
