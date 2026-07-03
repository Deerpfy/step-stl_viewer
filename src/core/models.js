/**
 * Model lifecycle: routes loaded models into documents (tabs), maintains
 * aggregate statistics and the pickable-mesh list for the active document,
 * and captures original transforms for the reset tool.
 */
import { computeStats } from '../loaders/model-builder.js';

export function createModelManager(ctx) {
  function captureOriginalTransforms(root) {
    root.traverse((o) => {
      o.userData.homePosition = o.position.clone();
      o.userData.homeQuaternion = o.quaternion.clone();
      o.userData.homeScale = o.scale.clone();
      o.userData.basePosition = o.position.clone();
    });
  }

  /** Recomputes stats/bbox/pickables from the currently attached models. */
  function refreshAggregates() {
    const stats = computeStats(ctx.modelRoot);
    ctx.modelBox = stats.box.isEmpty() ? null : stats.box;
    ctx.modelStats = stats;
    ctx.pickables = [];
    ctx.modelRoot.traverse((o) => {
      if (o.userData.isPart) ctx.pickables.push(o);
    });
  }

  /**
   * Adds a loaded model: a new document (tab) by default, or into the
   * active document when `additive` (Shift-load) is set.
   * @param {THREE.Group} group
   * @param {object} meta loader metadata (fileName, fileSize, format, ...)
   * @param {boolean} additive
   */
  function addModel(group, meta, additive) {
    ctx.ensureEnvironment();
    const stats = computeStats(group);
    meta.parts = stats.parts;
    meta.triangles = meta.triangles ?? stats.triangles;
    meta.box = stats.box;
    group.userData.meta = meta;
    captureOriginalTransforms(group);
    if (additive && ctx.documents.getActive()) {
      ctx.documents.addToActive(group, meta);
    } else {
      ctx.documents.create(group, meta);
    }
  }

  ctx.pickables = [];
  ctx.modelBox = null;
  ctx.addModel = addModel;
  ctx.refreshAggregates = refreshAggregates;
}
