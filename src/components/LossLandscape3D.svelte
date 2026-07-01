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
    raceHoverStore,
    optimizerStore,
    optimizerStateStore,
    trainingStore,
    vizLayersStore,
    basinsEnabledStore,
    type LossScene,
    type RaceState,
    type Colormap,
    type FieldDensity
  } from '../stores/stores';
  import { sampleLoss, normalizedLogLoss, viridisRGB, contourThresholds, CONTOUR_COUNT } from '../utils/lossGrid';
  import {
    basinStore,
    basinIdAt,
    BASIN_COLORS_RGB,
    BASIN_UNSETTLED_RGB,
    type BasinState
  } from '../utils/basins';
  import { placeStreamlines } from '../utils/streamlines';
  import { poissonDiskSample } from '../utils/poisson';

  // Field sampling resolution per density (the draped field is recomputed at
  // this resolution, decoupled from the cached scene — same idea as the 2D view).
  // Only Low/High are exposed (Low → normal, High → dense). 3D reads far sparser
  // than 2D at equal res, so both tiers are pushed up: Low matches the old 3D
  // "High", and High is denser still.
  const FIELD_RES_3D: Record<FieldDensity, number> = { sparse: 11, normal: 24, dense: 34 };
  import { runStartStep } from '../utils/trainer';

  // Visualization layers, kept in sync with the 2D view via vizLayersStore.
  let cmap: Colormap = get(vizLayersStore).colormap;
  let layers3d = get(vizLayersStore);
  let vectorField3d: THREE.LineSegments | THREE.Mesh | null = null;

  // Day/dark for the surface + overlays (mirrors the 2D plot). Day is "dark
  // basins on light": the colormap is read in reverse so basins take the
  // rich/dark end, on a white scene. Updated on every theme change.
  let dark3d = get(themeStore) === 'dark';
  let ambientLight: THREE.AmbientLight | null = null;
  let sunLight: THREE.DirectionalLight | null = null;
  let fillLight: THREE.DirectionalLight | null = null;

  // Basins of attraction: when on, the surface is colored by WHICH minimum
  // plain GD reaches from each point (categorical palette) instead of the
  // loss colormap — height still comes from loss, and lighting still shades
  // the terrain, so the shape reads while the color tells the destination.
  let basinsEnabled = get(basinsEnabledStore);
  let basinState: BasinState = get(basinStore);
  let basinMarkers: THREE.Group | null = null;
  import { previewNextStep } from '../utils/preview';
  import type { TrainingHistoryPoint, DataPoint, ProblemConfig } from '../types/types';

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

  /** True when the basin overlay is on and a matching 2-parameter map is ready. */
  function basinActive(): boolean {
    return (
      basinsEnabled &&
      basinState.status === 'ready' &&
      basinState.scene !== null &&
      !basinState.scene.oneParam
    );
  }

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
    const basins = basinActive() ? basinState.scene : null;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const { a, b } = fromXZ(x, z);
      const t = normalizedLogLoss(currentScene.grid, sampleLoss(currentScene.grid, a, b));
      pos.setY(i, t * HEIGHT);
      // Basin mode: flat categorical color per destination (lighting still
      // shades the terrain). Otherwise the loss colormap, bright = low loss.
      let r: number, g: number, bb: number;
      if (basins) {
        const id = basinIdAt(basins, a, b);
        [r, g, bb] = id < 0 ? BASIN_UNSETTLED_RGB : BASIN_COLORS_RGB[id % BASIN_COLORS_RGB.length];
      } else {
        // Dark: bright = low loss (basins glow). Day: reversed → basins take
        // the colormap's dark/rich end so they read on the white scene.
        [r, g, bb] = viridisRGB(dark3d ? 1 - t : t, cmap);
      }
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

  /**
   * One small emissive sphere per basin destination, draped onto the surface
   * at the minimum and colored like its region — the 3D echo of the 2D
   * "destination dots", so each color visibly resolves to one minimum.
   */
  function buildBasinMarkers() {
    if (basinMarkers) {
      scene3.remove(basinMarkers);
      basinMarkers.traverse(obj => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | undefined;
        mat?.dispose();
      });
      basinMarkers = null;
    }
    if (!currentScene || !basinActive() || !basinState.scene) return;

    const { min, max } = currentScene.range;
    basinMarkers = new THREE.Group();
    basinState.scene.minima.forEach((m, i) => {
      if (m.a < min || m.a > max || m.b < min || m.b > max) return;
      const [r, g, b] = BASIN_COLORS_RGB[i % BASIN_COLORS_RGB.length];
      const color = new THREE.Color(r, g, b);
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 16, 12),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.5,
          roughness: 0.4,
          // A converged minimum sits in a depression the near rim would hide;
          // draw it through, like the marker and contours.
          depthTest: false,
          depthWrite: false
        })
      );
      dot.position.set(toX(m.a), heightAt(m.a, m.b) + 0.012, toZ(m.b));
      dot.renderOrder = 9;
      basinMarkers!.add(dot);
    });
    scene3.add(basinMarkers);
  }

  function buildContours() {
    if (!currentScene) return;
    if (contourLines) {
      scene3.remove(contourLines);
      contourLines.geometry.dispose();
      (contourLines.material as THREE.Material).dispose();
      contourLines = null;
    }
    if (!layers3d.contours) return;

    const { grid } = currentScene;
    // Density sets the ring count, mirroring the 2D view.
    const thresholds = contourThresholds(grid, CONTOUR_COUNT[layers3d.density] ?? 16);
    const gen = contours().size([grid.res, grid.res]).smooth(true).thresholds(thresholds);
    const polys = gen(grid.values as unknown as number[]);
    const extSpan = grid.extMax - grid.extMin;
    const { min, max } = currentScene.range;

    // Each ring is drawn as TWO copies: one just above the surface and one just
    // below it (±D in height). With the surface opaque (depthTest on), the top
    // copy shows when you look from above and the bottom copy shows from below,
    // while the surface still hides the far-side rings — so the contours read
    // from any angle without the surface going transparent.
    const D = 0.011;
    const verts: number[] = [];
    for (const poly of polys) {
      const yBase = normalizedLogLoss(grid, poly.value) * HEIGHT;
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
            const xA = toX(aA), zA = toZ(bA), xB = toX(aB), zB = toZ(bB);
            verts.push(xA, yBase + D, zA, xB, yBase + D, zB); // top copy
            verts.push(xA, yBase - D, zA, xB, yBase - D, zB); // bottom copy
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    // depthTest ON so the opaque surface occludes rings on its far side —
    // without it, contours from behind every hill showed through and the
    // surface read as transparent. Lifted slightly above the surface so the
    // visible (near-face) rings still draw cleanly instead of z-fighting.
    const mat = new THREE.LineBasicMaterial({
      color: dark3d ? 0xffffff : 0x334155,
      transparent: true,
      opacity: dark3d ? 0.78 : 0.6,
      depthTest: true,
      depthWrite: false
    });
    contourLines = new THREE.LineSegments(geo, mat);
    contourLines.renderOrder = 8;
    scene3.add(contourLines);
  }

  /**
   * Gradient field draped on the surface: a short downhill segment at each
   * field sample, lifted to the surface height, with a per-vertex color fade
   * (dim base → bright tip) showing direction without batching arrowheads.
   * depthTest off so it reads from any orbit angle, like the contours/marker.
   */
  function buildVectorField3d() {
    if (vectorField3d) {
      scene3.remove(vectorField3d);
      vectorField3d.geometry.dispose();
      (vectorField3d.material as THREE.Material).dispose();
      vectorField3d = null;
    }
    if (!currentScene || layers3d.field === 'off') return;

    // Recompute from the live config/data (not the cached scene field) so the
    // density control actually changes how dense the field is, exactly like 2D.
    const config = get(currentProblemConfig);
    if (!config) return;
    const trainData = get(datasetStore).data.filter(d => d.isTraining);
    const range = currentScene.range;

    // Pale cool-white on the dark scene; a dark slate on the day scene (where
    // white would vanish against the light peaks). Matches the 2D field.
    const c: [number, number, number] = dark3d ? [0.86, 0.91, 1.0] : [0.28, 0.33, 0.42];
    const LIFT = 0.012;

    if (layers3d.field === 'streamlines') {
      // Flowing draped lines (evenly-spaced, Jobard–Lefebvre), colored
      // dim → bright downhill so the flow direction reads from any angle.
      const verts: number[] = [];
      const cols: number[] = [];
      for (const line of buildStreamlines3d(config, trainData, range)) {
        const last = line.length - 1;
        for (let i = 0; i < last; i++) {
          const p = line[i], q = line[i + 1];
          const f0 = 0.45 + 0.55 * (i / last);
          const f1 = 0.45 + 0.55 * ((i + 1) / last);
          verts.push(toX(p.a), heightAt(p.a, p.b) + LIFT, toZ(p.b),
                     toX(q.a), heightAt(q.a, q.b) + LIFT, toZ(q.b));
          cols.push(c[0] * f0, c[1] * f0, c[2] * f0, c[0] * f1, c[1] * f1, c[2] * f1);
        }
      }
      if (!verts.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.95, depthTest: true, depthWrite: false
      });
      vectorField3d = new THREE.LineSegments(geo, mat);
      vectorField3d.renderOrder = 7;
      scene3.add(vectorField3d);
      return;
    }

    // Arrows: a flat-ribbon shaft + a solid triangle head, both draped on the
    // surface — so they read like the 2D arrows (a visible tail with width, not
    // a 1px WebGL line). Blue-noise placement (utils/poisson); shaft length ∝ |∇|.
    const span = range.max - range.min;
    const res = FIELD_RES_3D[layers3d.density] ?? 16;
    let maxMag = 0;
    const arrows = poissonDiskSample(range.min, range.max, span / res).map(p => {
      const gr = config.computeGradient(trainData, { a: p.x, b: p.y });
      const mag = Math.hypot(gr.a, gr.b);
      if (Number.isFinite(mag) && mag > maxMag) maxMag = mag;
      return { a: p.x, b: p.y, ga: gr.a, gb: gr.b, mag };
    });
    const LEN = 0.09;
    // Fixed-size head (only the shaft length carries magnitude), shrunk on tiny
    // arrows so it never outruns its shaft. Slightly smaller than before.
    const HEAD_LEN = 0.021; // arrowhead length, world units
    const HEAD_W = 0.013; // arrowhead half-width, world units
    const SHAFT_HW = 0.005; // shaft ribbon half-width — the visible tail
    const dim: [number, number, number] = [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5];
    const surfY = (x: number, z: number) => {
      const q = fromXZ(x, z);
      return heightAt(q.a, q.b) + LIFT + 0.003;
    };
    const triVerts: number[] = [];
    const triCols: number[] = [];
    for (const ar of arrows) {
      const d = dirVec(-ar.ga, -ar.gb);
      if (!d) continue;
      const norm = maxMag > 0 ? ar.mag / maxMag : 0;
      const len = LEN * (0.12 + 0.88 * norm); // flat = tiny, steep = bold
      const x0 = toX(ar.a), z0 = toZ(ar.b);
      const xt = x0 + d.x * len, zt = z0 + d.z * len;
      const hl = Math.min(HEAD_LEN, len * 0.7);
      const hw = HEAD_W * (hl / HEAD_LEN);
      const bx = xt - d.x * hl, bz = zt - d.z * hl; // base centre of the head
      const px = -d.z, pz = d.x; // perpendicular to d in the (x,z) plane
      // Shaft ribbon: origin → head base, a flat quad draped on the surface,
      // fading dim base → bright tip like the 2D field.
      const sLx = x0 + px * SHAFT_HW, sLz = z0 + pz * SHAFT_HW;
      const sRx = x0 - px * SHAFT_HW, sRz = z0 - pz * SHAFT_HW;
      const eLx = bx + px * SHAFT_HW, eLz = bz + pz * SHAFT_HW;
      const eRx = bx - px * SHAFT_HW, eRz = bz - pz * SHAFT_HW;
      triVerts.push(sLx, surfY(sLx, sLz), sLz, sRx, surfY(sRx, sRz), sRz, eLx, surfY(eLx, eLz), eLz);
      triCols.push(dim[0], dim[1], dim[2], dim[0], dim[1], dim[2], c[0], c[1], c[2]);
      triVerts.push(eLx, surfY(eLx, eLz), eLz, sRx, surfY(sRx, sRz), sRz, eRx, surfY(eRx, eRz), eRz);
      triCols.push(c[0], c[1], c[2], dim[0], dim[1], dim[2], c[0], c[1], c[2]);
      // Solid triangle head: tip + two base corners, each draped to the surface.
      const lx = bx + px * hw, lz = bz + pz * hw;
      const rx = bx - px * hw, rz = bz - pz * hw;
      triVerts.push(xt, surfY(xt, zt), zt, lx, surfY(lx, lz), lz, rx, surfY(rx, rz), rz);
      triCols.push(c[0], c[1], c[2], c[0], c[1], c[2], c[0], c[1], c[2]);
    }
    if (!triVerts.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(triVerts), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(triCols), 3));
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthTest: true, // occluded by the surface — no more x-ray through hills
      depthWrite: false,
      side: THREE.DoubleSide
    });
    vectorField3d = new THREE.Mesh(geo, mat);
    vectorField3d.renderOrder = 7;
    scene3.add(vectorField3d);
  }

  /**
   * Evenly-spaced streamlines in (α, β) space via farthest-point seeding
   * (utils/streamlines) — uniform coverage, lines running into the basins.
   * Returns polylines in parameter space; the caller drapes them on the surface.
   */
  function buildStreamlines3d(
    config: ProblemConfig,
    trainData: DataPoint[],
    range: { min: number; max: number }
  ): { a: number; b: number }[][] {
    const span = range.max - range.min;
    const sepDiv = ({ sparse: 18, normal: 42, dense: 60 } as Record<FieldDensity, number>)[layers3d.density] ?? 42;
    return placeStreamlines(
      { min: range.min, max: range.max, gradient: (a, b) => config.computeGradient(trainData, { a, b }) },
      { dSep: span / sepDiv }
    );
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
    // Spotlight the hovered racer (others dim) — mirrors the 2D layer.
    const hover = get(raceHoverStore);

    for (const racer of rs.racers) {
      const hot = hover === racer.id;
      const dim = hover !== null && !hot;
      const pts: THREE.Vector3[] = [];
      for (const p of racer.trail) {
        const a = Math.max(min, Math.min(max, p.a));
        const b = Math.max(min, Math.min(max, p.b));
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        const v = new THREE.Vector3(toX(a), heightAt(a, b) + 0.018, toZ(b));
        // Skip near-duplicate points: zero-length tangents give TubeGeometry
        // NaN frames that poison the whole mesh into invisibility.
        if (pts.length === 0 || pts[pts.length - 1].distanceToSquared(v) > 1e-10) pts.push(v);
      }
      const trailOpacity = racer.diverged ? (dim ? 0.14 : 0.5) : hot ? 1 : dim ? 0.18 : 0.96;
      if (pts.length >= 2) {
        // A solid colored tube (not a 1px WebGL line, which barely shows on the
        // surface) — the same treatment as the descent trail. Downsample long
        // trails so rebuilding every race tick stays cheap.
        const stride = Math.max(1, Math.ceil(pts.length / 70));
        const tubePts = pts.filter((_, i) => i % stride === 0);
        if (tubePts[tubePts.length - 1] !== pts[pts.length - 1]) tubePts.push(pts[pts.length - 1]);
        if (tubePts.length >= 2) {
          const curve = new THREE.CatmullRomCurve3(tubePts, false, 'centripetal');
          const geo = new THREE.TubeGeometry(curve, Math.min(150, tubePts.length * 2), hot ? 0.0105 : 0.0065, 6, false);
          const mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(racer.color),
            transparent: true,
            opacity: trailOpacity,
            depthTest: false,
            depthWrite: false
          });
          const tube = new THREE.Mesh(geo, mat);
          tube.renderOrder = hot ? 10 : 9;
          raceGroup.add(tube);
        }
      }
      if (pts.length > 0) {
        const baseR = racer.finished ? 0.022 : 0.017;
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(hot ? baseR * 1.5 : baseR, 14, 10),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(racer.color),
            transparent: true,
            opacity: racer.diverged ? (dim ? 0.2 : 0.45) : hot ? 1 : dim ? 0.2 : 1,
            depthTest: false,
            depthWrite: false
          })
        );
        head.renderOrder = hot ? 12 : 11;
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
      get(runStartStep),
      config,
      train
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

  // Day leans on ambient (even, colour-faithful) and eases the directional
  // lights so the light peaks don't blow out to white on the white scene; dark
  // keeps the calmer directional set that keeps the glowing basins rich.
  function applyLights(dark: boolean) {
    if (ambientLight) ambientLight.intensity = dark ? 0.5 : 0.85;
    if (sunLight) sunLight.intensity = dark ? 0.8 : 0.42;
    if (fillLight) fillLight.intensity = dark ? 0.28 : 0.18;
  }

  function applyTheme(theme: string) {
    const dark = theme === 'dark';
    dark3d = dark;
    applyLights(dark);
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

    // Calmer lights: the old set (0.6 + 1.1 + 0.35) blew the bright basins out
    // to white, washing the surface and swallowing the overlays. Pulled down so
    // the colormap stays rich and the contours/arrows read against it.
    ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene3.add(ambientLight);
    sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(1.5, 2.5, 1);
    scene3.add(sunLight);
    fillLight = new THREE.DirectionalLight(0xffffff, 0.28);
    fillLight.position.set(-1.5, 1.2, -1.5);
    scene3.add(fillLight);
    applyLights(dark3d);

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
        buildVectorField3d();
        buildBasinMarkers();
        buildPath(get(historyStore));
        updateMarker();
      }),
      // Basin overlay: toggling it, or a freshly computed map arriving,
      // recolors the surface and refreshes the destination markers.
      basinsEnabledStore.subscribe(on => {
        basinsEnabled = on;
        if (currentScene) {
          buildSurface();
          buildBasinMarkers();
        }
      }),
      basinStore.subscribe(s => {
        basinState = s;
        if (currentScene && basinsEnabled) {
          buildSurface();
          buildBasinMarkers();
        }
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
      raceHoverStore.subscribe(() => {
        if (currentScene) buildRaceTrails(get(raceStore));
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
        applyTheme(t); // sets dark3d + lights + background/grid
        buildLabels(t);
        buildGizmo(t);
        if (currentScene) {
          buildSurface(); // re-color: dark basins on light / bright on dark
          buildContours();
        }
        buildVectorField3d(); // re-tint the field for the new theme
      }),
      // Mirror the 2D Layers controls: colormap re-tints the surface, the
      // contour toggle (and density) rebuild the rings, and field/density
      // rebuild the draped gradient field.
      vizLayersStore.subscribe(v => {
        const colorChanged = v.colormap !== cmap;
        const contoursChanged = v.contours !== layers3d.contours || v.density !== layers3d.density;
        const fieldChanged = v.field !== layers3d.field || v.density !== layers3d.density;
        cmap = v.colormap;
        layers3d = v;
        if (!currentScene) return;
        if (colorChanged) buildSurface();
        if (contoursChanged) buildContours();
        if (fieldChanged) buildVectorField3d();
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
