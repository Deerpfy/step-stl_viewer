/**
 * Point-to-point measurement tool. Clicks raycast the model; hits snap to
 * the nearest triangle vertex within a small screen radius. Each measurement
 * renders as an always-on-top line with endpoint markers and an HTML label
 * that tracks the 3D midpoint every frame.
 *
 * Measurements are stored per document: the tool operates on a "binding"
 * (list + THREE group + label layer) supplied by the document manager, so
 * every tab keeps its own measurements across switches.
 */
import * as THREE from 'three';
import { $, el, formatMM } from '../ui/dom.js';

const SNAP_RADIUS_PX = 14;
const ACCENT = 0x4d8dff;

export function createMeasureTool(ctx) {
  const listEl = $('#measure-list');
  let active = false;
  let pendingPoint = null;
  let pendingMarker = null;
  let binding = null; // {list: [], group: THREE.Group, layer: HTMLElement, counter: number}

  const markerGeometry = new THREE.SphereGeometry(1, 14, 14);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: ACCENT, depthTest: false, transparent: true });
  const lineMaterial = new THREE.LineBasicMaterial({ color: ACCENT, depthTest: false, transparent: true, opacity: 0.95 });

  function makeMarker(point) {
    const m = new THREE.Mesh(markerGeometry, markerMaterial);
    m.position.copy(point);
    m.renderOrder = 1000;
    m.raycast = () => {};
    binding.group.add(m);
    return m;
  }

  /** Snaps an intersection to the nearest face vertex within screen radius. */
  function snapPoint(hit, clientX, clientY) {
    if (!hit.face) return hit.point.clone();
    const rect = ctx.canvas.getBoundingClientRect();
    const mesh = hit.object;
    const pos = mesh.geometry.attributes.position;
    // face.a/b/c index the position attribute directly (three resolves the
    // index buffer during raycast), for indexed and non-indexed geometry.
    const tri = [hit.face.a, hit.face.b, hit.face.c];
    let best = null;
    let bestDist = SNAP_RADIUS_PX;
    for (const vi of tri) {
      const world = new THREE.Vector3().fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
      const p = world.clone().project(ctx.camera);
      const sx = ((p.x + 1) / 2) * rect.width + rect.left;
      const sy = ((1 - p.y) / 2) * rect.height + rect.top;
      const d = Math.hypot(sx - clientX, sy - clientY);
      if (d < bestDist) {
        bestDist = d;
        best = world;
      }
    }
    return best || hit.point.clone();
  }

  /** Called by the selection module while the tool is active. */
  function addPoint(hit, clientX, clientY) {
    if (!binding) return;
    const point = snapPoint(hit, clientX, clientY);
    if (!pendingPoint) {
      pendingPoint = point;
      pendingMarker = makeMarker(point);
      ctx.statusbar.setHint('Measure: click the second point (Esc cancels)');
      ctx.invalidate();
      return;
    }
    createMeasurement(pendingPoint, point);
    pendingPoint = null;
    pendingMarker = null;
    ctx.statusbar.setHint('Measure: click two points on the model');
  }

  function createMeasurement(a, b) {
    const id = ++binding.counter;
    const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geometry, lineMaterial);
    line.renderOrder = 999;
    line.raycast = () => {};
    binding.group.add(line);
    const markerA = pendingMarker || makeMarker(a);
    const markerB = makeMarker(b);
    const label = el('div', { class: 'measure-label' });
    binding.layer.append(label);
    const distance = a.distanceTo(b);
    label.textContent = formatMM(distance);
    const m = { id, a, b, line, markerA, markerB, label, distance };
    binding.list.push(m);
    renderList();
    ctx.invalidate();
  }

  function removeMeasurement(m) {
    binding.group.remove(m.line, m.markerA, m.markerB);
    m.line.geometry.dispose();
    m.label.remove();
    const i = binding.list.indexOf(m);
    if (i >= 0) binding.list.splice(i, 1);
    renderList();
    ctx.invalidate();
  }

  function clearAll() {
    if (binding) for (const m of [...binding.list]) removeMeasurement(m);
    cancelPending();
  }

  function cancelPending() {
    if (pendingMarker) {
      pendingMarker.removeFromParent();
      pendingMarker = null;
    }
    pendingPoint = null;
    ctx.invalidate();
  }

  function renderList() {
    listEl.innerHTML = '';
    if (!binding || !binding.list.length) {
      listEl.append(el('div', { class: 'tool-empty', text: 'No measurements yet' }));
      return;
    }
    for (const m of binding.list) {
      const d = m.b.clone().sub(m.a);
      const row = el('div', { class: 'measure-row' },
        el('div', { class: 'measure-row-main' },
          el('span', { class: 'measure-row-id', text: `#${m.id}` }),
          el('span', { class: 'measure-row-value', text: formatMM(m.distance) }),
        ),
        el('div', { class: 'measure-row-deltas', text: `dX ${formatMM(d.x)}   dY ${formatMM(d.y)}   dZ ${formatMM(d.z)}` }),
      );
      const remove = el('button', { class: 'measure-row-remove', 'aria-label': `Remove measurement ${m.id}` });
      remove.innerHTML = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
      remove.addEventListener('click', () => removeMeasurement(m));
      row.append(remove);
      listEl.append(row);
    }
  }

  /** Per-frame: keep marker sizes screen-constant and labels glued to 3D. */
  ctx.onRender(() => {
    if (!binding || (!binding.list.length && !pendingMarker)) return;
    const rect = { w: ctx.canvas.clientWidth, h: ctx.canvas.clientHeight };
    const scaleFor = (p) => ctx.views.worldPerPixelAt(p) * 4.2;
    if (pendingMarker) pendingMarker.scale.setScalar(scaleFor(pendingMarker.position));
    for (const m of binding.list) {
      m.markerA.scale.setScalar(scaleFor(m.a));
      m.markerB.scale.setScalar(scaleFor(m.b));
      const mid = m.a.clone().add(m.b).multiplyScalar(0.5).project(ctx.camera);
      const visible = mid.z > -1 && mid.z < 1;
      m.label.style.display = visible ? '' : 'none';
      if (visible) {
        m.label.style.transform = `translate(-50%, -130%) translate(${((mid.x + 1) / 2) * rect.w}px, ${((1 - mid.y) / 2) * rect.h}px)`;
      }
    }
  });

  function setActive(on) {
    if (on && !binding) return;
    active = on;
    if (!on) cancelPending();
    ctx.canvas.style.cursor = on ? 'crosshair' : '';
    ctx.statusbar.setHint(on ? 'Measure: click two points on the model' : '');
    ctx.events.emit('measure-tool-changed', active);
  }

  ctx.measure = {
    active: () => active,
    setActive,
    toggle: () => setActive(!active),
    addPoint,
    clearAll,
    cancelPending,
    count: () => (binding ? binding.list.length : 0),
    /** Creates the per-document measurement store. */
    createBinding(group, layer) {
      return { list: [], group, layer, counter: 0 };
    },
    /** Points the tool at a document's measurement store. */
    bind(next) {
      cancelPending();
      binding = next;
      renderList();
    },
    /** Detaches the tool (no document active). Deactivates it too. */
    unbind() {
      cancelPending();
      binding = null;
      if (active) setActive(false);
      renderList();
    },
    /** Releases a closed document's measurement resources. */
    disposeBinding(b) {
      if (!b) return;
      for (const m of b.list) {
        m.line.geometry.dispose();
        m.label.remove();
      }
      b.list.length = 0;
      if (binding === b) binding = null;
      renderList();
    },
  };

  renderList();
}
