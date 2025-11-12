<script lang="ts">
  /**
   * Loss Landscape Visualization Component - Rebuilt from scratch
   * 
   * This component visualizes the loss function as a landscape in 2D or 3D.
   * We use d3-contour for proper 2D heatmaps and contours, and Three.js for 3D.
   */
  
  import { onMount, onDestroy } from 'svelte';
  import * as d3 from 'd3';
  import { contours } from 'd3-contour';
  import { interpolateViridis, interpolatePlasma } from 'd3-scale-chromatic';
  import * as THREE from 'three';
  import { 
    lossLandscapeMode, 
    lossLandscapeVisuals,
    datasetStore,
    parametersStore,
    historyStore,
    currentProblemConfig
  } from '../stores/stores';
  import type { ModelParameters } from '../types/types';
  import { Thermometer, ArrowRight, Circle, TrendingUp, Box, Layers, Mountain } from 'lucide-svelte';
  import { themeStore } from '../stores/stores';
  
  // Component DOM references
  let container: HTMLDivElement;
  let svg2D: SVGSVGElement;
  let canvas3D: HTMLCanvasElement;
  
  $: theme = $themeStore;
  
  // Dimensions - match Data diagram exactly
  let width = 400;
  let height = 400;
  const margin = { top: 20, right: 20, bottom: 50, left: 50 };
  
  // Three.js objects
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: any; // OrbitControls
  let animationId: number;
  
  // Loss landscape data
  let lossGrid: number[][] = [];
  let gradientFieldData: Array<{
    i: number;
    j: number;
    a: number;
    b: number;
    gradient: ModelParameters;
    magnitude: number;
    normalizedMagnitude: number;
    version?: number;
  }> = []; // Cache gradient field data
  let gradientFieldVersion = 0; // Track when gradient field needs recalculation
  let parameterRange = { min: -5, max: 5 };
  const gridResolution = 60; // Higher resolution for smoother visualization
  
  // Scales
  let xScale: d3.ScaleLinear<number, number>;
  let yScale: d3.ScaleLinear<number, number>;
  let colorScale: d3.ScaleSequential<string>;
  
  // Reactive subscriptions
  $: mode = $lossLandscapeMode;
  $: visuals = $lossLandscapeVisuals;
  $: data = $datasetStore.data;
  $: parameters = $parametersStore;
  $: history = $historyStore;
  $: problemConfig = $currentProblemConfig;
  
  // Update landscape when data or problem changes
  $: if (data.length > 0 && problemConfig) {
    computeLossLandscape();
    // Invalidate gradient field cache
    gradientFieldVersion++;
  }
  
  // Render appropriate visualization when mode or data changes
  $: if (lossGrid.length > 0) {
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
      if (mode === '2d' && svg2D) {
        render2D();
      } else if (mode === '3d' && canvas3D) {
        // Stop any existing animation
        if (animationId) {
          cancelAnimationFrame(animationId);
          animationId = 0;
        }
        render3D();
      }
    }, 0);
  }
  
  // 3D scene uses transparent background now
  
  // Re-render when visuals change
  $: if (visuals && lossGrid.length > 0) {
    if (mode === '2d' && svg2D) {
      render2D();
    } else if (mode === '3d' && canvas3D) {
      render3D();
    }
  }
  
  // Update current position when parameters change
  $: if (mode === '2d' && svg2D && parameters && lossGrid.length > 0) {
    updateCurrentPosition();
  }
  
  onMount(() => {
    setupResizeObserver();
  });
  
  onDestroy(() => {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = 0;
    }
    if (renderer) {
      renderer.dispose();
      renderer = null as any;
    }
    if (scene) {
      // Clean up scene
      while(scene.children.length > 0) {
        scene.remove(scene.children[0]);
      }
    }
  });
  
  function setupResizeObserver() {
    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        const rect = entry.contentRect;
        width = rect.width;
        height = rect.height;
        
        if (mode === '2d') {
          render2D();
        } else if (renderer) {
          renderer.setSize(width, height);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }
      }
    });
    
    resizeObserver.observe(container);
    
    return () => resizeObserver.disconnect();
  }
  
  function computeLossLandscape() {
    const trainData = data.filter(d => d.isTraining);
    if (trainData.length === 0) return;
    
    // Create parameter grid - use consistent indexing
    lossGrid = [];
    
    let minLoss = Infinity;
    let maxLoss = -Infinity;
    
    // Compute loss at each grid point using consistent coordinate mapping
    for (let i = 0; i < gridResolution; i++) {
      const row = [];
      for (let j = 0; j < gridResolution; j++) {
        // Use the same coordinate calculation as in other functions
        const a = parameterRange.min + (i / (gridResolution - 1)) * (parameterRange.max - parameterRange.min);
        const b = parameterRange.min + (j / (gridResolution - 1)) * (parameterRange.max - parameterRange.min);
        const loss = problemConfig.computeLoss(trainData, { a, b });
        
        row.push(loss);
        minLoss = Math.min(minLoss, loss);
        maxLoss = Math.max(maxLoss, loss);
      }
      lossGrid.push(row);
    }
    
    // Setup scales
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    xScale = d3.scaleLinear()
      .domain([parameterRange.min, parameterRange.max])
      .range([0, innerWidth]);
    
    yScale = d3.scaleLinear()
      .domain([parameterRange.min, parameterRange.max])
      .range([0, innerHeight]);  // Fixed: y-axis not inverted
    
    // Use log scale for color to better show variations
    const logScale = d3.scaleLog()
      .domain([minLoss + 0.001, maxLoss])
      .range([0, 1]);
    
    colorScale = d3.scaleSequential((t) => interpolateViridis(1 - t))
      .domain([0, 1]);
  }
  
  function render2D() {
    if (!svg2D || lossGrid.length === 0) return;
    
    // Clear previous content completely
    const svg = d3.select(svg2D);
    svg.selectAll('*').remove();
    
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Create clipping path
    g.append('defs')
      .append('clipPath')
      .attr('id', 'plot-area')
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight);
    
    const plotArea = g.append('g')
      .attr('clip-path', 'url(#plot-area)');
    
    // Add subtle grid lines first (behind everything)
    addGridLines(plotArea, innerWidth, innerHeight);
    
    // Draw heatmap
    if (visuals.heatmap) {
      drawHeatmap(plotArea, innerWidth, innerHeight);
    }
    
    // Draw contours
    if (visuals.contours) {
      drawContours(plotArea, innerWidth, innerHeight);
    }
    
    // Draw gradient vectors
    if (visuals.gradientField) {
      drawGradientField(plotArea, innerWidth, innerHeight);
    }
    
    // Draw current position
    drawCurrentPosition(plotArea);
    
    // Draw axes
    drawAxes(g, innerWidth, innerHeight);
  }
  
  function drawHeatmap(g: d3.Selection<SVGGElement, unknown, null, undefined>, width: number, height: number) {
    const cellWidth = width / gridResolution;
    const cellHeight = height / gridResolution;
    
    // Flatten grid data with coordinates
    const flatData = [];
    for (let i = 0; i < gridResolution; i++) {
      for (let j = 0; j < gridResolution; j++) {
        flatData.push({
          i,
          j,
          value: lossGrid[i][j]
        });
      }
    }
    
    // Draw cells without strokes to avoid grid lines using regular grid
    g.selectAll('.heatmap-cell')
      .data(flatData)
      .enter()
      .append('rect')
      .attr('class', 'heatmap-cell')
      .attr('x', d => d.i * cellWidth)
      .attr('y', d => d.j * cellHeight)
      .attr('width', cellWidth + 0.5)  // Slight overlap to prevent gaps
      .attr('height', cellHeight + 0.5)
      .attr('fill', d => {
        const logValue = Math.log(d.value + 0.001);
        const minLog = Math.log(0.001);
        const maxLog = Math.log(d3.max(lossGrid.flat())! + 0.001);
        const normalized = (logValue - minLog) / (maxLog - minLog);
        return colorScale(normalized);
      });
  }
  
  function drawContours(g: d3.Selection<SVGGElement, unknown, null, undefined>, width: number, height: number) {
    // Create a simple 2D array that matches our heatmap exactly
    // Our heatmap uses lossGrid[i][j] where i is x-axis (A parameter), j is y-axis (B parameter)
    // We need to transpose this for d3.contours which expects [row][col] = [y][x]
    
    const transposedGrid = [];
    for (let j = 0; j < gridResolution; j++) {  // j = rows = y-axis = B parameter
      const row = [];
      for (let i = 0; i < gridResolution; i++) {  // i = cols = x-axis = A parameter  
        row.push(lossGrid[i][j]);
      }
      transposedGrid.push(row);
    }
    
    // Flatten in row-major order for d3.contours
    const flatLossData = transposedGrid.flat();
    
    // Prepare contour generator
    const contourGen = contours()
      .size([gridResolution, gridResolution])
      .smooth(true);
    
    // Generate contour levels (log-spaced for better distribution)
    const minLoss = d3.min(lossGrid.flat())!;
    const maxLoss = d3.max(lossGrid.flat())!;
    const numContours = 15;
    
    const logMin = Math.log(minLoss + 0.001);
    const logMax = Math.log(maxLoss + 0.001);
    const logStep = (logMax - logMin) / numContours;
    
    const thresholds = [];
    for (let i = 1; i < numContours; i++) {
      thresholds.push(Math.exp(logMin + i * logStep) - 0.001);
    }
    
    const contourData = contourGen
      .thresholds(thresholds)
      (flatLossData);
    
    // Draw contours with coordinate transformation that exactly matches heatmap
    const cellWidth = width / gridResolution;
    const cellHeight = height / gridResolution;
    
    const pathGenerator = d3.geoPath()
      .projection(d3.geoTransform({
        point: function(x, y) {
          // x and y from d3.contours are already in the correct coordinate system
          this.stream.point(
            x * cellWidth,
            y * cellHeight
          );
        }
      }));
    
    // Draw contours
    g.selectAll('.contour')
      .data(contourData)
      .enter()
      .append('path')
      .attr('class', 'contour')
      .attr('d', pathGenerator)
      .attr('fill', 'none')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1)
      .attr('opacity', 0.4);
  }
  
  function computeGradientField() {
    const gradientGridSize = 12; // Reduced to 12x12 for better performance
    const trainData = data.filter(d => d.isTraining);
    
    const newGradientData = [];
    let maxMagnitude = 0;
    
    // Use a fixed efficient grid for gradients
    for (let i = 0; i < gradientGridSize; i++) {
      for (let j = 0; j < gradientGridSize; j++) {
        // Map gradient grid to parameter space
        const a = parameterRange.min + (i / (gradientGridSize - 1)) * (parameterRange.max - parameterRange.min);
        const b = parameterRange.min + (j / (gradientGridSize - 1)) * (parameterRange.max - parameterRange.min);
        
        const gradient = problemConfig.computeGradient(trainData, { a, b });
        const magnitude = Math.sqrt(gradient.a * gradient.a + gradient.b * gradient.b);
        
        if (magnitude > 0.001) {
          newGradientData.push({ i, j, a, b, gradient, magnitude, normalizedMagnitude: 0 });
          maxMagnitude = Math.max(maxMagnitude, magnitude);
        }
      }
    }
    
    // Normalize magnitudes
    newGradientData.forEach(data => {
      data.normalizedMagnitude = data.magnitude / maxMagnitude;
    });
    
    gradientFieldData = newGradientData;
  }

  function drawGradientField(g: d3.Selection<SVGGElement, unknown, null, undefined>, width: number, height: number) {
    // Only recompute if gradient field is outdated or empty
    if (gradientFieldData.length === 0 || !gradientFieldData[0]?.version || gradientFieldData[0].version !== gradientFieldVersion) {
      computeGradientField();
      // Mark data with current version
      gradientFieldData.forEach(data => {
        data.version = gradientFieldVersion;
      });
    }
    
    const gradientGridSize = 12;
    const baseArrowLength = 14;
    const maxArrowLength = 21;
    
    // Use same coordinate system as heatmap - map gradient grid to heatmap pixels
    const cellWidth = width / gridResolution;  // Use heatmap's grid resolution
    const cellHeight = height / gridResolution;
    
    // Draw arrows using cached data
    for (const data of gradientFieldData) {
      const { i, j, a, b, gradient, normalizedMagnitude } = data;
      
      // Convert parameter values to heatmap pixel coordinates (same as optimization path)
      const gridI = (a - parameterRange.min) / (parameterRange.max - parameterRange.min) * (gridResolution - 1);
      const gridJ = (b - parameterRange.min) / (parameterRange.max - parameterRange.min) * (gridResolution - 1);
      
      const x1 = gridI * cellWidth;
      const y1 = gridJ * cellHeight;
      
      // Normalize gradient direction
      const magnitude = Math.sqrt(gradient.a * gradient.a + gradient.b * gradient.b);
      const normalizedGradA = -gradient.a / magnitude;
      const normalizedGradB = -gradient.b / magnitude;
      
      // Scale arrow length based on gradient magnitude
      const arrowLength = baseArrowLength + (maxArrowLength - baseArrowLength) * normalizedMagnitude;
      
      // Apply scaled pixel displacement
      const x2 = x1 + normalizedGradA * arrowLength;
      const y2 = y1 + normalizedGradB * arrowLength;
      
      // Scale stroke width and opacity based on magnitude too
      const strokeWidth = 1 + normalizedMagnitude * 1; // 1-2 range
      const opacity = 0.6 + normalizedMagnitude * 0.3; // 0.6-0.9 range
      
      // Draw arrow
      g.append('line')
        .attr('class', 'gradient-arrow')
        .attr('x1', x1)
        .attr('y1', y1)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', strokeWidth)
        .attr('marker-end', 'url(#arrowhead)')
        .style('opacity', opacity);
    }
    
    // Define arrowhead marker
    const defs = d3.select(svg2D).select('defs');
    if (defs.select('#arrowhead').empty()) {
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
        .attr('fill', '#ffffff');
    }
  }
  
  function drawCurrentPosition(g: d3.Selection<SVGGElement, unknown, null, undefined>) {
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Convert parameters to grid coordinates, then to pixel coordinates
    // to match heatmap coordinate system exactly
    const gridI = (parameters.a - parameterRange.min) / (parameterRange.max - parameterRange.min) * (gridResolution - 1);
    const gridJ = (parameters.b - parameterRange.min) / (parameterRange.max - parameterRange.min) * (gridResolution - 1);
    
    const cellWidth = innerWidth / gridResolution;
    const cellHeight = innerHeight / gridResolution;
    
    const currentX = gridI * cellWidth;
    const currentY = gridJ * cellHeight;
    
    const marker = g.append('g')
      .attr('class', 'current-position')
      .attr('transform', `translate(${currentX}, ${currentY})`);
    
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
        d3.select(this).style('cursor', 'grabbing');
      })
      .on('drag', function(event) {
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        const cellWidth = innerWidth / gridResolution;
        const cellHeight = innerHeight / gridResolution;
        
        // Convert pixel coordinates back to grid coordinates, then to parameter values
        const gridI = event.x / cellWidth;
        const gridJ = event.y / cellHeight;
        
        const newA = parameterRange.min + (gridI / (gridResolution - 1)) * (parameterRange.max - parameterRange.min);
        const newB = parameterRange.min + (gridJ / (gridResolution - 1)) * (parameterRange.max - parameterRange.min);
        
        // Update position immediately
        d3.select(this)
          .attr('transform', `translate(${event.x}, ${event.y})`);
        
        // Clamp to valid range
        const clampedA = Math.max(parameterRange.min, Math.min(parameterRange.max, newA));
        const clampedB = Math.max(parameterRange.min, Math.min(parameterRange.max, newB));
        
        // Update parameters
        parametersStore.set({ a: clampedA, b: clampedB });
        
        // Add to history - use the last step + 1 to continue from where we left off
        const trainData = data.filter(d => d.isTraining);
        const testData = data.filter(d => !d.isTraining);
        const nextStep = history.length > 0 ? history[history.length - 1].step + 1 : 0;
        
        historyStore.addPoint({
          step: nextStep,
          trainLoss: problemConfig.computeLoss(trainData, { a: clampedA, b: clampedB }),
          testLoss: problemConfig.computeLoss(testData, { a: clampedA, b: clampedB }),
          parameters: { a: clampedA, b: clampedB }
        });
      })
      .on('end', function() {
        d3.select(this).style('cursor', 'grab');
      }));
  }
  
  function updateCurrentPosition() {
    if (lossGrid.length === 0) return;
    
    const marker = d3.select(svg2D).select('.current-position');
    if (!marker.empty()) {
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;
      
      // Convert parameters to grid coordinates, then to pixel coordinates
      const gridI = (parameters.a - parameterRange.min) / (parameterRange.max - parameterRange.min) * (gridResolution - 1);
      const gridJ = (parameters.b - parameterRange.min) / (parameterRange.max - parameterRange.min) * (gridResolution - 1);
      
      const cellWidth = innerWidth / gridResolution;
      const cellHeight = innerHeight / gridResolution;
      
      const currentX = gridI * cellWidth;
      const currentY = gridJ * cellHeight;
      
      marker.attr('transform', `translate(${currentX}, ${currentY})`);
    }
  }
  
  function drawAxes(g: d3.Selection<SVGGElement, unknown, null, undefined>, width: number, height: number) {
    // Get theme-aware colors
    const axisColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text-tertiary').trim();
    
    // X axis with label
    const xAxisGroup = g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(7))
      .call(g => g.selectAll('line, path').attr('stroke', axisColor))
      .call(g => g.selectAll('text').attr('fill', axisColor));
    
    xAxisGroup.append('text')
      .attr('x', width / 2)
      .attr('y', 38)
      .attr('fill', axisColor)
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .style('text-anchor', 'middle')
      .text('A');
    
    // Y axis - with inverted scale for display
    const yAxisScale = d3.scaleLinear()
      .domain([parameterRange.min, parameterRange.max])
      .range([height, 0]);
    
    const yAxisGroup = g.append('g')
      .call(d3.axisLeft(yAxisScale).ticks(7))
      .call(g => g.selectAll('line, path').attr('stroke', axisColor))
      .call(g => g.selectAll('text').attr('fill', axisColor));
    
    yAxisGroup.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -35)
      .attr('x', -height / 2)
      .attr('fill', axisColor)
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .style('text-anchor', 'middle')
      .text('B');
  }
  
  function addGridLines(g: d3.Selection<SVGGElement, unknown, null, undefined>, width: number, height: number) {
    // Add subtle grid lines with theme-aware color
    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text-tertiary').trim();
    const xTicks = xScale.ticks(10);
    const yTicks = yScale.ticks(10);
    
    // Vertical grid lines
    g.selectAll('.grid-line-v')
      .data(xTicks)
      .enter()
      .append('line')
      .attr('class', 'grid-line-v')
      .attr('x1', d => xScale(d))
      .attr('x2', d => xScale(d))
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', gridColor)
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.15);
    
    // Horizontal grid lines
    g.selectAll('.grid-line-h')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('class', 'grid-line-h')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', gridColor)
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.15);
  }
  
  function render3D() {
    if (!canvas3D || lossGrid.length === 0) return;
    
    // Initialize Three.js if needed
    if (!renderer) {
      initThreeJS();
    }
    
    // Clear scene completely
    while(scene.children.length > 0) {
      const child = scene.children[0];
      scene.remove(child);
      // Dispose of geometries and materials
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    }
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(10, 15, 10);
    scene.add(directionalLight);
    
    // Add a second light from the opposite direction for better illumination
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.2);
    directionalLight2.position.set(-5, 10, -5);
    scene.add(directionalLight2);
    
    // Add grid helper at the base
    const gridHelper = new THREE.GridHelper(10, 20, 0x666666, 0xcccccc);
    gridHelper.position.y = -0.1;
    scene.add(gridHelper);
    
    // Create landscape mesh
    createLandscapeMesh();
    
    // Draw current position
    draw3DCurrentPosition();
    
    // Add axis labels
    add3DAxisLabels();
    
    // Start render loop
    animate();
  }
  
  function initThreeJS() {
    // Scene
    scene = new THREE.Scene();
    // Transparent background - will show container background
    scene.background = null;
    
    // Camera
    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(12, 10, 12);
    camera.lookAt(0, 0, 0);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ 
      canvas: canvas3D, 
      antialias: true,
      alpha: true  // Enable transparency
    });
    renderer.setClearColor(0x000000, 0);  // Transparent background
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    
    // Simple orbit controls
    let mouseX = 0, mouseY = 0;
    let isMouseDown = false;
    
    canvas3D.addEventListener('mousedown', () => { isMouseDown = true; });
    canvas3D.addEventListener('mouseup', () => { isMouseDown = false; });
    canvas3D.addEventListener('mouseleave', () => { isMouseDown = false; });
    canvas3D.addEventListener('mousemove', (e) => {
      if (isMouseDown) {
        mouseX += e.movementX * 0.01;
        mouseY = Math.max(-Math.PI/3, Math.min(Math.PI/3, mouseY + e.movementY * 0.01));
        
        const radius = 15;
        camera.position.x = radius * Math.cos(mouseX) * Math.cos(mouseY);
        camera.position.y = radius * Math.sin(mouseY) + 4;
        camera.position.z = radius * Math.sin(mouseX) * Math.cos(mouseY);
        camera.lookAt(0, 0, 0);
      }
    });
  }
  
  function createLandscapeMesh() {
    // Create geometry with correct resolution
    const geometry = new THREE.PlaneGeometry(10, 10, gridResolution - 1, gridResolution - 1);
    const vertices = geometry.attributes.position.array as Float32Array;
    
    // Update vertices with loss values
    // PlaneGeometry creates vertices in this order: along width (x), then along height (y)
    // After rotation by -90 degrees on X axis:
    // - geometry x becomes world x (Parameter A)
    // - geometry y becomes world -z (Parameter B, inverted)
    // - geometry z becomes world y (height)
    
    let minLoss = Infinity;
    let maxLoss = -Infinity;
    
    // First pass: find min/max
    for (let i = 0; i < gridResolution; i++) {
      for (let j = 0; j < gridResolution; j++) {
        const loss = lossGrid[i][j];
        minLoss = Math.min(minLoss, loss);
        maxLoss = Math.max(maxLoss, loss);
      }
    }
    
    // Second pass: set vertices
    // PlaneGeometry vertices are indexed as: vertexIndex = row * (widthSegments + 1) + col
    // where row goes along height (0 to heightSegments), col goes along width (0 to widthSegments)
    for (let row = 0; row < gridResolution; row++) {
      for (let col = 0; col < gridResolution; col++) {
        const vertexIndex = (row * gridResolution + col) * 3;
        
        // Map grid to mesh: i=col (A parameter), j=row (B parameter)
        const i = col;
        const j = row;
        const loss = lossGrid[i][j];
        
        // Set geometry positions (before rotation)
        // x: -5 to 5 (Parameter A)
        // y: -5 to 5 (Parameter B) 
        // z: height (loss)
        vertices[vertexIndex] = (i / (gridResolution - 1) - 0.5) * 10;      // x
        vertices[vertexIndex + 1] = (j / (gridResolution - 1) - 0.5) * 10;  // y
        vertices[vertexIndex + 2] = Math.log(loss + 1) * 1.5;                // z (height)
      }
    }
    
    geometry.computeVertexNormals();
    
    // Create colors based on height
    const colors = new Float32Array(vertices.length);
    for (let row = 0; row < gridResolution; row++) {
      for (let col = 0; col < gridResolution; col++) {
        const vertexIndex = (row * gridResolution + col) * 3;
        const i = col;
        const j = row;
        const loss = lossGrid[i][j];
        const normalized = (Math.log(loss + 1) - Math.log(minLoss + 1)) / 
                          (Math.log(maxLoss + 1) - Math.log(minLoss + 1));
        
        const color = new THREE.Color(interpolateViridis(1 - normalized));
        colors[vertexIndex] = color.r;
        colors[vertexIndex + 1] = color.g;
        colors[vertexIndex + 2] = color.b;
      }
    }
    
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      shininess: 50
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;  // Rotate to make it horizontal
    scene.add(mesh);
  }
  
  function draw3DCurrentPosition() {
    const trainData = data.filter(d => d.isTraining);
    const currentLoss = problemConfig.computeLoss(trainData, parameters);
    
    // Map parameters to world coordinates (matching the mesh)
    const worldX = ((parameters.a - parameterRange.min) / (parameterRange.max - parameterRange.min) - 0.5) * 10;
    const worldZ = ((parameters.b - parameterRange.min) / (parameterRange.max - parameterRange.min) - 0.5) * 10;
    const worldY = Math.log(currentLoss + 1) * 1.5 + 0.15; // Slightly above surface
    
    const geometry = new THREE.SphereGeometry(0.15);
    const material = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(worldX, worldY, worldZ);
    scene.add(sphere);
  }
  
  function add3DAxisLabels() {
    // Create a simple sprite material for text
    const createTextSprite = (text: string, color: string = '#333333') => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      canvas.width = 256;
      canvas.height = 64;
      
      context.font = 'Bold 40px Arial';
      context.fillStyle = color;
      context.textAlign = 'center';
      context.fillText(text, 128, 45);
      
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(2, 0.5, 1);
      
      return sprite;
    };
    
    // Add axis labels
    const labelA = createTextSprite('Parameter A');
    labelA.position.set(0, -0.5, -6);
    scene.add(labelA);
    
    const labelB = createTextSprite('Parameter B');
    labelB.position.set(6, -0.5, 0);
    scene.add(labelB);
    
    const labelLoss = createTextSprite('Loss');
    labelLoss.position.set(-6, 3, -6);
    scene.add(labelLoss);
  }
  
  function animate() {
    if (!renderer || !scene || !camera || mode !== '3d') {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = 0;
      }
      return;
    }
    
    animationId = requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  
  function toggleMode() {
    lossLandscapeMode.set(mode === '2d' ? '3d' : '2d');
  }
  
  function toggleVisual(visual: keyof typeof $lossLandscapeVisuals) {
    lossLandscapeVisuals.update(v => ({
      ...v,
      [visual]: !v[visual]
    }));
  }
