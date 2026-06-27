<script lang="ts">
  /**
   * A small, self-contained 3-D bowl for the guide's gradient chapter — a real
   * WebGL scene (same Three.js stack the app's landscape uses), not a flat SVG.
   * It shows the steepest-ascent gradient ∇ℒ and its negative −∇ℒ drawn on the
   * wall of a paraboloid, both perpendicular to the level ring they sit on.
   * Gently auto-rotates; the reader can also drag to orbit. No app state — it is
   * lazy-imported only while the guide is open, then fully disposed.
   */
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

  let container: HTMLDivElement;
  let renderer: THREE.WebGLRenderer | null = null;
  let controls: OrbitControls | null = null;
  let raf = 0;
  let ro: ResizeObserver | null = null;
  let themeObs: MutationObserver | null = null;

  const K = 0.62; // bowl curvature: height = K(x²+y²)
  // World point on the surface for a parameter (x,y). PlaneGeometry is built in
  // its XY plane then rotated −90° about X, which sends (x,y,height) → (x,height,−y).
  const surf = (x: number, y: number) => new THREE.Vector3(x, K * (x * x + y * y), -y);

  onMount(() => {
    const W = container.clientWidth || 600;
    const H = container.clientHeight || 300;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(44, W / H, 0.01, 50);
    camera.position.set(2.1, 1.65, 2.1);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(W, H);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.34, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.85;
    controls.minDistance = 1.7;
    controls.maxDistance = 4.5;
    controls.maxPolarAngle = Math.PI * 0.495;

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const sun = new THREE.DirectionalLight(0xffffff, 0.65);
    sun.position.set(2, 3, 1.5);
    scene.add(sun);

    // ---- the bowl: a paraboloid surface + a wireframe over it ----
    const N = 40, R = 1.05;
    const geo = new THREE.PlaneGeometry(2 * R, 2 * R, N, N);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      p.setZ(i, K * (x * x + y * y));
    }
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    const surfMat = new THREE.MeshStandardMaterial({
      color: 0x10b981, transparent: true, opacity: 0.14,
      roughness: 0.85, metalness: 0, side: THREE.DoubleSide
    });
    scene.add(new THREE.Mesh(geo, surfMat));
    const wireMat = new THREE.LineBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.34 });
    scene.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), wireMat));

    // The wireframe needs far more contrast on the near-white light background
    // than on the dark panel — track the theme and recolour the grid live.
    const applyTheme = () => {
      const dk = document.documentElement.getAttribute('data-theme') !== 'light';
      wireMat.color.setHex(dk ? 0x34d399 : 0x0f766e);
      wireMat.opacity = dk ? 0.34 : 0.62;
      surfMat.opacity = dk ? 0.14 : 0.13;
    };
    applyTheme();
    themeObs = new MutationObserver(applyTheme);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // ---- the point P on the wall ----
    const Px = 0.62, Py = 0.62;
    const P = surf(Px, Py);
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0x92400e, emissiveIntensity: 0.5, roughness: 0.4 })
    );
    marker.position.copy(P);
    scene.add(marker);

    // ---- the level ring through P (a contour at P's height) ----
    const rLev = Math.hypot(Px, Py);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(rLev, 0.0035, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = K * rLev * rLev;
    scene.add(ring);

    // ---- gradient arrows tangent to the surface in the steepest direction ----
    const m = rLev, ux = Px / m, uy = Py / m;
    // d/ds surf(Px+ux·s, Py+uy·s) = (ux, 2K(Px·ux+Py·uy), −uy)
    const upDir = new THREE.Vector3(ux, 2 * K * (Px * ux + Py * uy), -uy).normalize();
    const dnDir = upDir.clone().multiplyScalar(-1);
    // Solid arrows (cylinder shaft + cone head) — a 1px ArrowHelper line looked
    // thin and unprofessional next to its big head, so build them from geometry.
    const makeArrow = (dir: THREE.Vector3, origin: THREE.Vector3, length: number, hex: number) => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.45, metalness: 0 });
      const headLen = 0.15, headR = 0.05, shaftR = 0.018;
      const shaftLen = Math.max(0.01, length - headLen);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 20), mat);
      shaft.position.y = shaftLen / 2;
      const head = new THREE.Mesh(new THREE.ConeGeometry(headR, headLen, 22), mat);
      head.position.y = shaftLen + headLen / 2;
      g.add(shaft, head);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      g.position.copy(origin);
      return g;
    };
    scene.add(makeArrow(upDir, P, 0.72, 0xf59e0b));
    scene.add(makeArrow(dnDir, P, 0.58, 0x34d399));

    // ---- basin marker at the bottom ----
    const basin = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x34d399 })
    );
    basin.position.set(0, 0, 0);
    scene.add(basin);

    const loop = () => {
      controls?.update();
      renderer?.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    ro = new ResizeObserver(() => {
      if (!renderer) return;
      const w = container.clientWidth, h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    ro?.disconnect();
    themeObs?.disconnect();
    controls?.dispose();
    if (renderer) {
      renderer.dispose();
      renderer.domElement.remove();
      renderer = null;
    }
  });
</script>

<div class="g3d" bind:this={container}></div>

<style>
  .g3d {
    width: 100%;
    height: 100%;
    cursor: grab;
  }
  .g3d:active { cursor: grabbing; }
  .g3d :global(canvas) { display: block; }
</style>
