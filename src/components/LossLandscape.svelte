<script lang="ts">
  /**
   * Gradient Field Component
   * 
   * Visualizes the gradient vector field of the loss function.
   * Shows the direction of steepest descent at each point in parameter space.
   */
  
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { 
    datasetStore,
    parametersStore,
    historyStore,
    currentProblemConfig,
    themeStore
  } from '../stores/stores';
  import type { ModelParameters } from '../types/types';
  import { TrendingDown } from 'lucide-svelte';
  
  // Component references
  let svgElement: SVGSVGElement;
  let width = 400;
  let height = 400;
  const margin = { top: 20, right: 20, bottom: 50, left: 50 };
  
  // Parameter range for visualization
  const parameterRange = { min: -5, max: 5 };
  const gridResolution = 24; // 24x24 grid for gradient arrows
  
  // Reactive data
  $: data = $datasetStore.data;
  $: parameters = $parametersStore;
  $: history = $historyStore;
  $: problemConfig = $currentProblemConfig;
  $: theme = $themeStore;
  
  // Redraw when data changes
  $: if (svgElement && data.length > 0 && problemConfig) {
    drawGradientField();
  }
  
  // Redraw when history changes (for trail updates)
  $: if (svgElement && history.length > 0 && !isDragging) {
    updateTrail();
  }
  
  let isDragging = false;
  
  // Redraw when theme changes
  $: if (svgElement && theme) {
    drawGradientField();
    }
  
  let resizeTimer: number | null = null;
  
  onMount(() => {
    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        width = entry.contentRect.width;
        height = entry.contentRect.height;
        
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          drawGradientField();
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
  
  function drawGradientField() {
    // Clear previous content
    d3.select(svgElement).selectAll('*').remove();
    
    const svg = d3.select(svgElement);
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Create clipping path
    svg.append('defs')
      .append('clipPath')
      .attr('id', 'gradient-clip-path')
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', innerWidth)
      .attr('height', innerHeight);
    
    // Create scales
    const xScale = d3.scaleLinear()
      .domain([parameterRange.min, parameterRange.max])
      .range([0, innerWidth]);
    
    const yScale = d3.scaleLinear()
      .domain([parameterRange.min, parameterRange.max])
      .range([innerHeight, 0]);
    
    // Add axes
    const xAxis = d3.axisBottom(xScale).tickSizeOuter(0);
    const yAxis = d3.axisLeft(yScale).tickSizeOuter(0);
    
    const axisColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text-tertiary').trim();
    
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
      .attr('y', innerHeight + 38)
      .attr('fill', axisColor)
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .style('text-anchor', 'middle')
      .text('A');
    
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -35)
      .attr('x', -innerHeight / 2)
      .attr('fill', axisColor)
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .style('text-anchor', 'middle')
      .text('B');
    
    // Add background
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    g.insert('rect', ':first-child')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', isDark ? '#060913' : '#ffffff')
      .attr('rx', 4);
    
    // Create clipped group for gradient field
    const clippedGroup = g.append('g')
      .attr('clip-path', 'url(#gradient-clip-path)')
      .attr('transform', `translate(${-margin.left},${-margin.top})`);
    
    const plotGroup = clippedGroup.append('g')
      .attr('class', 'plot-group')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Draw gradient field (behind trail)
    drawGradients(plotGroup, xScale, yScale, innerWidth, innerHeight);
    
    // Draw training path with fade effect (in clipped group, above gradients, below marker)
    drawTrainingPath(plotGroup, xScale, yScale);
    
    // Draw current position last (needs to be in main group, not clipped, on top)
    drawCurrentPosition(g, xScale, yScale, innerWidth, innerHeight);
  }
  
  function drawTrainingPath(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) {
    if (history.length < 2) return;
    
    // Get last 100 points
    const windowSize = 100;
    const fadeThreshold = 50; // Only fade when more than 50 points
    const recentHistory = history.slice(Math.max(0, history.length - windowSize));
    
    // Draw path with conditional fade effect
    for (let i = 0; i < recentHistory.length - 1; i++) {
      const current = recentHistory[i];
      const next = recentHistory[i + 1];
      
      let opacity, thickness;
      
      if (recentHistory.length <= fadeThreshold) {
        // No fading when path is short - full visibility
        opacity = 0.8;
        thickness = 10;
      } else {
        // Calculate how far this segment is from the end
        const distanceFromEnd = recentHistory.length - 1 - i;
        
        if (distanceFromEnd <= fadeThreshold) {
          // Most recent 50 points: full visibility
          opacity = 0.8;
          thickness = 10;
        } else {
          // Older points: fade out
          const fadeProgress = (i / (recentHistory.length - fadeThreshold - 1));
          opacity = 0.05 + fadeProgress * 0.75; // 0.05 to 0.8
          thickness = 2 + fadeProgress * 8; // 2 to 10
        }
      }
      
      // Draw line segment
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
    innerWidth: number,
    innerHeight: number
  ) {
    const trainData = data.filter(d => d.isTraining);
    if (trainData.length === 0) return;
    
    // Get theme
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const arrowColor = isDark ? '#ffffff' : '#000000';
    
    // Compute gradients at grid points
    const gradients = [];
    let maxMagnitude = 0;
    
    for (let i = 0; i < gridResolution; i++) {
      for (let j = 0; j < gridResolution; j++) {
        const a = parameterRange.min + (i / (gridResolution - 1)) * (parameterRange.max - parameterRange.min);
        const b = parameterRange.min + (j / (gridResolution - 1)) * (parameterRange.max - parameterRange.min);
        
        const gradient = problemConfig.computeGradient(trainData, { a, b });
        const magnitude = Math.sqrt(gradient.a * gradient.a + gradient.b * gradient.b);
        
        if (magnitude > 0.001) {
          gradients.push({ a, b, gradient, magnitude });
          maxMagnitude = Math.max(maxMagnitude, magnitude);
        }
      }
    }
    
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
    
    for (const item of gradients) {
      const { a, b, gradient, magnitude } = item;
      const normalizedMagnitude = magnitude / maxMagnitude;
      
      // Position
      const x = xScale(a);
      const y = yScale(b);
      
      // Normalize gradient direction
      const normGradA = -gradient.a / magnitude;
      const normGradB = -gradient.b / magnitude;
      
      // Arrow length based on magnitude
      const arrowLength = baseArrowLength + (maxArrowLength - baseArrowLength) * normalizedMagnitude;
      
      // End position
      const x2 = x + normGradA * arrowLength;
      const y2 = y - normGradB * arrowLength; // Negative because SVG y is inverted
      
      // Draw arrow
      g.append('line')
        .attr('class', 'gradient-arrow')
        .attr('x1', x)
        .attr('y1', y)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('stroke', arrowColor)
        .attr('stroke-width', 1 + normalizedMagnitude * 1.5)
        .attr('marker-end', 'url(#arrowhead)')
        .style('opacity', isDark ? 0.7 + normalizedMagnitude * 0.2 : 0.5 + normalizedMagnitude * 0.3);
    }
  }
  
  function drawCurrentPosition(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    innerWidth: number,
    innerHeight: number
  ) {
    const x = xScale(parameters.a);
    const y = yScale(parameters.b);
    
    const marker = g.append('g')
      .attr('class', 'current-position')
      .attr('transform', `translate(${x}, ${y})`);
    
    // Outer ring
    marker.append('circle')
      .attr('r', 10)
      .attr('fill', 'none')
      .attr('stroke', '#f59e0b')
      .attr('stroke-width', 2);
    
    // Inner circle
    marker.append('circle')
      .attr('r', 6)
      .attr('fill', '#f59e0b')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'grab');
    
    // Make draggable
    marker.call(d3.drag<SVGGElement, unknown>()
      .on('start', function() {
        isDragging = true;
        d3.select(this).style('cursor', 'grabbing');
      })
      .on('drag', function(event) {
        // Convert pixel coordinates to parameter values
        const newA = xScale.invert(event.x);
        const newB = yScale.invert(event.y);
        
        // Clamp to valid range
        const clampedA = Math.max(parameterRange.min, Math.min(parameterRange.max, newA));
        const clampedB = Math.max(parameterRange.min, Math.min(parameterRange.max, newB));
        
        // Update position immediately (visual feedback)
        const clampedX = xScale(clampedA);
        const clampedY = yScale(clampedB);
        d3.select(this)
          .attr('transform', `translate(${clampedX}, ${clampedY})`);
        
        // Update parameters store (will trigger other diagrams to update)
        parametersStore.set({ a: clampedA, b: clampedB });
        
        // Add to history
        const trainData = data.filter(d => d.isTraining);
        const testData = data.filter(d => !d.isTraining);
        const nextStep = history.length > 0 ? history[history.length - 1].step + 1 : 0;
        
        historyStore.addPoint({
          step: nextStep,
          trainLoss: problemConfig.computeLoss(trainData, { a: clampedA, b: clampedB }),
          testLoss: problemConfig.computeLoss(testData, { a: clampedA, b: clampedB }),
          parameters: { a: clampedA, b: clampedB }
        });
        
        // Manually update the trail during dragging
        const svg = d3.select(svgElement);
        const plotGroup = svg.select('.plot-group');
        if (!plotGroup.empty()) {
          plotGroup.selectAll('.path-segment').remove();
          drawTrainingPath(plotGroup, xScale, yScale);
        }
      })
      .on('end', function() {
        isDragging = false;
        d3.select(this).style('cursor', 'grab');
      }));
  }
  
  function updateTrail() {
    // Only update the trail without redrawing everything
    const svg = d3.select(svgElement);
    const plotGroup = svg.select('.plot-group');
    
    if (plotGroup.empty()) return;
    
    // Remove old trail
    plotGroup.selectAll('.path-segment').remove();
    
    // Get scales
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;
      
    const xScale = d3.scaleLinear()
      .domain([parameterRange.min, parameterRange.max])
      .range([0, innerWidth]);
    
    const yScale = d3.scaleLinear()
      .domain([parameterRange.min, parameterRange.max])
      .range([innerHeight, 0]);
    
    // Redraw trail
    drawTrainingPath(plotGroup, xScale, yScale);
    
    // Update marker position
    const marker = svg.select('.current-position');
    if (!marker.empty()) {
      const x = xScale(parameters.a);
      const y = yScale(parameters.b);
      marker.attr('transform', `translate(${x}, ${y})`);
    }
  }
</script>

<div class="gradient-container">
  <div class="header">
    <h2>
      <TrendingDown size={20} strokeWidth={2} />
      <span>Gradient Field</span>
    </h2>
  </div>
  <div class="svg-container">
    <svg bind:this={svgElement} {width} {height}></svg>
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
    margin-bottom: 0.75rem;
    flex-shrink: 0;
  }
  
  h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    opacity: 0.9;
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
