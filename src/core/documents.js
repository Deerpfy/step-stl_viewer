/**
 * Document manager: every opened file lives in its own tab-like document
 * with independent scene content, camera state, selection, explode factor,
 * and measurements. Switching documents swaps the model root content and
 * restores the target document's state; closing one releases its GPU and
 * DOM resources.
 */
import * as THREE from 'three';
import { disposeObject } from '../loaders/model-builder.js';
import { $, el } from '../ui/dom.js';

export function createDocuments(ctx) {
  const docs = [];
  let active = null;
  let nextId = 1;
  const labelsHost = $('#labels');

  function isAttachedToScene(obj) {
    let root = obj;
    while (root.parent) root = root.parent;
    return root === ctx.scene;
  }

  /** Persists the parts of the app state that belong to the active tab. */
  function snapshotActive() {
    if (!active) return;
    active.cameraState = ctx.views.getCameraState();
    active.selection = ctx.selection.get();
    active.explodeFactor = ctx.explode.getFactor();
  }

  function attach(doc) {
    for (const g of doc.groups) ctx.modelRoot.add(g);
    ctx.annotations.add(doc.annotations);
    doc.labelLayer.style.display = '';
    ctx.measure.bind(doc.measureBinding);
  }

  function detach(doc) {
    for (const g of doc.groups) ctx.modelRoot.remove(g);
    ctx.annotations.remove(doc.annotations);
    doc.labelLayer.style.display = 'none';
  }

  function refreshScene(meta, additive) {
    ctx.refreshAggregates();
    ctx.rebuildGrid(ctx.modelBox);
    ctx.events.emit('model-changed', { additive, meta });
  }

  /** Restores camera/selection/explode saved in the document, if any. */
  function restoreState(doc) {
    if (doc.cameraState) ctx.views.applyCameraState(doc.cameraState);
    else ctx.views.fit(ctx.modelRoot, true);
    if (doc.explodeFactor > 0) ctx.explode.setFactor(doc.explodeFactor);
    if (doc.selection && isAttachedToScene(doc.selection)) ctx.selection.select(doc.selection);
  }

  /**
   * Creates a new document around a freshly loaded model and activates it.
   * @param {THREE.Group} group
   * @param {object} meta loader metadata
   */
  function create(group, meta) {
    snapshotActive();
    if (active) detach(active);
    const labelLayer = el('div', { class: 'label-doc-layer' });
    labelsHost.append(labelLayer);
    const annotations = new THREE.Group();
    annotations.name = 'DocumentAnnotations';
    const doc = {
      id: nextId++,
      name: meta.fileName || group.name,
      groups: [group],
      meta,
      annotations,
      labelLayer,
      measureBinding: ctx.measure.createBinding(annotations, labelLayer),
      cameraState: null,
      selection: null,
      explodeFactor: 0,
    };
    docs.push(doc);
    active = doc;
    attach(doc);
    refreshScene(meta, false);
    ctx.views.fit(ctx.modelRoot, true);
    ctx.events.emit('documents-changed');
    ctx.invalidate();
    return doc;
  }

  /** Adds an additional model into the active document (Shift-load). */
  function addToActive(group, meta) {
    if (!active) return create(group, meta);
    active.groups.push(group);
    ctx.modelRoot.add(group);
    refreshScene(meta, true);
    ctx.views.fit(ctx.modelRoot, true);
    ctx.events.emit('documents-changed');
    ctx.invalidate();
    return active;
  }

  /**
   * Switches to another document, saving the current one's view state.
   * @param {number} id
   */
  function activate(id, { skipSnapshot = false } = {}) {
    const doc = docs.find((d) => d.id === id);
    if (!doc || doc === active) return;
    if (!skipSnapshot) snapshotActive();
    if (active) detach(active);
    active = doc;
    attach(doc);
    refreshScene(doc.meta, false);
    restoreState(doc);
    ctx.events.emit('documents-changed');
    ctx.invalidate();
  }

  /** Closes a document and releases its resources. */
  function close(id) {
    const index = docs.findIndex((d) => d.id === id);
    if (index < 0) return;
    const doc = docs[index];
    const wasActive = doc === active;
    if (wasActive) {
      detach(doc);
      active = null;
    }
    docs.splice(index, 1);
    ctx.measure.disposeBinding(doc.measureBinding);
    doc.labelLayer.remove();
    for (const g of doc.groups) disposeObject(g);
    disposeObject(doc.annotations);
    ctx.renderer.renderLists.dispose();
    if (wasActive) {
      const neighbor = docs[index] || docs[index - 1];
      if (neighbor) {
        activate(neighbor.id, { skipSnapshot: true });
      } else {
        refreshScene(null, false);
        ctx.measure.unbind();
        ctx.invalidate();
      }
    }
    ctx.events.emit('documents-changed');
  }

  function step(delta) {
    if (docs.length < 2 || !active) return;
    const index = docs.indexOf(active);
    const next = docs[(index + delta + docs.length) % docs.length];
    activate(next.id);
  }

  ctx.documents = {
    list: () => docs,
    getActive: () => active,
    create,
    addToActive,
    activate,
    close,
    next: () => step(1),
    prev: () => step(-1),
  };
}
