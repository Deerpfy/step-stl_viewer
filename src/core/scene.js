/**
 * Renderer, scene graph root, lights, grid, and the render-on-demand loop.
 * Nothing renders unless invalidate() is called; the loop runs continuously
 * only while controls are moving and pauses entirely when the tab is hidden.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * @param {object} ctx shared application context (mutated in place)
 */
export function createSceneManager(ctx) {
  THREE.Object3D.DEFAULT_UP.set(0, 0, 1); // CAD convention: Z is up

  const canvas = document.getElementById('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.localClippingEnabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.background = null; // the themed CSS gradient behind the canvas shows through

  const modelRoot = new THREE.Group();
  modelRoot.name = 'Models';
  scene.add(modelRoot);

  const annotations = new THREE.Group();
  annotations.name = 'Annotations';
  scene.add(annotations);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x50555e, 0.55);
  hemi.position.set(0, 0, 1);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(180, -220, 300);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-200, 160, -120);
  scene.add(fill);

  let grid = null;
  let gridVisible = true;
  let environmentReady = false;

  /** Procedural studio environment for PBR reflections; built lazily on the
   *  first model load to keep first paint instant. */
  function ensureEnvironment() {
    if (environmentReady) return;
    environmentReady = true;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    envScene.dispose();
    pmrem.dispose();
  }

  function gridColors() {
    const dark = document.documentElement.dataset.theme !== 'light';
    return dark ? [0x3c424d, 0x262a32] : [0xb3bac4, 0xd4d9e0];
  }

  /** Rebuilds the floor grid sized to the given bounding box (or a default). */
  function rebuildGrid(box) {
    if (grid) {
      grid.geometry.dispose();
      grid.material.dispose();
      scene.remove(grid);
      grid = null;
    }
    let size = 200;
    let zLevel = 0;
    if (box && !box.isEmpty()) {
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      size = niceNumber(Math.max(sphere.radius * 4, 1));
      zLevel = box.min.z;
    }
    const [center, lines] = gridColors();
    grid = new THREE.GridHelper(size, 20, center, lines);
    grid.rotation.x = Math.PI / 2; // GridHelper is XZ-native; rotate into the XY floor plane
    grid.position.z = zLevel;
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    grid.material.depthWrite = false;
    grid.visible = gridVisible;
    scene.add(grid);
  }

  function niceNumber(v) {
    const exp = Math.floor(Math.log10(v));
    const base = Math.pow(10, exp);
    const n = v / base;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * base;
  }

  // ---- render-on-demand loop --------------------------------------------
  let renderRequested = false;
  let continuousUntil = 0;
  const renderCallbacks = new Set();

  function invalidate() {
    if (renderRequested || document.hidden) return;
    renderRequested = true;
    requestAnimationFrame(frame);
  }

  /** Keeps rendering for the next `ms` milliseconds (damping, animations). */
  function requestFrames(ms) {
    continuousUntil = Math.max(continuousUntil, performance.now() + ms);
    invalidate();
  }

  function frame() {
    renderRequested = false;
    if (document.hidden || !ctx.camera) return;
    const controls = ctx.controls;
    if (controls) controls.update();
    for (const cb of renderCallbacks) cb();
    renderer.render(scene, ctx.camera);
    if (ctx.renderTriad) ctx.renderTriad();
    // Continue through invalidate() so an already-pending frame (e.g. one
    // scheduled by the controls' synchronous 'change' event during update())
    // is never duplicated -- unconditional scheduling here compounds to
    // several renders per vsync and stutters the orbit.
    if (performance.now() < continuousUntil) invalidate();
  }

  /** Renders one frame synchronously (used by the screenshot capture). */
  function renderNow({ skipTriad = false } = {}) {
    if (ctx.controls) ctx.controls.update();
    for (const cb of renderCallbacks) cb();
    renderer.render(scene, ctx.camera);
    if (!skipTriad && ctx.renderTriad) ctx.renderTriad();
  }

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    if (ctx.onViewportResize) ctx.onViewportResize(w, h);
    invalidate();
  }
  new ResizeObserver(resize).observe(canvas.parentElement);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) invalidate();
  });

  ctx.canvas = canvas;
  ctx.renderer = renderer;
  ctx.scene = scene;
  ctx.modelRoot = modelRoot;
  ctx.annotations = annotations;
  ctx.invalidate = invalidate;
  ctx.requestFrames = requestFrames;
  ctx.stopFrames = () => {
    continuousUntil = 0;
  };
  ctx.renderNow = renderNow;
  ctx.onRender = (cb) => renderCallbacks.add(cb);
  ctx.offRender = (cb) => renderCallbacks.delete(cb);
  ctx.rebuildGrid = rebuildGrid;
  ctx.ensureEnvironment = ensureEnvironment;
  ctx.setGridVisible = (v) => {
    gridVisible = v;
    if (grid) grid.visible = v;
    invalidate();
  };
  ctx.isGridVisible = () => gridVisible;
  ctx.refreshGridTheme = () => rebuildGrid(ctx.modelBox);
  ctx.resizeViewport = resize;

  rebuildGrid(null);
}
