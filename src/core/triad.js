/**
 * Corner orientation triad: a small always-on-top axis gizmo rendered into a
 * viewport corner, synced to the camera. Clicking an axis cap snaps the view.
 */
import * as THREE from 'three';

const SIZE = 92; // CSS pixels
const MARGIN = 12;
// Below the floating toolbar (top 10px + 52px + gap).
const TOP_OFFSET = 74;
const GAP = 10;

const AXES = [
  { dir: new THREE.Vector3(1, 0, 0), color: 0xe5484d, label: 'X', view: 'right', negView: 'left' },
  { dir: new THREE.Vector3(0, 1, 0), color: 0x46a758, label: 'Y', view: 'back', negView: 'front' },
  { dir: new THREE.Vector3(0, 0, 1), color: 0x3e7bfa, label: 'Z', view: 'top', negView: 'bottom' },
];

function makeLabelTexture(text, bg) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fillStyle = bg;
  g.fill();
  g.font = '700 34px system-ui, -apple-system, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  g.fillText(text, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createTriad(ctx) {
  const triadScene = new THREE.Scene();
  const triadCam = new THREE.OrthographicCamera(-1.9, 1.9, 1.9, -1.9, 0.1, 20);
  triadCam.up.set(0, 0, 1);

  const pickTargets = [];

  for (const axis of AXES) {
    const colorHex = `#${axis.color.toString(16).padStart(6, '0')}`;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 1.0, 10),
      new THREE.MeshBasicMaterial({ color: axis.color })
    );
    shaft.position.copy(axis.dir.clone().multiplyScalar(0.5));
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.dir);
    triadScene.add(shaft);

    const cap = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(axis.label, colorHex) }));
    cap.scale.setScalar(0.62);
    cap.position.copy(axis.dir.clone().multiplyScalar(1.28));
    triadScene.add(cap);

    const negCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 12),
      new THREE.MeshBasicMaterial({ color: axis.color, transparent: true, opacity: 0.45 })
    );
    negCap.position.copy(axis.dir.clone().multiplyScalar(-1.28));
    triadScene.add(negCap);

    const pickPos = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pickPos.position.copy(cap.position);
    pickPos.userData.view = axis.view;
    triadScene.add(pickPos);
    pickTargets.push(pickPos);

    const pickNeg = pickPos.clone();
    pickNeg.material = pickPos.material;
    pickNeg.position.copy(negCap.position);
    pickNeg.userData.view = axis.negView;
    triadScene.add(pickNeg);
    pickTargets.push(pickNeg);
  }

  const raycaster = new THREE.Raycaster();

  const rightPanel = document.getElementById('panel-right');
  const tabsBar = document.getElementById('tabs');

  /**
   * The gizmo viewport dodges the floating UI so it is never covered: it
   * drops below the tab strip when tabs are open and sits just left of the
   * inspector panel while that panel is expanded.
   */
  function viewportRect() {
    const w = ctx.canvas.clientWidth;
    let left = w - SIZE - MARGIN;
    let top = TOP_OFFSET;
    if (rightPanel && !rightPanel.classList.contains('collapsed')) {
      left = Math.min(left, rightPanel.getBoundingClientRect().left - SIZE - GAP);
    }
    if (tabsBar && !tabsBar.classList.contains('hidden')) {
      top = Math.max(top, tabsBar.getBoundingClientRect().bottom + GAP);
    }
    return { left: Math.max(left, 8), top, size: SIZE };
  }

  ctx.renderTriad = () => {
    const r = ctx.renderer;
    const rect = viewportRect();
    const h = ctx.canvas.clientHeight;
    const dir = ctx.camera.position.clone().sub(ctx.controls.target);
    if (dir.lengthSq() < 1e-12) dir.set(1, -1, 1);
    triadCam.position.copy(dir.normalize().multiplyScalar(6));
    triadCam.up.copy(ctx.camera.up);
    triadCam.lookAt(0, 0, 0);
    r.autoClear = false;
    r.clearDepth();
    r.setViewport(rect.left, h - rect.top - rect.size, rect.size, rect.size);
    r.render(triadScene, triadCam);
    r.setViewport(0, 0, ctx.canvas.clientWidth, h);
    r.autoClear = true;
  };

  function hitTest(clientX, clientY) {
    const bounds = ctx.canvas.getBoundingClientRect();
    const rect = viewportRect();
    const x = clientX - bounds.left - rect.left;
    const y = clientY - bounds.top - rect.top;
    if (x < 0 || y < 0 || x > rect.size || y > rect.size) return null;
    const ndc = new THREE.Vector2((x / rect.size) * 2 - 1, -((y / rect.size) * 2 - 1));
    raycaster.setFromCamera(ndc, triadCam);
    const hits = raycaster.intersectObjects(pickTargets, false);
    return hits.length ? hits[0].object.userData.view : null;
  }

  let downView = null;
  ctx.canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    downView = hitTest(e.clientX, e.clientY);
  });
  ctx.canvas.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !downView) return;
    const upView = hitTest(e.clientX, e.clientY);
    if (upView && upView === downView) ctx.views.setView(upView);
    downView = null;
  });
  ctx.canvas.addEventListener('pointermove', (e) => {
    if (e.buttons) return;
    ctx.canvas.style.cursor = hitTest(e.clientX, e.clientY) ? 'pointer' : '';
  });
}
