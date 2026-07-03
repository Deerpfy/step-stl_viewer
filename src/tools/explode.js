/**
 * Explode view: offsets each top-level part along the vector from the
 * assembly center to the part center. Fully reversible at factor zero and
 * cooperative with the transform tool (offsets stack on basePosition).
 */
import * as THREE from 'three';
import { $ } from '../ui/dom.js';

const MAX_SPREAD = 1.4;

export function createExplodeTool(ctx) {
  let factor = 0;
  let targets = [];

  /** Top-level movable nodes: the parts/subassemblies of the loaded model,
   *  or the models themselves when several files are loaded side by side. */
  function computeTargets() {
    const roots = ctx.modelRoot.children;
    let nodes;
    if (roots.length === 1) {
      nodes = roots[0].children.length > 0 ? roots[0].children : roots;
    } else {
      nodes = roots;
    }
    // Directions are derived from the collapsed (base) placement so they
    // stay stable no matter what explode factor is applied right now
    // (documents can be re-activated in an exploded state).
    const entries = [];
    const baseUnion = new THREE.Box3();
    for (const node of nodes) {
      const box = new THREE.Box3().setFromObject(node);
      if (box.isEmpty()) {
        entries.push({ node, center: null });
        continue;
      }
      const toBase = node.userData.basePosition
        ? node.userData.basePosition.clone().sub(node.position)
        : new THREE.Vector3();
      box.translate(toBase);
      entries.push({ node, center: box.getCenter(new THREE.Vector3()) });
      baseUnion.union(box);
    }
    const assemblyCenter = baseUnion.isEmpty()
      ? new THREE.Vector3()
      : baseUnion.getCenter(new THREE.Vector3());
    targets = entries.map(({ node, center }) => ({
      node,
      dir: center ? center.clone().sub(assemblyCenter) : new THREE.Vector3(),
    }));
  }

  function apply() {
    for (const { node, dir } of targets) {
      const base = node.userData.basePosition || node.position;
      const offset = dir.clone().multiplyScalar(factor * MAX_SPREAD);
      node.userData.explodeOffset = offset;
      node.position.copy(base).add(offset);
    }
    ctx.invalidate();
  }

  /** @param {number} value 0..1 */
  function setFactor(value) {
    const next = Math.min(Math.max(value, 0), 1);
    if (targets.length === 0 || factorInvalid()) computeTargets();
    factor = next;
    apply();
    ctx.events.emit('explode-changed', factor);
  }

  function factorInvalid() {
    return targets.some(({ node }) => node.parent === null);
  }

  function reset() {
    factor = 0;
    apply();
    ctx.events.emit('explode-changed', 0);
  }

  ctx.events.on('model-changed', () => {
    factor = 0;
    computeTargets();
    apply();
    ctx.events.emit('explode-changed', 0);
  });
  ctx.events.on('transforms-reset', () => {
    factor = 0;
    computeTargets();
    ctx.events.emit('explode-changed', 0);
  });
  // Recompute explode directions when parts get moved with the gizmo at rest.
  ctx.events.on('transforms-changed', () => {
    if (factor === 0) computeTargets();
  });

  ctx.explode = {
    getFactor: () => factor,
    setFactor,
    reset,
    /** D shortcut: jump between collapsed and a half-exploded view. */
    toggle() {
      setFactor(factor > 0 ? 0 : 0.5);
      const slider = $('#explode-slider');
      slider.value = String(Math.round(factor * 100));
    },
    partCount: () => targets.length,
  };

  const slider = $('#explode-slider');
  slider.addEventListener('input', () => setFactor(parseFloat(slider.value) / 100));
  $('#explode-reset').addEventListener('click', () => {
    reset();
    slider.value = '0';
  });
  ctx.events.on('explode-changed', (f) => {
    if (document.activeElement !== slider) slider.value = String(Math.round(f * 100));
  });
}
