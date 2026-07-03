/**
 * Part picking and selection state: emissive tint + accent edge outline on
 * the selected subtree, hide / isolate / show-all, and double-click orbit
 * pivot placement.
 */
import * as THREE from 'three';

const CLICK_MAX_MOVE_PX = 5;
const CLICK_MAX_MS = 500;
const HIGHLIGHT_EMISSIVE = 0x2e5db8;

export function createSelection(ctx) {
  const raycaster = new THREE.Raycaster();
  let selected = null;
  let highlighted = [];

  function isActuallyVisible(obj) {
    for (let o = obj; o; o = o.parent) {
      if (!o.visible) return false;
    }
    return true;
  }

  /**
   * Raycasts the part meshes at client coordinates.
   * @returns {THREE.Intersection | null}
   */
  function pick(clientX, clientY) {
    const rect = ctx.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1)
    );
    raycaster.setFromCamera(ndc, ctx.camera);
    const candidates = ctx.pickables.filter(isActuallyVisible);
    const hits = raycaster.intersectObjects(candidates, false);
    return hits.length ? hits[0] : null;
  }

  function partMeshesIn(object) {
    const list = [];
    object.traverse((o) => {
      if (o.userData.isPart) list.push(o);
    });
    return list;
  }

  function clearHighlight() {
    for (const mesh of highlighted) {
      mesh.material.emissive.setHex(0x000000);
      if (mesh.userData.edgeRecord) mesh.userData.edgeRecord.selection.visible = false;
    }
    highlighted = [];
  }

  /**
   * Selects an object (part mesh or group) or clears the selection.
   * @param {THREE.Object3D | null} object
   */
  function select(object) {
    if (object === selected) return;
    clearHighlight();
    selected = object || null;
    if (selected) {
      highlighted = partMeshesIn(selected);
      // Outline whole assemblies only up to a sane cost; the emissive tint
      // always applies.
      const outline = highlighted.length <= 64;
      for (const mesh of highlighted) {
        mesh.material.emissive.setHex(HIGHLIGHT_EMISSIVE);
        mesh.material.emissiveIntensity = 0.35;
        // Building EdgesGeometry for a multi-hundred-thousand-triangle part
        // just for a click would stall; those parts get the tint only.
        if (outline && (mesh.userData.triangles || 0) < 300000) {
          ctx.displayModes.getEdges(mesh, 'selection').visible = true;
        }
      }
    }
    ctx.events.emit('selection-changed', selected);
    ctx.invalidate();
  }

  function hideSelected() {
    if (!selected) return;
    for (const mesh of partMeshesIn(selected)) mesh.visible = false;
    select(null);
    ctx.events.emit('visibility-changed');
    ctx.invalidate();
  }

  function isolateSelected() {
    if (!selected) return;
    const keep = new Set(partMeshesIn(selected));
    for (const mesh of ctx.pickables) mesh.visible = keep.has(mesh);
    ctx.events.emit('visibility-changed');
    ctx.invalidate();
  }

  function showAll() {
    for (const mesh of ctx.pickables) mesh.visible = true;
    ctx.modelRoot.traverse((o) => {
      if (o.isGroup) o.visible = true;
    });
    ctx.events.emit('visibility-changed');
    ctx.invalidate();
  }

  // --- pointer handling ----------------------------------------------------
  let downInfo = null;
  ctx.canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    downInfo = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  ctx.canvas.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !downInfo) return;
    const moved = Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y);
    const elapsed = performance.now() - downInfo.t;
    downInfo = null;
    if (moved > CLICK_MAX_MOVE_PX || elapsed > CLICK_MAX_MS) return;
    if (ctx.suppressViewportClicks && ctx.suppressViewportClicks()) return;
    const hit = pick(e.clientX, e.clientY);
    if (ctx.measure && ctx.measure.active()) {
      if (hit) ctx.measure.addPoint(hit, e.clientX, e.clientY);
      return;
    }
    select(hit ? hit.object : null);
  });
  ctx.canvas.addEventListener('dblclick', (e) => {
    const hit = pick(e.clientX, e.clientY);
    if (hit) {
      ctx.views.animateTarget(hit.point.clone());
      ctx.toast('Orbit pivot set', 'info', 1600);
    }
  });

  ctx.events.on('model-changed', () => {
    if (!selected) return;
    let root = selected;
    while (root.parent) root = root.parent;
    if (root !== ctx.scene) {
      // Detached (tab switch) or disposed (tab close): remove the highlight
      // from the materials so a re-activated document comes back untinted.
      clearHighlight();
      selected = null;
      ctx.events.emit('selection-changed', null);
    }
  });

  ctx.selection = {
    get: () => selected,
    select,
    pick,
    hideSelected,
    isolateSelected,
    showAll,
    partMeshesIn,
  };
}
