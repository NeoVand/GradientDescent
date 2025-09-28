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
  import { datasetStore, parametersStore, currentProblemConfig, selectedProblem } from '../stores/stores';
  import type { DataPoint, ModelParameters } from '../types/types';
  
  let svgElement: SVGSVGElement;
  let width = 400;
  let height = 400;
  const margin = { top: 20, right: 20, bottom: 40, left: 40 };
  
  // Reactive declarations
  $: data = $datasetStore.data;
  $: parameters = $parametersStore;
  $: problemConfig = $currentProblemConfig;
  $: problemType = $selectedProblem;
  
  // Redraw when data changes
  $: if (svgElement && data && parameters && problemConfig) {
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
    
    // Add axes
    const xAxis = d3.axisBottom(xScale).tickSizeOuter(0);
    const yAxis = d3.axisLeft(yScale).tickSizeOuter(0);
    
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .append('text')
      .attr('x', innerWidth / 2)
      .attr('y', 35)
      .attr('fill', '#666')
      .style('text-anchor', 'middle')
      .text('X');
    
    g.append('g')
      .call(yAxis)
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -30)
      .attr('x', -innerHeight / 2)
      .attr('fill', '#666')
      .style('text-anchor', 'middle')
      .text('Y');
    
    // Add grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis.tickSize(-innerHeight).tickFormat(() => ''))
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.3);
    
    g.append('g')
      .attr('class', 'grid')
      .call(yAxis.tickSize(-innerWidth).tickFormat(() => ''))
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.3);
    
    // Draw the model prediction line/curve
    drawModelPrediction(g, xScale, yScale, innerWidth);
    
    // Draw data points
    drawDataPoints(g, xScale, yScale);
    
    // Add legend
    drawLegend(g, innerWidth);
  }
  
  function drawModelPrediction(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    innerWidth: number
  ) {
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
    
    // For classification problems, add decision boundaries
    if (problemType === 'logistic-regression') {
      // True decision boundary
      const trueDecisionX = -problemConfig.trueParameters.b / problemConfig.trueParameters.a;
      if (trueDecisionX >= xDomain[0] && trueDecisionX <= xDomain[1]) {
        g.append('line')
          .attr('x1', xScale(trueDecisionX))
          .attr('y1', 0)
          .attr('x2', xScale(trueDecisionX))
          .attr('y2', yScale.range()[0])
          .attr('stroke', '#10b981')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,5')
          .style('opacity', 0.4);
      }
      
      // Current model decision boundary
      const decisionX = -parameters.b / parameters.a;
      if (decisionX >= xDomain[0] && decisionX <= xDomain[1]) {
        g.append('line')
          .attr('x1', xScale(decisionX))
          .attr('y1', 0)
          .attr('x2', xScale(decisionX))
          .attr('y2', yScale.range()[0])
          .attr('stroke', '#3b82f6')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,5')
          .style('opacity', 0.5);
      }
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
    
    // Define shapes for different data types
    const circleRadius = 6;
    
    // Draw training points
    g.selectAll('.train-point')
      .data(trainData)
      .enter()
      .append('circle')
      .attr('class', 'train-point')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', circleRadius)
      .attr('fill', d => {
        if (problemType === 'logistic-regression') {
          return d.label === 1 ? '#ef4444' : '#3b82f6';
        }
        return '#3b82f6';
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('opacity', 0.8);
    
    // Draw test points with different shape (squares)
    g.selectAll('.test-point')
      .data(testData)
      .enter()
      .append('rect')
      .attr('class', 'test-point')
      .attr('x', d => xScale(d.x) - circleRadius)
      .attr('y', d => yScale(d.y) - circleRadius)
      .attr('width', circleRadius * 2)
      .attr('height', circleRadius * 2)
      .attr('fill', d => {
        if (problemType === 'logistic-regression') {
          return d.label === 1 ? '#ef4444' : '#3b82f6';
        }
        return '#10b981';
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('opacity', 0.6);
    
    // Add hover effects
    g.selectAll('.train-point, .test-point')
      .on('mouseover', function(event, d) {
        const point = d as DataPoint;
        d3.select(this)
          .attr('r', circleRadius * 1.5)
          .style('opacity', 1);
        
        // Show tooltip
        const tooltip = g.append('g')
          .attr('class', 'tooltip');
        
        const rect = tooltip.append('rect')
          .attr('x', xScale(point.x) + 10)
          .attr('y', yScale(point.y) - 30)
          .attr('rx', 4)
          .attr('ry', 4)
          .attr('fill', 'rgba(0, 0, 0, 0.8)')
          .attr('width', 80)
          .attr('height', 25);
        
        tooltip.append('text')
          .attr('x', xScale(point.x) + 50)
          .attr('y', yScale(point.y) - 12)
          .attr('text-anchor', 'middle')
          .attr('fill', 'white')
          .attr('font-size', '12px')
          .text(`(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`);
      })
      .on('mouseout', function() {
        d3.select(this)
          .attr('r', circleRadius)
          .style('opacity', (d: any) => {
            const point = d as DataPoint;
            return point.isTraining ? 0.8 : 0.6;
          });
        
        g.selectAll('.tooltip').remove();
      });
  }
  
  function drawLegend(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    innerWidth: number
  ) {
    const legend = g.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${innerWidth - 100}, 0)`);
    
    // True model line
    legend.append('line')
      .attr('x1', 0)
      .attr('y1', 10)
      .attr('x2', 20)
      .attr('y2', 10)
      .attr('stroke', '#10b981')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '8,4');
    
    legend.append('text')
      .attr('x', 25)
      .attr('y', 14)
      .attr('font-size', '11px')
      .attr('fill', '#666')
      .text('True');
    
    // Current model line
    legend.append('line')
      .attr('x1', 0)
      .attr('y1', 26)
      .attr('x2', 20)
      .attr('y2', 26)
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 3);
    
    legend.append('text')
      .attr('x', 25)
      .attr('y', 30)
      .attr('font-size', '11px')
      .attr('fill', '#666')
      .text('Model');
    
    // Training points
    legend.append('circle')
      .attr('cx', 10)
      .attr('cy', 46)
      .attr('r', 5)
      .attr('fill', '#3b82f6')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('opacity', 0.8);
    
    legend.append('text')
      .attr('x', 25)
      .attr('y', 50)
      .attr('font-size', '11px')
      .attr('fill', '#666')
      .text('Train');
    
    // Test points
    legend.append('rect')
      .attr('x', 5)
      .attr('y', 58)
      .attr('width', 10)
      .attr('height', 10)
      .attr('fill', '#10b981')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('opacity', 0.6);
    
    legend.append('text')
      .attr('x', 25)
      .attr('y', 67)
      .attr('font-size', '11px')
      .attr('fill', '#666')
      .text('Test');
  }
</script>

<div class="visualization-container">
  <h2>Data</h2>
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
  }
  
  h2 {
    margin: 0 0 1rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: #1a1a1a;
    flex-shrink: 0;
  }
  
  .svg-container {
    flex: 1;
    min-height: 0;
    position: relative;
  }
  
  svg {
    display: block;
    background: #fafafa;
    border-radius: 8px;
  }
  
  :global(.grid line) {
    stroke: #e0e0e0;
  }
  
  :global(.grid path) {
    stroke-width: 0;
  }
</style>
