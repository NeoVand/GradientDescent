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
  import { historyStore, trainingStore, themeStore } from '../stores/stores';
  import { Activity } from 'lucide-svelte';
  
  let svgElement: SVGSVGElement;
  let width = 400;
  let height = 150;

  // Log-scale toggle: loss curves usually span orders of magnitude, so the
  // interesting tail is invisible on a linear axis.
  let logScale = false;
  $: if (typeof logScale === 'boolean' && svgElement) drawChart();
  // Margins shrink on narrow viewports to claw back vertical space
  $: compact = width < 480;
  $: margin = compact
    ? { top: 6, right: 10, bottom: 36, left: 38 }
    : { top: 20, right: 20, bottom: 40, left: 50 };
  $: xLabelOffset = compact ? 30 : 28;
  $: yLabelOffset = compact ? 28 : 35;
  
  // Reactive data
  $: history = $historyStore;
  $: currentStep = $trainingStore.currentStep;
  $: theme = $themeStore;
  
  // Redraw when history updates
  $: if (svgElement && history) {
    drawChart();
  }
  
  // Redraw when theme changes
  $: if (svgElement && theme) {
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
      return;
    }
    
    const svg = d3.select(svgElement);
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Implement sliding window for EEG-style visualization
    const windowSize = 500; // Show last 500 steps
    const maxStep = Math.max(...history.map(d => d.step));
    const minStep = Math.max(0, maxStep - windowSize);
    
    // Filter data to window
    const windowedHistory = history.filter(d => d.step >= minStep);
    
    const allLosses = windowedHistory.flatMap(d => [d.trainLoss, d.testLoss]);
    const minLoss = Math.min(...allLosses);
    const maxLoss = Math.max(...allLosses);

    // Add padding to prevent edge bleeding (especially important for stroke width)
    const lossRange = maxLoss - minLoss;
    const lossPadding = lossRange * 0.08;  // 8% padding
    const stepPadding = Math.max((maxStep - minStep) * 0.02, 1);  // 2% padding or at least 1 step

    // Create scales with sliding window and padding
    const xScale = d3.scaleLinear()
      .domain([minStep - stepPadding, Math.max(maxStep, minStep + 10) + stepPadding])
      .range([0, innerWidth]);

    // Log scale clamps to the smallest positive loss in view (zero can't be
    // drawn on a log axis); linear keeps the padded range.
    const minPositive = allLosses.reduce(
      (lo, v) => (v > 0 && v < lo ? v : lo),
      Infinity
    );
    const logFloor = Number.isFinite(minPositive) ? minPositive * 0.8 : 1e-12;
    const yScale = logScale
      ? d3.scaleLog()
          .domain([logFloor, Math.max(maxLoss, logFloor * 10)])
          .range([innerHeight, 0])
      : d3.scaleLinear()
          .domain([minLoss - lossPadding, maxLoss + lossPadding])
          .range([innerHeight, 0]);

    const yOf = (v: number) => yScale(logScale ? Math.max(v, logFloor) : v);

    // Create line generators with smooth curves
    const trainLine = d3.line<typeof history[0]>()
      .x(d => xScale(d.step))
      .y(d => yOf(d.trainLoss))
      .curve(d3.curveCatmullRom.alpha(0.5));

    const testLine = d3.line<typeof history[0]>()
      .x(d => xScale(d.step))
      .y(d => yOf(d.testLoss))
      .curve(d3.curveCatmullRom.alpha(0.5));

    // Create axes
    const xAxis = d3.axisBottom(xScale)
      .ticks(5)
      .tickFormat(d3.format('d'))
      .tickSizeOuter(0);

    // Log axes otherwise emit every minor tick (1..9 per decade) — restrict
    // to powers of ten, thinned to at most ~5 labels.
    let yAxis: d3.Axis<d3.NumberValue>;
    if (logScale) {
      const [d0, d1] = yScale.domain() as [number, number];
      let powers: number[] = [];
      for (let e = Math.ceil(Math.log10(d0)); e <= Math.floor(Math.log10(d1)); e++) {
        powers.push(Math.pow(10, e));
      }
      const stride = Math.max(1, Math.ceil(powers.length / 5));
      powers = powers.filter((_, i) => i % stride === 0);
      yAxis = d3.axisLeft(yScale)
        .tickValues(powers.length >= 2 ? powers : (yScale.ticks(3) as number[]))
        .tickFormat(d3.format('.0e'))
        .tickSizeOuter(0);
    } else {
      yAxis = d3.axisLeft(yScale)
        .ticks(compact ? 4 : 5)
        .tickFormat(d3.format(compact ? 'd' : '.1f'))
        .tickSizeOuter(0);
    }
    
    // Get theme-aware colors
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
      .text('Step');

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -yLabelOffset)
      .attr('x', -innerHeight / 2)
      .attr('fill', axisColor)
      .style('text-anchor', 'middle')
      .attr('font-size', '12px')
      .text('Loss');
    
    // Add background for the plot area
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    g.insert('rect', ':first-child')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', isDark ? '#060913' : '#ffffff')
      .attr('rx', 4);
    
    // Add grid lines with theme-aware color (isDark already declared above)
    const gridColor = isDark ? '#64748b' : '#9ca3af';
    
    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis.tickSize(-innerHeight).tickFormat(() => ''))
      .call(g => g.selectAll('line').attr('stroke', gridColor))
      .call(g => g.selectAll('path').attr('stroke', 'none'))
      .style('stroke-dasharray', '2,4')
      .style('opacity', isDark ? 0.35 : 0.35);
    
    g.append('g')
      .attr('class', 'grid')
      .call(yAxis.tickSize(-innerWidth).tickFormat(() => ''))
      .call(g => g.selectAll('line').attr('stroke', gridColor))
      .call(g => g.selectAll('path').attr('stroke', 'none'))
      .style('stroke-dasharray', '2,4')
      .style('opacity', isDark ? 0.35 : 0.35);
    
    // Draw smooth lines
    if (windowedHistory.length > 1) {
      // Training loss line - thicker and smoother
      g.append('path')
        .datum(windowedHistory)
        .attr('class', 'loss-line train-loss')
        .attr('fill', 'none')
        .attr('stroke', '#3b82f6')
        .attr('stroke-width', 3)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('d', trainLine)
        .style('opacity', 0.9);
      
      // Test loss line - emerald dashed
      g.append('path')
        .datum(windowedHistory)
        .attr('class', 'loss-line test-loss')
        .attr('fill', 'none')
        .attr('stroke', '#10b981')
        .attr('stroke-width', 3)
        .attr('stroke-dasharray', '10,6')
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('d', testLine)
        .style('opacity', 0.9);
    }
    
    // Always draw current position markers (last point in history)
    if (windowedHistory.length > 0) {
      const lastPoint = windowedHistory[windowedHistory.length - 1];
      
      // Train loss current position
      g.append('circle')
        .attr('cx', xScale(lastPoint.step))
        .attr('cy', yOf(lastPoint.trainLoss))
        .attr('r', 4)
        .attr('fill', '#3b82f6')
        .style('opacity', 1);

      // Test loss current position
      g.append('circle')
        .attr('cx', xScale(lastPoint.step))
        .attr('cy', yOf(lastPoint.testLoss))
        .attr('r', 4)
        .attr('fill', '#10b981')
        .style('opacity', 1);
    }
    
  }
