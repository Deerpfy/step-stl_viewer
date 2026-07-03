/**
 * Transform tool: attaches TransformControls to the selected part with
 * translate / rotate / scale gizmos, Ctrl-held snapping, and a full reset
 * back to the placements captured at load time.
 */
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

const MODES = ['translate', 'rotate', 'scale'];

export function createTransformTool(ctx) {
  const tc = new TransformControls(ctx.camera, ctx.canvas);
  const helper = tc.getHelper ? tc.getHelper() : tc;
  helper.visible = false;
  ctx.scene.add(helper);

  let active = false;
  let dragging = false;

  tc.addEventListener('change', () => ctx.invalidate());
  tc.addEventListener('dragging-changed', (e) => {
    dragging = e.value;
    ctx.controls.enabled = !e.value;
    if (!e.value && tc.object) {
      // Keep the explode bookkeeping consistent: base position excludes the
      // current explode offset.
      const obj = tc.object;
      const explodeOffset = obj.userData.explodeOffset || new THREE.Vector3();
      obj.userData.basePosition = obj.position.clone().sub(explodeOffset);
      ctx.events.emit('transforms-changed');
    }
  });

  // Axis snapping while Ctrl is held.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Control') {
      tc.setTranslationSnap(1);
      tc.setRotationSnap(THREE.MathUtils.degToRad(15));
      tc.setScaleSnap(0.1);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Control') {
      tc.setTranslationSnap(null);
      tc.setRotationSnap(null);
      tc.setScaleSnap(null);
    }
  });

  function attachTo(object) {
    if (object && active) {
      tc.attach(object);
      helper.visible = true;
    } else {
      tc.detach();
      helper.visible = false;
    }
    ctx.invalidate();
  }

  /** Enables/disables the tool; with no selection it stays armed and grabs
   *  the next selected part. */
  function setActive(on) {
    active = on;
    attachTo(on ? ctx.selection.get() : null);
    ctx.events.emit('transform-tool-changed', { active, mode: tc.mode });
  }

  /** @param {'translate'|'rotate'|'scale'} mode */
  function setMode(mode) {
    if (!MODES.includes(mode)) return;
    tc.mode = mode;
    ctx.events.emit('transform-tool-changed', { active, mode });
    ctx.invalidate();
  }

  /** T cycles: off -> translate -> rotate -> scale -> off */
  function cycle() {
    if (!active) {
      setActive(true);
      setMode('translate');
      return;
    }
    const next = MODES.indexOf(tc.mode) + 1;
    if (next >= MODES.length) setActive(false);
    else setMode(MODES[next]);
  }

  /** Restores every node of every model to its as-loaded placement. */
  function resetAll() {
    ctx.modelRoot.traverse((o) => {
      if (o.userData.homePosition) {
        o.position.copy(o.userData.homePosition);
        o.quaternion.copy(o.userData.homeQuaternion);
        o.scale.copy(o.userData.homeScale);
        o.userData.basePosition = o.userData.homePosition.clone();
        delete o.userData.explodeOffset;
      }
    });
    ctx.events.emit('transforms-reset');
    ctx.events.emit('transforms-changed');
    ctx.invalidate();
  }

  ctx.events.on('selection-changed', (selected) => {
    attachTo(selected && selected.userData ? selected : null);
  });
  ctx.events.on('model-changed', () => {
    tc.detach();
    helper.visible = false;
  });
  ctx.events.on('projection-changed', () => {
    tc.camera = ctx.camera;
  });

  ctx.transformTool = {
    isActive: () => active,
    isDragging: () => dragging,
    setActive,
    setMode,
    cycle,
    resetAll,
    getMode: () => tc.mode,
  };

  // Viewport clicks that are actually gizmo drags must not change selection.
  ctx.suppressViewportClicks = () => dragging || (active && tc.axis != null);
}
