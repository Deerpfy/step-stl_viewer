/**
 * Display modes: shaded, shaded + edges, wireframe, x-ray. Edge overlays are
 * built lazily per part (EdgesGeometry is expensive on million-triangle
 * models) and cached on the mesh.
 */
import * as THREE from 'three';

const EDGE_THRESHOLD_DEG = 28;
const XRAY_OPACITY = 0.32;

export function createDisplayModes(ctx) {
  let mode = 'shaded';

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x15181d,
    transparent: true,
    opacity: 0.7,
  });
  const selectionEdgeMaterial = new THREE.LineBasicMaterial({
    color: 0x4d8dff,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });

  /**
   * Returns (building on demand) the cached edge overlay for a part mesh.
   * @param {THREE.Mesh} mesh
   * @param {'display'|'selection'} kind
   */
  function getEdges(mesh, kind) {
    let record = mesh.userData.edgeRecord;
    if (!record) {
      const geometry = new THREE.EdgesGeometry(mesh.geometry, EDGE_THRESHOLD_DEG);
      const display = new THREE.LineSegments(geometry, edgeMaterial);
      display.visible = false;
      display.raycast = () => {};
      const selection = new THREE.LineSegments(geometry, selectionEdgeMaterial);
      selection.visible = false;
      selection.renderOrder = 900;
      selection.raycast = () => {};
      mesh.add(display);
      mesh.add(selection);
      record = { display, selection };
      mesh.userData.edgeRecord = record;
    }
    return record[kind];
  }

  async function ensureAllEdges() {
    const missing = ctx.pickables.filter((m) => !m.userData.edgeRecord);
    const totalTris = missing.reduce((sum, m) => sum + (m.userData.triangles || 0), 0);
    const heavy = totalTris > 350000;
    if (heavy) {
      ctx.overlay.show('Computing edges', 'First switch to edge display on a large model');
      await ctx.overlay.waitForPaint();
    }
    try {
      for (const mesh of missing) getEdges(mesh, 'display');
    } finally {
      if (heavy) ctx.overlay.hide();
    }
  }

  /** Re-applies the current mode to every part material (idempotent). */
  function apply() {
    ctx.modelRoot.traverse((o) => {
      if (!o.userData.isPart) return;
      const mat = o.material;
      const baseOpacity = o.userData.baseOpacity ?? 1;
      mat.wireframe = mode === 'wireframe';
      const wantTransparent = mode === 'xray' || baseOpacity < 1;
      if (mat.transparent !== wantTransparent) {
        mat.transparent = wantTransparent;
        mat.needsUpdate = true;
      }
      mat.opacity = mode === 'xray' ? XRAY_OPACITY : baseOpacity;
      mat.depthWrite = mode !== 'xray';
      if (o.userData.edgeRecord) {
        o.userData.edgeRecord.display.visible = mode === 'edges';
      }
    });
    ctx.invalidate();
  }

  /**
   * @param {'shaded'|'edges'|'wireframe'|'xray'} next
   */
  async function setMode(next) {
    if (!['shaded', 'edges', 'wireframe', 'xray'].includes(next)) return;
    mode = next;
    if (next === 'edges') await ensureAllEdges();
    apply();
    ctx.events.emit('display-mode-changed', mode);
  }

  ctx.events.on('model-changed', () => {
    if (mode === 'edges') setMode('edges'); // build edges for newly loaded parts
    else apply();
  });
  ctx.events.on('theme-changed', (theme) => {
    edgeMaterial.color.set(theme === 'light' ? 0x2a2f38 : 0x0d0f13);
    ctx.invalidate();
  });

  ctx.displayModes = {
    setMode,
    getMode: () => mode,
    getEdges,
    reapply: apply,
  };
}
