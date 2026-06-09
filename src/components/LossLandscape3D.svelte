<script lang="ts">
  /**
   * 3D Loss Landscape
   *
   * A rotatable surface built from the SAME cached grid as the 2D view
   * (lossSceneStore): vertex heights and colors both use the normalized
   * log-loss mapping, so the 3D terrain and the 2D heatmap always agree.
   * Contour rings sit at the shared threshold levels, the descent path is
   * a red tube on the surface, and the orange marker sphere is draggable
   * via raycast (same store semantics as dragging in 2D).
   *
   * The component is lazy-loaded (dynamic import in LossLandscape) so
   * three.js stays out of the base bundle.
   */

  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { contours } from 'd3-contour';
  import { get } from 'svelte/store';
  import {
    lossSceneStore,
    parametersStore,
    historyStore,
    themeStore,
    datasetStore,
    currentProblemConfig,
    resetOptimizerState,
    divergenceStore,
    type LossScene
  } from '../stores/stores';
  import { sampleLoss, normalizedLogLoss, viridisRGB } from '../utils/lossGrid';
  import type { TrainingHistoryPoint } from '../types/types';

  let container: HTMLDivElement;

  // Scene scale: parameters normalize to x,z ∈ [-1,1]; heights to [0, HEIGHT].
  const HEIGHT = 0.85;
  const SURFACE_N = 120; // vertices per side
  const PATH_WINDOW = 100; // match the 2D trail window

  let renderer: THREE.WebGLRenderer | null = null;
  let scene3: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let surfaceMesh: THREE.Mesh | null = null;
  let contourLines: THREE.LineSegments | null = null;
  let pathTube: THREE.Mesh | null = null;
  let markerSphere: THREE.Mesh;
  let gridHelper: THREE.GridHelper | null = null;
  let raf = 0;
  let disposed = false;

  let currentScene: LossScene | null = null;
  let dragging = false;

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  // ---------- coordinate mapping ----------
  // α → x, β → −z (so the top-down view matches the 2D plot's orientation)

  function toX(a: number): number {
    if (!currentScene) return 0;
    const { min, max } = currentScene.range;
    return ((a - min) / (max - min)) * 2 - 1;
  }

  function toZ(b: number): number {
    if (!currentScene) return 0;
    const { min, max } = currentScene.range;
    return -(((b - min) / (max - min)) * 2 - 1);
  }

  function fromXZ(x: number, z: number): { a: number; b: number } {
    const { min, max } = currentScene!.range;
    const a = min + ((x + 1) / 2) * (max - min);
    const b = min + ((-z + 1) / 2) * (max - min);
    return { a, b };
  }

  function heightAt(a: number, b: number): number {
    if (!currentScene) return 0;
    return normalizedLogLoss(currentScene.grid, sampleLoss(currentScene.grid, a, b)) * HEIGHT;
  }

  // ---------- scene construction ----------

  function buildSurface() {
    if (!currentScene) return;
    if (surfaceMesh) {
      scene3.remove(surfaceMesh);
      surfaceMesh.geometry.dispose();
      (surfaceMesh.material as THREE.Material).dispose();
    }

    const geo = new THREE.PlaneGeometry(2, 2, SURFACE_N - 1, SURFACE_N - 1);
    geo.rotateX(-Math.PI / 2); // lie flat: x stays x, plane v-axis becomes z
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const { a, b } = fromXZ(x, z);
      const t = normalizedLogLoss(currentScene.grid, sampleLoss(currentScene.grid, a, b));
      pos.setY(i, t * HEIGHT);
      const [r, g, bb] = viridisRGB(1 - t); // bright = low loss, same as 2D
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = bb;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide
    });
    surfaceMesh = new THREE.Mesh(geo, mat);
    scene3.add(surfaceMesh);
  }

  function buildContours() {
    if (!currentScene) return;
    if (contourLines) {
      scene3.remove(contourLines);
      contourLines.geometry.dispose();
      (contourLines.material as THREE.Material).dispose();
    }

    const { grid } = currentScene;
    const gen = contours().size([grid.res, grid.res]).smooth(true).thresholds(grid.thresholds);
    const polys = gen(grid.values as unknown as number[]);
    const extSpan = grid.extMax - grid.extMin;
    const { min, max } = currentScene.range;

    const verts: number[] = [];
    for (const poly of polys) {
      const y = normalizedLogLoss(grid, poly.value) * HEIGHT + 0.004;
      for (const polygon of poly.coordinates) {
        for (const ring of polygon) {
          for (let k = 0; k < ring.length - 1; k++) {
            const aA = grid.extMin + (ring[k][0] / grid.res) * extSpan;
            const bA = grid.extMin + (ring[k][1] / grid.res) * extSpan;
            const aB = grid.extMin + (ring[k + 1][0] / grid.res) * extSpan;
            const bB = grid.extMin + (ring[k + 1][1] / grid.res) * extSpan;
            // Keep only segments fully inside the visible range
            if (
              aA < min || aA > max || bA < min || bA > max ||
              aB < min || aB > max || bB < min || bB > max
            ) continue;
            verts.push(toX(aA), y, toZ(bA), toX(aB), y, toZ(bB));
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
    contourLines = new THREE.LineSegments(geo, mat);
    scene3.add(contourLines);
  }

  function buildPath(history: TrainingHistoryPoint[]) {
    if (pathTube) {
      scene3.remove(pathTube);
      pathTube.geometry.dispose();
      (pathTube.material as THREE.Material).dispose();
      pathTube = null;
    }
    if (!currentScene || history.length < 2) return;

    const { min, max } = currentScene.range;
    const recent = history.slice(-PATH_WINDOW);
    const pts: THREE.Vector3[] = [];
    for (const h of recent) {
      const a = Math.max(min, Math.min(max, h.parameters.a));
      const b = Math.max(min, Math.min(max, h.parameters.b));
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      pts.push(new THREE.Vector3(toX(a), heightAt(a, b) + 0.012, toZ(b)));
    }
    if (pts.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, Math.min(220, pts.length * 4), 0.011, 6, false);
    const mat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.85 });
    pathTube = new THREE.Mesh(geo, mat);
    scene3.add(pathTube);
  }

  function updateMarker() {
    if (!currentScene || !markerSphere) return;
    const { a, b } = get(parametersStore);
    const { min, max } = currentScene.range;
    const ca = Math.max(min, Math.min(max, Number.isFinite(a) ? a : min));
    const cb = Math.max(min, Math.min(max, Number.isFinite(b) ? b : min));
    markerSphere.position.set(toX(ca), heightAt(ca, cb) + 0.02, toZ(cb));
    const offMap = ca !== a || cb !== b;
    (markerSphere.material as THREE.MeshStandardMaterial).opacity = offMap ? 0.55 : 1;
  }

  function applyTheme(theme: string) {
    const dark = theme === 'dark';
    if (container) {
      container.style.background = dark ? '#060913' : '#ffffff';
    }
    if (gridHelper) {
      scene3.remove(gridHelper);
      gridHelper.geometry.dispose();
      (gridHelper.material as THREE.Material).dispose();
    }
    const gridColor = dark ? 0x274244 : 0xd1d5db;
    gridHelper = new THREE.GridHelper(2.4, 12, gridColor, gridColor);
    gridHelper.position.y = -0.003;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.5;
    scene3.add(gridHelper);
  }

  /** Axis label as a small always-facing sprite ('α' / 'β'). */
  function makeLabel(text: string, dark: boolean): THREE.Sprite {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'italic 44px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = dark ? '#527a75' : '#064e3b';
    ctx.fillText(text, size / 2, size / 2);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(0.16);
    return sprite;
  }

  let labelA: THREE.Sprite | null = null;
  let labelB: THREE.Sprite | null = null;

  function buildLabels(theme: string) {
    for (const l of [labelA, labelB]) {
      if (l) {
        scene3.remove(l);
        l.material.map?.dispose();
        l.material.dispose();
      }
    }
    const dark = theme === 'dark';
    labelA = makeLabel('α', dark);
    labelA.position.set(1.3, 0.02, 0);
    labelB = makeLabel('β', dark);
    labelB.position.set(0, 0.02, -1.3);
    scene3.add(labelA, labelB);
  }

  // ---------- pointer interaction ----------

  function setPointerNdc(e: PointerEvent) {
    const rect = renderer!.domElement.getBoundingClientRect();
    pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function onPointerDown(e: PointerEvent) {
    if (!renderer || !currentScene) return;
    setPointerNdc(e);
    raycaster.setFromCamera(pointerNdc, camera);
    const hit = raycaster.intersectObject(markerSphere, false);
    if (hit.length > 0) {
      dragging = true;
      controls.enabled = false;
      // Same semantics as 2D drag: fresh optimizer state, stale warnings gone
      resetOptimizerState();
      divergenceStore.set(null);
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic/recycled pointer ids can't be captured — dragging still
        // works, we just lose off-element tracking.
      }
    }
  }

  function endDrag(e: PointerEvent) {
    dragging = false;
    controls.enabled = true;
    try {
      renderer?.domElement.releasePointerCapture(e.pointerId);
    } catch {
      // No capture to release — fine.
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || !renderer || !currentScene || !surfaceMesh) return;
    // Self-heal: if the button is no longer down (missed pointerup, e.g.
    // released outside the window without capture), end the drag instead
    // of dragging the marker around under a released mouse.
    if (e.buttons === 0) {
      endDrag(e);
      return;
    }
    setPointerNdc(e);
    raycaster.setFromCamera(pointerNdc, camera);
    const hit = raycaster.intersectObject(surfaceMesh, false);
    if (hit.length === 0) return;

    const { min, max } = currentScene.range;
    const p = fromXZ(hit[0].point.x, hit[0].point.z);
    const a = Math.max(min, Math.min(max, p.a));
    const b = Math.max(min, Math.min(max, p.b));
    parametersStore.set({ a, b });

    // Record the manual move in history, exactly like the 2D drag
    const config = get(currentProblemConfig);
    const data = get(datasetStore).data;
    const train = data.filter(d => d.isTraining);
    const test = data.filter(d => !d.isTraining);
    const history = get(historyStore);
    const nextStep = history.length > 0 ? history[history.length - 1].step + 1 : 0;
    historyStore.addPoint({
      step: nextStep,
      trainLoss: config.computeLoss(train, { a, b }),
      testLoss: config.computeLoss(test, { a, b }),
      parameters: { a, b }
    });
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging) return;
    endDrag(e);
  }

  // ---------- lifecycle ----------

  const unsubs: Array<() => void> = [];

  onMount(() => {
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;

    scene3 = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 50);
    camera.position.set(1.7, 1.45, 1.7);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.22, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 0.6;
    controls.maxDistance = 6;

    scene3.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(1.5, 2.5, 1);
    scene3.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-1.5, 1.2, -1.5);
    scene3.add(fill);

    const markerGeo = new THREE.SphereGeometry(0.034, 24, 16);
    const markerMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xb45309,
      emissiveIntensity: 0.55,
      roughness: 0.4,
      transparent: true
    });
    markerSphere = new THREE.Mesh(markerGeo, markerMat);
    scene3.add(markerSphere);

    // Store subscriptions drive all updates
    unsubs.push(
      lossSceneStore.subscribe(s => {
        currentScene = s;
        if (!s) return;
        buildSurface();
        buildContours();
        buildPath(get(historyStore));
        updateMarker();
      }),
      parametersStore.subscribe(() => updateMarker()),
      historyStore.subscribe(h => {
        if (currentScene) buildPath(h);
      }),
      themeStore.subscribe(t => {
        applyTheme(t);
        buildLabels(t);
      })
    );

    const el = renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry || !renderer) return;
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    const loop = () => {
      if (disposed) return;
      controls.update();
      renderer!.render(scene3, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      resizeObserver.disconnect();
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };
  });

  onDestroy(() => {
    disposed = true;
    cancelAnimationFrame(raf);
    for (const u of unsubs) u();
    if (scene3) {
      scene3.traverse(obj => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else mat?.dispose();
      });
    }
    controls?.dispose();
    renderer?.dispose();
    renderer = null;
  });
</script>

<div class="three-container" bind:this={container}></div>

<style>
  .three-container {
    width: 100%;
    height: 100%;
    border-radius: 4px;
    overflow: hidden;
    transition: background-color 0.3s ease;
  }

  .three-container :global(canvas) {
    display: block;
  }
</style>
