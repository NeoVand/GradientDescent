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
  import { ScatterChart } from 'lucide-svelte';
  
  let svgElement: SVGSVGElement;
  let width = 400;
  let height = 400;
  const margin = { top: 20, right: 20, bottom: 50, left: 50 };
  
  // Reactive declarations
  $: data = $datasetStore.data;
  $: parameters = $parametersStore;
  $: problemConfig = $currentProblemConfig;
  $: problemType = $selectedProblem;
  $: theme = $themeStore;
  
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
    const xExtent = d3.extent(data, d => d.x) as [number, number];
    const yExtent = d3.extent(data, d => d.y) as [number, number];
    
    // Add some padding to the scales
    const xPadding = (xExtent[1] - xExtent[0]) * 0.1;
    const yPadding = (yExtent[1] - yExtent[0]) * 0.1;
    
    const xScale = d3.scaleLinear()
      .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
      .range([0, innerWidth]);
    
    const yScale = d3.scaleLinear()
      .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
      .range([innerHeight, 0]);
    
    // Create axes
    const xAxis = d3.axisBottom(xScale).tickSizeOuter(0);
    const yAxis = d3.axisLeft(yScale).tickSizeOuter(0);
    
    // Style axes
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
      .attr('y', innerHeight + 35)
      .attr('fill', axisColor)
      .style('text-anchor', 'middle')
      .attr('font-size', '12px')
      .text('X');
    
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -30)
      .attr('x', -innerHeight / 2)
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
    // Skip grid for logistic regression (heatmap is enough)
    if (problemType !== 'logistic-regression') {
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
  }
  
  function drawModelPrediction(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    innerWidth: number
  ) {
    // For classification, draw probability heatmap with decision boundary
    if (problemType === 'logistic-regression') {
      const xDomain = xScale.domain();
      const yDomain = yScale.domain();
      
      // Create probability heatmap - draw as single image for smooth appearance
      const heatmapResolution = 60;
      const cellWidth = innerWidth / heatmapResolution;
      const cellHeight = innerHeight / heatmapResolution;
      
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
          
          // Color based on probability
          // probability near 0 = blue (class 0), near 1 = red (class 1)
          const color = d3.interpolateRdBu(1 - probability);
          
          // Draw cell with exact dimensions - no overlap, no gaps
          g.append('rect')
            .attr('x', pixelX)
            .attr('y', pixelY)
            .attr('width', exactWidth)
            .attr('height', exactHeight)
            .attr('fill', color)
            .style('opacity', 0.35);
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
        
        // Upper confidence line (dashed)
        const upperBand = linePoints.map(p => ({ 
          x: p.x, 
          y: p.y + bandWidth 
        }));
        
        g.append('path')
          .datum(upperBand)
          .attr('fill', 'none')
          .attr('stroke', '#3b82f6')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '4,3')
          .attr('d', lineGenerator)
          .style('opacity', 0.5);
        
        // Lower confidence line (dashed)
        const lowerBand = linePoints.map(p => ({ 
          x: p.x, 
          y: p.y - bandWidth 
        }));
        
        g.append('path')
          .datum(lowerBand)
          .attr('fill', 'none')
          .attr('stroke', '#3b82f6')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '4,3')
          .attr('d', lineGenerator)
          .style('opacity', 0.5);
        
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
    
    // Helper function to check if a classification point is correctly classified
    const isCorrectlyClassified = (point: DataPoint): boolean => {
      if (problemType !== 'logistic-regression' || point.label === undefined) return true;
      const z = parameters.a * point.x + parameters.b * point.y;
      const predicted = z > 0 ? 1 : 0;
      return predicted === point.label;
    };
    
    if (problemType === 'logistic-regression') {
      // For classification: use different shapes for classes, colors for correctness
      
      // Class 0 training points (circles - solid)
      const class0Train = trainData.filter(d => d.label === 0);
      g.selectAll('.train-class0')
        .data(class0Train)
        .enter()
        .append('circle')
        .attr('class', 'train-class0')
        .attr('cx', d => xScale(d.x))
        .attr('cy', d => yScale(d.y))
        .attr('r', pointSize)
        .attr('fill', d => isCorrectlyClassified(d) ? '#6b7280' : '#ef4444')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .style('opacity', 0.85);
      
      // Class 1 training points (triangles - solid)
      const class1Train = trainData.filter(d => d.label === 1);
      g.selectAll('.train-class1')
        .data(class1Train)
        .enter()
        .append('path')
        .attr('class', 'train-class1')
        .attr('d', d3.symbol().type(d3.symbolTriangle).size(pointSize * pointSize * 4.5))
        .attr('transform', d => `translate(${xScale(d.x)},${yScale(d.y)})`)
        .attr('fill', d => isCorrectlyClassified(d) ? '#6b7280' : '#ef4444')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .style('opacity', 0.85);
      
      // Class 0 test points (circles - dashed)
      const class0Test = testData.filter(d => d.label === 0);
      g.selectAll('.test-class0')
        .data(class0Test)
        .enter()
        .append('circle')
        .attr('class', 'test-class0')
        .attr('cx', d => xScale(d.x))
        .attr('cy', d => yScale(d.y))
        .attr('r', pointSize)
        .attr('fill', d => isCorrectlyClassified(d) ? '#6b7280' : '#ef4444')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '3,2')
        .style('opacity', 0.75);
      
      // Class 1 test points (triangles - dashed)
      const class1Test = testData.filter(d => d.label === 1);
      g.selectAll('.test-class1')
        .data(class1Test)
        .enter()
        .append('path')
        .attr('class', 'test-class1')
        .attr('d', d3.symbol().type(d3.symbolTriangle).size(pointSize * pointSize * 4.5))
        .attr('transform', d => `translate(${xScale(d.x)},${yScale(d.y)})`)
        .attr('fill', d => isCorrectlyClassified(d) ? '#6b7280' : '#ef4444')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '3,2')
        .style('opacity', 0.75);
    } else {
      // For regression: traditional visualization
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
        .attr('stroke', '#fff')
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
        .attr('stroke', '#fff')
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
    <div class="legend-controls">
      {#if problemType === 'logistic-regression'}
        <div class="legend-item">
          <div class="legend-symbol">
            <svg width="18" height="18" viewBox="0 0 18 18">
              <circle cx="9" cy="9" r="6" fill="#6b7280" stroke="#fff" stroke-width="1.5" />
            </svg>
          </div>
          <span>Solid</span>
        </div>
        <div class="legend-item">
          <div class="legend-symbol">
            <svg width="18" height="18" viewBox="0 0 18 18">
              <circle cx="9" cy="9" r="6" fill="#6b7280" stroke="#fff" stroke-width="1.5" stroke-dasharray="3,2" />
            </svg>
          </div>
          <span>Dashed</span>
        </div>
        <div class="legend-item">
          <div class="legend-symbol">
            <svg width="18" height="18" viewBox="0 0 18 18">
              <circle cx="9" cy="9" r="6" fill="#ef4444" stroke="#fff" stroke-width="1.5" />
            </svg>
          </div>
          <span>Error</span>
        </div>
      {:else}
        <div class="legend-item">
          <div class="legend-symbol">
            <svg width="18" height="18" viewBox="0 0 18 18">
              <circle cx="9" cy="9" r="6" fill="#3b82f6" stroke="#fff" stroke-width="1.5" />
            </svg>
          </div>
          <span>Train</span>
        </div>
        <div class="legend-item">
          <div class="legend-symbol">
            <svg width="18" height="18" viewBox="0 0 18 18">
              <circle cx="9" cy="9" r="6" fill="#10b981" stroke="#fff" stroke-width="1.5" stroke-dasharray="3,2" />
            </svg>
          </div>
          <span>Test</span>
        </div>
      {/if}
    </div>
  </div>
  <div class="svg-container">
    <svg bind:this={svgElement} width={width} height={height}></svg>
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
  
  .legend-controls {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }
  
  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    color: var(--color-text-tertiary);
    font-weight: 500;
  }
  
  .legend-symbol {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
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