</script>

<div class="chart-container">
  <div class="header">
    <h3>
      <Activity size={18} strokeWidth={2} />
      <span>Loss during training</span>
    </h3>
    <button
      class="log-toggle"
      class:active={logScale}
      title="Toggle logarithmic loss axis"
      on:click={() => (logScale = !logScale)}
    >log</button>
    <div class="legend-controls">
      <div class="legend-item">
        <svg width="24" height="3" viewBox="0 0 24 3">
          <line x1="0" y1="1.5" x2="24" y2="1.5" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" />
        </svg>
        <span>Train</span>
      </div>
      <div class="legend-item">
        <svg width="24" height="3" viewBox="0 0 24 3">
          <line x1="0" y1="1.5" x2="24" y2="1.5" stroke="#10b981" stroke-width="3" stroke-dasharray="8,4" stroke-linecap="round" />
        </svg>
        <span>Test</span>
      </div>
    </div>
  </div>
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
  
  h3 {
    margin: 0 0 0 50px;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    opacity: 0.9;
  }
  
  .log-toggle {
    border: 1px solid var(--color-border);
    border-radius: 7px;
    background: transparent;
    color: var(--color-text-tertiary);
    font-size: 0.6563rem;
    font-weight: 700;
    font-family: 'SF Mono', Monaco, monospace;
    padding: 0.15rem 0.5rem;
    margin-left: 0.625rem;
    margin-right: auto;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .log-toggle:hover {
    color: #10b981;
  }

  .log-toggle.active {
    background: rgba(16, 185, 129, 0.16);
    border-color: rgba(16, 185, 129, 0.5);
    color: #10b981;
  }
  
  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    color: var(--color-text-tertiary);
    font-weight: 500;
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

  @media (max-width: 768px) {
    h3 {
      margin-left: 0;
      font-size: 0.8125rem;
      gap: 0.375rem;
    }
    .header { margin-right: 0; margin-bottom: 0.125rem; }
    .legend-item { font-size: 0.6875rem; }
  }

</style>

