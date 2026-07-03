/**
 * Cameras (perspective + orthographic), OrbitControls, camera fitting,
 * standard views, and animated transitions.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const FOV = 45;
const VIEW_DIRS = {
  // Direction FROM target TO camera, Z-up world. Top/bottom are nudged off
  // the pole so OrbitControls keeps a stable frame.
  front: [0, -1, 0],
  back: [0, 1, 0],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  top: [0, -1e-4, 1],
  bottom: [0, -1e-4, -1],
  iso: [1, -1, 0.9],
};

export function createViews(ctx) {
  const persp = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100000);
  persp.position.set(320, -320, 240);
  const ortho = new THREE.OrthographicCamera(-200, 200, 200, -200, -100000, 100000);
  ortho.position.copy(persp.position);

  let active = persp;
  let aspect = 1;
  let orthoHalfH = 200;

  const controls = new OrbitControls(persp, ctx.canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.zoomToCursor = true;
  controls.screenSpacePanning = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.addEventListener('change', () => ctx.invalidate());
  controls.addEventListener('start', () => ctx.requestFrames(1e9));
  controls.addEventListener('end', () => {
    ctx.stopFrames();
    ctx.requestFrames(1500); // let damping settle
  });

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let animToken = 0;

  function applyAspect(w, h) {
    aspect = w / h;
    persp.aspect = aspect;
    persp.updateProjectionMatrix();
    ortho.left = -orthoHalfH * aspect;
    ortho.right = orthoHalfH * aspect;
    ortho.top = orthoHalfH;
    ortho.bottom = -orthoHalfH;
    ortho.updateProjectionMatrix();
  }

  function boundsOf(object) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return null;
    return box.getBoundingSphere(new THREE.Sphere());
  }

  function fitDistance(radius) {
    const vFov = (persp.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    return (radius * 1.1) / Math.sin(Math.min(vFov, hFov) / 2);
  }

  /**
   * Animates the active camera to a new position/target (and ortho zoom).
   */
  function animateTo(pos, target, zoom, duration = 500) {
    const token = ++animToken;
    if (reducedMotion || duration === 0) {
      active.position.copy(pos);
      controls.target.copy(target);
      if (active === ortho && zoom != null) {
        ortho.zoom = zoom;
        ortho.updateProjectionMatrix();
      }
      controls.update();
      ctx.invalidate();
      return;
    }
    const p0 = active.position.clone();
    const t0 = controls.target.clone();
    const z0 = ortho.zoom;
    const start = performance.now();
    ctx.requestFrames(duration + 60);
    function tick() {
      if (token !== animToken) return;
      const raw = Math.min((performance.now() - start) / duration, 1);
      const e = 1 - Math.pow(1 - raw, 3);
      active.position.lerpVectors(p0, pos, e);
      controls.target.lerpVectors(t0, target, e);
      if (active === ortho && zoom != null) {
        ortho.zoom = z0 + (zoom - z0) * e;
        ortho.updateProjectionMatrix();
      }
      controls.update();
      ctx.invalidate();
      if (raw < 1) requestAnimationFrame(tick);
    }
    tick();
  }

  // Cancel a running camera animation as soon as the user grabs the view.
  ctx.canvas.addEventListener('pointerdown', () => {
    animToken++;
  });

  function currentDir() {
    const d = active.position.clone().sub(controls.target);
    return d.lengthSq() < 1e-12 ? new THREE.Vector3(1, -1, 0.9).normalize() : d.normalize();
  }

  /**
   * Fits the view to an object (or the whole model root), keeping the
   * current viewing direction.
   * @param {THREE.Object3D} [object]
   * @param {boolean} [animate]
   */
  function fit(object = ctx.modelRoot, animate = true) {
    const sphere = boundsOf(object);
    if (!sphere) return;
    updateClipRange(sphere.radius);
    const dir = currentDir();
    if (active === persp) {
      const pos = sphere.center.clone().add(dir.multiplyScalar(fitDistance(sphere.radius)));
      animateTo(pos, sphere.center, null, animate ? 500 : 0);
    } else {
      const zoom = orthoHalfH / (sphere.radius * 1.15);
      const pos = sphere.center.clone().add(dir.multiplyScalar(sphere.radius * 3 + 1));
      animateTo(pos, sphere.center, zoom, animate ? 500 : 0);
    }
  }

  /**
   * Snaps to a named standard view around the current model.
   * @param {'front'|'back'|'left'|'right'|'top'|'bottom'|'iso'} name
   */
  function setView(name) {
    const dirArr = VIEW_DIRS[name];
    if (!dirArr) return;
    const dir = new THREE.Vector3(...dirArr).normalize();
    const sphere = boundsOf(ctx.modelRoot) || new THREE.Sphere(new THREE.Vector3(), 120);
    updateClipRange(sphere.radius);
    if (active === persp) {
      const pos = sphere.center.clone().add(dir.clone().multiplyScalar(fitDistance(sphere.radius)));
      animateTo(pos, sphere.center, null, 450);
    } else {
      const zoom = orthoHalfH / (sphere.radius * 1.15);
      const pos = sphere.center.clone().add(dir.clone().multiplyScalar(sphere.radius * 3 + 1));
      animateTo(pos, sphere.center, zoom, 450);
    }
  }

  function updateClipRange(radius) {
    persp.near = Math.max(radius / 1000, 0.001);
    persp.far = Math.max(radius * 60, 2000);
    persp.updateProjectionMatrix();
  }

  /** Switches between perspective and orthographic, preserving the view. */
  function toggleProjection() {
    const target = controls.target.clone();
    if (active === persp) {
      const dist = persp.position.distanceTo(target);
      const halfH = dist * Math.tan(((persp.fov / 2) * Math.PI) / 180);
      orthoHalfH = halfH;
      applyAspect(aspectWidth(), aspectHeight());
      ortho.zoom = 1;
      ortho.position.copy(persp.position);
      ortho.updateProjectionMatrix();
      active = ortho;
    } else {
      const visibleHalfH = orthoHalfH / ortho.zoom;
      const dist = visibleHalfH / Math.tan(((persp.fov / 2) * Math.PI) / 180);
      const dir = ortho.position.clone().sub(target).normalize();
      persp.position.copy(target).add(dir.multiplyScalar(dist));
      active = persp;
    }
    ctx.camera = active;
    controls.object = active;
    controls.update();
    ctx.events.emit('projection-changed', active === ortho ? 'orthographic' : 'perspective');
    ctx.invalidate();
    return active === ortho ? 'orthographic' : 'perspective';
  }

  let vpW = 1;
  let vpH = 1;
  const aspectWidth = () => vpW;
  const aspectHeight = () => vpH;

  ctx.onViewportResize = (w, h) => {
    vpW = w;
    vpH = h;
    applyAspect(w, h);
  };

  /** World-space size of one screen pixel at a given point (label scaling). */
  function worldPerPixelAt(point) {
    if (active === persp) {
      const dist = active.position.distanceTo(point);
      return (2 * dist * Math.tan(((persp.fov / 2) * Math.PI) / 180)) / vpH;
    }
    return (2 * orthoHalfH) / ortho.zoom / vpH;
  }

  /** Captures the full camera pose for per-document restore. */
  function getCameraState() {
    return {
      isOrtho: active === ortho,
      position: active.position.clone(),
      target: controls.target.clone(),
      orthoZoom: ortho.zoom,
      orthoHalfH,
      near: persp.near,
      far: persp.far,
    };
  }

  /** Restores a pose captured by getCameraState (no animation). */
  function applyCameraState(state) {
    animToken++; // cancel any in-flight camera animation
    if (state.isOrtho !== (active === ortho)) toggleProjection();
    orthoHalfH = state.orthoHalfH;
    applyAspect(vpW, vpH);
    ortho.zoom = state.orthoZoom;
    ortho.updateProjectionMatrix();
    persp.near = state.near;
    persp.far = state.far;
    persp.updateProjectionMatrix();
    active.position.copy(state.position);
    controls.target.copy(state.target);
    controls.update();
    ctx.invalidate();
  }

  ctx.camera = active;
  ctx.controls = controls;
  ctx.views = {
    fit,
    setView,
    toggleProjection,
    worldPerPixelAt,
    getCameraState,
    applyCameraState,
    isOrthographic: () => active === ortho,
    animateTarget: (point) => {
      animateTo(active.position.clone(), point, active === ortho ? ortho.zoom : null, 350);
    },
  };
}
