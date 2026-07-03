/**
 * Section plane tool: one axis-aligned clipping plane (X/Y/Z) with a
 * position slider and flip, applied through renderer.localClippingEnabled
 * with a translucent helper plane while active.
 */
import * as THREE from 'three';
import { $ } from '../ui/dom.js';

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

export function createSectionTool(ctx) {
  let active = false;
  let axis = 'x';
  let t = 0.5; // 0..1 across the model bounding box
  let flipped = false;

  const plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);

  const helperMaterial = new THREE.MeshBasicMaterial({
    color: 0x4d8dff,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const helper = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), helperMaterial);
  helper.visible = false;
  helper.renderOrder = 500;
  helper.raycast = () => {};
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
    new THREE.LineBasicMaterial({ color: 0x4d8dff, transparent: true, opacity: 0.5 })
  );
  outline.raycast = () => {};
  helper.add(outline);
  ctx.annotations.add(helper);

  function box() {
    return ctx.modelBox || new THREE.Box3(new THREE.Vector3(-100, -100, -100), new THREE.Vector3(100, 100, 100));
  }

  function planePosition() {
    const b = box();
    const min = b.min[axis];
    const max = b.max[axis];
    return min + (max - min) * t;
  }

  function updatePlane() {
    const normal = AXES[axis].clone().multiplyScalar(flipped ? 1 : -1);
    const point = new THREE.Vector3();
    point[axis] = planePosition();
    plane.setFromNormalAndCoplanarPoint(normal, point);

    const b = box();
    const size = b.getSize(new THREE.Vector3());
    const center = b.getCenter(new THREE.Vector3());
    center[axis] = planePosition();
    helper.position.copy(center);
    helper.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), AXES[axis]);
    const dims = { x: [size.y, size.z], y: [size.x, size.z], z: [size.x, size.y] }[axis];
    helper.scale.set(Math.max(dims[0], 1) * 1.12, Math.max(dims[1], 1) * 1.12, 1);
    ctx.invalidate();
  }

  /** Assigns or clears clippingPlanes on every part/edge material. */
  function applyClipping() {
    const planes = active ? [plane] : null;
    ctx.modelRoot.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (m.clippingPlanes !== planes) {
          m.clippingPlanes = planes;
          m.needsUpdate = true;
        }
      }
    });
    helper.visible = active;
    ctx.invalidate();
  }

  function setActive(on) {
    active = on;
    if (on) updatePlane();
    applyClipping();
    ctx.events.emit('section-tool-changed', { active, axis, t, flipped });
  }

  function setAxis(a) {
    if (!AXES[a]) return;
    axis = a;
    updatePlane();
    ctx.events.emit('section-tool-changed', { active, axis, t, flipped });
  }

  /** @param {number} value slider position 0..1 */
  function setT(value) {
    t = Math.min(Math.max(value, 0), 1);
    updatePlane();
  }

  function flip() {
    flipped = !flipped;
    updatePlane();
    ctx.events.emit('section-tool-changed', { active, axis, t, flipped });
  }

  ctx.events.on('model-changed', () => {
    if (active) updatePlane();
    // Always re-apply: newly loaded/attached materials need the plane, and
    // a document re-attached after the tool was turned off must be cleared.
    applyClipping();
  });

  ctx.sectionTool = {
    isActive: () => active,
    setActive,
    toggle: () => setActive(!active),
    setAxis,
    setT,
    getT: () => t,
    getAxis: () => axis,
    flip,
  };

  // Slider/segmented control wiring (right panel card).
  const slider = $('#section-slider');
  slider.addEventListener('input', () => setT(parseFloat(slider.value) / 100));
  $('#section-flip').addEventListener('click', () => flip());
  for (const btn of document.querySelectorAll('[data-section-axis]')) {
    btn.addEventListener('click', () => setAxis(btn.dataset.sectionAxis));
  }
}
