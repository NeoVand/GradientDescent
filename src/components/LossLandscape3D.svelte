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
    clearCoach,
    raceStore,
    optimizerStore,
    optimizerStateStore,
    trainingStore,
    type LossScene,
    type RaceState
  } from '../stores/stores';
  import { sampleLoss, normalizedLogLoss, viridisRGB } from '../utils/lossGrid';
  import { runStartStep } from '../utils/trainer';
  import { previewNextStep } from '../utils/preview';
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

  /**
   * Descent trail, matching the 2D look: a red tube that tapers from thin
   * to thick and fades from transparent to solid as it approaches the
   * marker. Taper is applied by rescaling each tube ring around its curve
   * point; fade rides a 4-component (RGBA) vertex-color attribute.
   */
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
      const p = new THREE.Vector3(toX(a), heightAt(a, b) + 0.02, toZ(b));
      // Skip near-duplicate consecutive points (converged steps, clamped
      // drags): zero-length tangents give TubeGeometry NaN frames, which
      // poisons the whole mesh into invisibility.
      if (pts.length === 0 || pts[pts.length - 1].distanceToSquared(p) > 1e-10) {
        pts.push(p);
      }
    }
    if (pts.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const tubularSegments = Math.min(220, pts.length * 4);
    const radialSegments = 6;
    // Build at radius 1, then rescale every ring to its tapered radius
    const geo = new THREE.TubeGeometry(curve, tubularSegments, 1, radialSegments, false);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const ringCount = tubularSegments + 1;
    const ringVerts = radialSegments + 1;
    const colors = new Float32Array(pos.count * 4);
    const center = new THREE.Vector3();

    for (let r = 0; r < ringCount; r++) {
      const t = r / (ringCount - 1); // 0 = oldest, 1 = newest
      const radius = 0.0035 + 0.0125 * t;
      const alpha = 0.06 + 0.78 * t; // same fade ramp as the 2D trail
      curve.getPointAt(t, center);
      for (let k = 0; k < ringVerts; k++) {
        const i = r * ringVerts + k;
        pos.setXYZ(
          i,
          center.x + (pos.getX(i) - center.x) * radius,
          center.y + (pos.getY(i) - center.y) * radius,
          center.z + (pos.getZ(i) - center.z) * radius
        );
        colors[i * 4] = 0.937;     // #ef4444
        colors[i * 4 + 1] = 0.267;
        colors[i * 4 + 2] = 0.267;
        colors[i * 4 + 3] = alpha;
      }
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    // depthTest off: the trail often descends INTO a basin where the near
    // rim would occlude it — like the 2D view, the path should always be
    // visible. Fade + taper keep the depth reading honest.
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: false
    });
    pathTube = new THREE.Mesh(geo, mat);
    pathTube.renderOrder = 10;
    scene3.add(pathTube);
  }

  /**
   * Race trails: one colored line per racer riding the surface, with a
   * small head sphere — the 3D mirror of the 2D race layer. Lines (not
   * tubes) keep the per-tick rebuild cheap.
   */
  let raceGroup: THREE.Group | null = null;

  function disposeRaceGroup() {
    if (!raceGroup) return;
    scene3.remove(raceGroup);
    raceGroup.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(m => m.dispose());
      else mat?.dispose();
    });
    raceGroup = null;
  }

  function buildRaceTrails(rs: RaceState | null) {
    disposeRaceGroup();
    if (!currentScene || !rs) return;
    raceGroup = new THREE.Group();
    const { min, max } = currentScene.range;

    for (const racer of rs.racers) {
      const pts: THREE.Vector3[] = [];
      for (const p of racer.trail) {
        const a = Math.max(min, Math.min(max, p.a));
        const b = Math.max(min, Math.min(max, p.b));
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        pts.push(new THREE.Vector3(toX(a), heightAt(a, b) + 0.015, toZ(b)));
      }
      if (pts.length >= 2) {
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
          color: new THREE.Color(racer.color),
          transparent: true,
          opacity: racer.diverged ? 0.3 : 0.9,
          depthTest: false,
          depthWrite: false
        });
        const line = new THREE.Line(geo, mat);
        line.renderOrder = 9;
        raceGroup.add(line);
      }
      if (pts.length > 0) {
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(racer.finished ? 0.024 : 0.019, 12, 8),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(racer.color),
            transparent: true,
            opacity: racer.diverged ? 0.35 : 1,
            depthTest: false,
            depthWrite: false
          })
        );
        head.renderOrder = 11;
        head.position.copy(pts[pts.length - 1]);
        raceGroup.add(head);
      }
    }
    scene3.add(raceGroup);
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
    updateMarkerExtras(offMap);
  }

  /**
   * The marker's direction language, same as 2D: blue −∇ℒ arrow, red Δθ
   * (last step) arrow, and the amber next-step ghost — a dry run of the
   * selected optimizer's update via the shared preview helper.
   */
  let markerExtras: THREE.Group | null = null;

  function disposeMarkerExtras() {
    if (!markerExtras) return;
    scene3.remove(markerExtras);
    markerExtras.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(m => m.dispose());
      else mat?.dispose();
    });
    markerExtras = null;
  }

  /** Param-space direction (da, db) → unit world direction on the floor. */
  function dirVec(da: number, db: number): THREE.Vector3 | null {
    const v = new THREE.Vector3(da, 0, -db);
    return v.lengthSq() < 1e-18 ? null : v.normalize();
  }

  function overlayArrow(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    length: number,
    color: number
  ): THREE.ArrowHelper {
    const arrow = new THREE.ArrowHelper(dir, origin, length, color, length * 0.32, length * 0.16);
    for (const part of [arrow.line, arrow.cone]) {
      const m = part.material as THREE.Material;
      m.depthTest = false;
      m.depthWrite = false;
      m.transparent = true;
      part.renderOrder = 11;
    }
    return arrow;
  }

  function updateMarkerExtras(offMap: boolean) {
    disposeMarkerExtras();
    if (!currentScene || offMap) return;
    const config = get(currentProblemConfig);
    const train = get(datasetStore).data.filter(d => d.isTraining);
    if (!config || (train.length === 0 && !config.noData)) return;

    const params = get(parametersStore);
    const grad = config.computeGradient(train, params);
    if (!Number.isFinite(grad.a) || !Number.isFinite(grad.b)) return;

    const { min, max } = currentScene.range;
    const origin = new THREE.Vector3(
      toX(params.a),
      heightAt(params.a, params.b) + 0.025,
      toZ(params.b)
    );
    markerExtras = new THREE.Group();

    // Blue: steepest descent −∇ℒ
    const down = dirVec(-grad.a, -grad.b);
    if (down) markerExtras.add(overlayArrow(origin, down, 0.16, 0x3b82f6));

    // Red: the optimizer's actual last step Δθ
    const h = get(historyStore);
    if (h.length >= 2) {
      const da = h[h.length - 1].parameters.a - h[h.length - 2].parameters.a;
      const db = h[h.length - 1].parameters.b - h[h.length - 2].parameters.b;
      const dir = dirVec(da, db);
      if (dir) markerExtras.add(overlayArrow(origin, dir, 0.12, 0xef4444));
    }

    // Amber ghost: where the selected optimizer's next update lands
    const preview = previewNextStep(
      params,
      grad,
      get(optimizerStore),
      get(optimizerStateStore),
      get(trainingStore),
      get(runStartStep)
    );
    if (preview && !get(raceStore)) {
      const na = Math.max(min, Math.min(max, preview.a));
      const nb = Math.max(min, Math.min(max, preview.b));
      const ghostPos = new THREE.Vector3(toX(na), heightAt(na, nb) + 0.025, toZ(nb));
      if (ghostPos.distanceTo(origin) > 0.012) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints([origin, ghostPos]);
        const lineMat = new THREE.LineDashedMaterial({
          color: 0xfbbf24,
          dashSize: 0.022,
          gapSize: 0.016,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
          depthWrite: false
        });
        const line = new THREE.Line(lineGeo, lineMat);
        line.computeLineDistances();
        line.renderOrder = 11;
        markerExtras.add(line);

        const ghost = new THREE.Mesh(
          new THREE.SphereGeometry(0.024, 16, 12),
          new THREE.MeshBasicMaterial({
            color: 0xfbbf24,
            transparent: true,
            opacity: 0.55,
            depthTest: false,
            depthWrite: false
          })
        );
        ghost.renderOrder = 11;
        ghost.position.copy(ghostPos);
        markerExtras.add(ghost);
      }
    }

    scene3.add(markerExtras);
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

  /** Axis label as a small always-facing sprite ('α' / 'β' / 'L'). */
  function makeLabel(text: string, color: string): THREE.Sprite {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'italic 44px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
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
    const color = theme === 'dark' ? '#527a75' : '#064e3b';
    labelA = makeLabel('α', color);
    labelA.position.set(1.3, 0.02, 0);
    labelB = makeLabel('β', color);
    labelB.position.set(0, 0.02, -1.3);
    scene3.add(labelA, labelB);
  }

  // ---------- orientation gizmo (top-right corner, like 3D software) ----------
  // A tiny second scene with three labeled axis arrows; its camera copies the
  // main camera's orientation every frame, so the arrows always show where
  // α, β, and the loss axis point in the current view.

  const GIZMO_SIZE = 72; // CSS px
  let gizmoScene: THREE.Scene | null = null;
  const gizmoCam = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 10);

  function disposeGizmo() {
    if (!gizmoScene) return;
    gizmoScene.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(m => m.dispose());
      else mat?.dispose();
      const sprite = obj as THREE.Sprite;
      if (sprite.isSprite) sprite.material.map?.dispose();
    });
    gizmoScene = null;
  }

  function buildGizmo(theme: string) {
    disposeGizmo();
    gizmoScene = new THREE.Scene();
    const dark = theme === 'dark';
    const arrowColor = dark ? 0x94a3b8 : 0x64748b;
    const labelColor = dark ? '#cbd5e1' : '#475569';

    const axes: Array<{ dir: THREE.Vector3; label: string }> = [
      { dir: new THREE.Vector3(1, 0, 0), label: 'α' },
      { dir: new THREE.Vector3(0, 0, -1), label: 'β' },
      { dir: new THREE.Vector3(0, 1, 0), label: 'ℒ' } // script L, matching the formulas
    ];

    for (const { dir, label } of axes) {
      const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), 0.8, arrowColor, 0.24, 0.11);
      gizmoScene.add(arrow);
      const sprite = makeLabel(label, labelColor);
      sprite.scale.setScalar(0.5);
      sprite.position.copy(dir).multiplyScalar(1.12);
      gizmoScene.add(sprite);
    }
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
      clearCoach();
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

    // depthTest off + high renderOrder: a converged marker sits inside a
    // basin depression, which the near rim would otherwise hide entirely.
    const markerGeo = new THREE.SphereGeometry(0.034, 24, 16);
    const markerMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xb45309,
      emissiveIntensity: 0.55,
      roughness: 0.4,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    markerSphere = new THREE.Mesh(markerGeo, markerMat);
    markerSphere.renderOrder = 11;
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
        if (currentScene) {
          buildPath(h);
          updateMarker();
        }
      }),
      raceStore.subscribe(rs => {
        if (currentScene) buildRaceTrails(rs);
        if (currentScene) updateMarker();
      }),
      optimizerStore.subscribe(() => {
        if (currentScene) updateMarker();
      }),
      optimizerStateStore.subscribe(() => {
        if (currentScene) updateMarker();
      }),
      trainingStore.subscribe(() => {
        if (currentScene) updateMarker();
      }),
      runStartStep.subscribe(() => {
        if (currentScene) updateMarker();
      }),
      themeStore.subscribe(t => {
        applyTheme(t);
        buildLabels(t);
        buildGizmo(t);
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
      const r = renderer!;
      const w = container.clientWidth;
      const h = container.clientHeight;
      r.render(scene3, camera);

      // Gizmo pass: small scissored viewport in the top-right corner whose
      // camera mirrors the main camera's orientation. autoClear must be off
      // so the corner keeps the already-rendered surface pixels behind the
      // arrows (otherwise the region clears to an opaque square).
      if (gizmoScene && w > GIZMO_SIZE * 2) {
        const gx = w - GIZMO_SIZE - 8;
        const gy = h - GIZMO_SIZE - 8; // viewport y counts from the bottom
        r.autoClear = false;
        r.clearDepth();
        r.setScissorTest(true);
        r.setViewport(gx, gy, GIZMO_SIZE, GIZMO_SIZE);
        r.setScissor(gx, gy, GIZMO_SIZE, GIZMO_SIZE);
        gizmoCam.position
          .copy(camera.position)
          .sub(controls.target)
          .normalize()
          .multiplyScalar(3);
        gizmoCam.up.copy(camera.up);
        gizmoCam.lookAt(0, 0, 0);
        r.render(gizmoScene, gizmoCam);
        r.setScissorTest(false);
        r.setViewport(0, 0, w, h);
        r.autoClear = true;
      }

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
    disposeGizmo();
    disposeRaceGroup();
    disposeMarkerExtras();
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