</script>

<div class="landscape-container" bind:this={container}>
  <h2>
    <Mountain size={20} strokeWidth={2} />
    <span>Loss Landscape</span>
  </h2>
  
  <div class="viz-container">
    {#if mode === '2d'}
      <svg bind:this={svg2D} class="landscape-svg"></svg>
    {:else}
      <canvas bind:this={canvas3D} class="landscape-canvas"></canvas>
    {/if}
    
    <!-- Floating controls - visible on hover -->
    <div class="floating-controls">
      <button 
        class="visual-toggle mode-toggle-btn"
        on:click={toggleMode}
        title="Toggle 2D/3D view"
      >
        {#if mode === '2d'}
          <Box size={16} strokeWidth={2.5} />
        {:else}
          <Layers size={16} strokeWidth={2.5} />
        {/if}
      </button>
      
      <button
        class="visual-toggle"
        class:active={visuals.heatmap}
        on:click={() => toggleVisual('heatmap')}
        title="Toggle heatmap"
      >
        <Thermometer size={16} strokeWidth={2.5} />
      </button>
      <button
        class="visual-toggle"
        class:active={visuals.gradientField}
        on:click={() => toggleVisual('gradientField')}
        title="Toggle gradient field"
      >
        <ArrowRight size={16} strokeWidth={2.5} />
      </button>
      <button
        class="visual-toggle"
        class:active={visuals.contours}
        on:click={() => toggleVisual('contours')}
        title="Toggle contours"
      >
        <Circle size={16} strokeWidth={2.5} />
      </button>
    </div>
  </div>
</div>

<style>
  .landscape-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  
  h2 {
    margin: 0 0 0.75rem 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    opacity: 0.9;
    flex-shrink: 0;
  }
  
  .visual-toggle {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: rgba(30, 41, 59, 0.75);
    backdrop-filter: blur(8px);
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    padding: 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
  
  .visual-toggle:hover {
    color: white;
    background: rgba(30, 41, 59, 0.9);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }
  
  .visual-toggle.active {
    background: rgba(59, 130, 246, 0.9);
    color: white;
  }
  
  .visual-toggle.active:hover {
    background: rgba(59, 130, 246, 1);
  }
  
  .viz-container {
    flex: 1;
    min-height: 0;
    max-height: 100%;
    position: relative;
    overflow: hidden;
  }
  
  /* Floating controls */
  .floating-controls {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    display: flex;
    gap: 0.25rem;
    align-items: center;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
    z-index: 10;
  }
  
  .viz-container:hover .floating-controls {
    opacity: 1;
    pointer-events: all;
  }
  
  .floating-controls:hover {
    opacity: 1;
  }
  
  .landscape-svg {
    display: block;
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    background: transparent;
    border-radius: 0;
  }
  
  .landscape-canvas {
    display: block;
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    background: transparent;
    border-radius: 0;
  }
  
  .landscape-canvas {
    cursor: grab;
  }
  
  .landscape-canvas:active {
    cursor: grabbing;
  }
  
  /* SVG styles */
  :global(.landscape-svg text) {
    font-size: 12px;
  }
  
  :global(.landscape-svg .tick text) {
    font-size: 11px;
  }
  
  :global(.optimization-path) {
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
  }
  
  :global(.current-position) {
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
  }
  
  :global(.gradient-arrow) {
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
  }
</style>