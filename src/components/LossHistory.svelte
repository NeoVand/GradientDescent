<script lang="ts">
  /**
   * Loss History Component
   * 
   * This component displays the training and test loss over time as the model trains.
   * It helps users understand concepts like overfitting, convergence, and the
   * effect of different learning rates on training dynamics.
   */
  
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { historyStore, trainingStore } from '../stores/stores';
  
  let svgElement: SVGSVGElement;
  let width = 400;
  let height = 150;
  const margin = { top: 20, right: 60, bottom: 30, left: 50 };
  
  // Reactive data
  $: history = $historyStore;
  $: currentStep = $trainingStore.currentStep;
  
  // Redraw when history updates
  $: if (svgElement && history) {
    drawChart();
  }
  
  let resizeTimer: number | null = null;
  
  onMount(() => {
    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        width = entry.contentRect.width;
        height = entry.contentRect.height;
        
        // Debounce the redraw
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          drawChart();
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
  
  function drawChart() {
    // Clear previous content
    d3.select(svgElement).selectAll('*').remove();
    
    if (history.length === 0) {
      // Show placeholder text
      d3.select(svgElement)
        .append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#999')
        .text('Press "Train" to start');
      return;
    }
    
    const svg = d3.select(svgElement);
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Prepare data
    const maxStep = Math.max(...history.map(d => d.step));
    const allLosses = history.flatMap(d => [d.trainLoss, d.testLoss]);
    const minLoss = Math.min(...allLosses) * 0.9;
    const maxLoss = Math.max(...allLosses) * 1.1;
    
    // Create scales
    const xScale = d3.scaleLinear()
      .domain([0, Math.max(maxStep, 10)])
      .range([0, innerWidth]);
    
    const yScale = d3.scaleLinear()
      .domain([minLoss, maxLoss])
      .range([innerHeight, 0]);
    
    // Create line generators
    const trainLine = d3.line<typeof history[0]>()
      .x(d => xScale(d.step))
      .y(d => yScale(d.trainLoss))
      .curve(d3.curveMonotoneX);
    
    const testLine = d3.line<typeof history[0]>()
      .x(d => xScale(d.step))
      .y(d => yScale(d.testLoss))
      .curve(d3.curveMonotoneX);
    
    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .ticks(5)
      .tickFormat(d3.format('d'));
    
    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickFormat(d3.format('.3f'));
    
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .append('text')
      .attr('x', innerWidth / 2)
      .attr('y', 28)
      .attr('fill', '#666')
      .style('text-anchor', 'middle')
      .text('Step');
    
    g.append('g')
      .call(yAxis)
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -35)
      .attr('x', -innerHeight / 2)
      .attr('fill', '#666')
      .style('text-anchor', 'middle')
      .text('Loss');
    
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
    
    // Draw lines
    if (history.length > 1) {
      // Training loss line
      g.append('path')
        .datum(history)
        .attr('class', 'loss-line train-loss')
        .attr('fill', 'none')
        .attr('stroke', '#3b82f6')
        .attr('stroke-width', 2.5)
        .attr('d', trainLine);
      
      // Test loss line
      g.append('path')
        .datum(history)
        .attr('class', 'loss-line test-loss')
        .attr('fill', 'none')
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2.5)
        .attr('d', testLine);
    }
    
    // Add points
    g.selectAll('.train-point')
      .data(history)
      .enter()
      .append('circle')
      .attr('class', 'train-point')
      .attr('cx', d => xScale(d.step))
      .attr('cy', d => yScale(d.trainLoss))
      .attr('r', 3)
      .attr('fill', '#3b82f6')
      .style('opacity', 0.8);
    
    g.selectAll('.test-point')
      .data(history)
      .enter()
      .append('circle')
      .attr('class', 'test-point')
      .attr('cx', d => xScale(d.step))
      .attr('cy', d => yScale(d.testLoss))
      .attr('r', 3)
      .attr('fill', '#ef4444')
      .style('opacity', 0.8);
    
    // Add current step indicator
    if (currentStep > 0 && currentStep <= maxStep) {
      g.append('line')
        .attr('class', 'current-step-line')
        .attr('x1', xScale(currentStep))
        .attr('y1', 0)
        .attr('x2', xScale(currentStep))
        .attr('y2', innerHeight)
        .attr('stroke', '#666')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '5,5')
        .style('opacity', 0.5);
    }
    
    // Add legend
    const legend = g.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${innerWidth - 80}, 0)`);
    
    // Train loss legend
    const trainLegend = legend.append('g');
    trainLegend.append('line')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', 20)
      .attr('y2', 0)
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2.5);
    
    trainLegend.append('text')
      .attr('x', 25)
      .attr('y', 4)
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text('Train');
    
    // Test loss legend
    const testLegend = legend.append('g')
      .attr('transform', 'translate(0, 20)');
    
    testLegend.append('line')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', 20)
      .attr('y2', 0)
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 2.5);
    
    testLegend.append('text')
      .attr('x', 25)
      .attr('y', 4)
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text('Test');
    
    // Add hover interaction
    const bisect = d3.bisector<typeof history[0], number>(d => d.step).left;
    
    const focus = g.append('g')
      .style('display', 'none');
    
    focus.append('circle')
      .attr('class', 'hover-circle-train')
      .attr('r', 4)
      .attr('fill', '#3b82f6');
    
    focus.append('circle')
      .attr('class', 'hover-circle-test')
      .attr('r', 4)
      .attr('fill', '#ef4444');
    
    const tooltip = focus.append('g')
      .attr('class', 'tooltip');
    
    tooltip.append('rect')
      .attr('x', -40)
      .attr('y', -30)
      .attr('width', 80)
      .attr('height', 25)
      .attr('fill', 'rgba(0, 0, 0, 0.8)')
      .attr('rx', 4);
    
    tooltip.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', -12)
      .attr('fill', 'white')
      .attr('font-size', '12px');
    
    svg.append('rect')
      .attr('transform', `translate(${margin.left},${margin.top})`)
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .style('fill', 'none')
      .style('pointer-events', 'all')
      .on('mouseover', () => focus.style('display', null))
      .on('mouseout', () => focus.style('display', 'none'))
      .on('mousemove', function(event) {
        const x0 = xScale.invert(d3.pointer(event, this)[0]);
        const i = bisect(history, x0, 1);
        const d0 = history[i - 1];
        const d1 = history[i];
        
        if (!d0 || !d1) return;
        
        const d = x0 - d0.step > d1.step - x0 ? d1 : d0;
        
        focus.select('.hover-circle-train')
          .attr('cx', xScale(d.step))
          .attr('cy', yScale(d.trainLoss));
        
        focus.select('.hover-circle-test')
          .attr('cx', xScale(d.step))
          .attr('cy', yScale(d.testLoss));
        
        tooltip
          .attr('transform', `translate(${xScale(d.step)}, ${yScale((d.trainLoss + d.testLoss) / 2)})`);
        
        tooltip.select('text')
          .text(`Step ${d.step}`);
      });
  }
</script>

<div class="chart-container">
  <h3>Loss during training</h3>
  <div class="svg-container">
    <svg bind:this={svgElement} {width} {height}></svg>
  </div>
</div>

<style>
  .chart-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  
  h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: #4a4a4a;
    flex-shrink: 0;
  }
  
  .svg-container {
    flex: 1;
    min-height: 0;
    position: relative;
  }
  
  svg {
    display: block;
  }
  
  :global(.grid line) {
    stroke: #e0e0e0;
  }
  
  :global(.grid path) {
    stroke-width: 0;
  }
</style>

