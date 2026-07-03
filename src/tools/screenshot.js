/**
 * Screenshot (PNG of the current view) and binary STL export of the visible
 * geometry. The WebGL canvas is captured immediately after a synchronous
 * render (no persistent preserveDrawingBuffer cost) and composited over the
 * theme background color.
 */
import * as THREE from 'three';

export function createScreenshot(ctx) {
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function modelBaseName() {
    const first = ctx.modelRoot.children[0];
    const meta = first && first.userData.meta;
    return meta ? meta.fileName.replace(/\.[^.]+$/, '') : 'viewport';
  }

  function capturePNG() {
    // Render synchronously and read the buffer in the same task, before the
    // browser swaps/clears it (preserveDrawingBuffer stays off).
    ctx.renderNow({ skipTriad: true });
    const gl = ctx.renderer.domElement;
    const out = document.createElement('canvas');
    out.width = gl.width;
    out.height = gl.height;
    const g = out.getContext('2d');
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--shot-bg').trim() || '#111318';
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(gl, 0, 0);
    ctx.invalidate(); // repaint with the triad
    out.toBlob((blob) => {
      if (!blob) {
        ctx.toast('Screenshot failed', 'error');
        return;
      }
      download(blob, `${modelBaseName()}.png`);
      ctx.toast('Screenshot saved as PNG', 'success');
    }, 'image/png');
  }

  /** Exports all visible part meshes as one binary STL (world space). */
  function exportSTL() {
    const meshes = ctx.pickables.filter((m) => {
      for (let o = m; o; o = o.parent) if (!o.visible) return false;
      return true;
    });
    if (!meshes.length) {
      ctx.toast('Nothing to export', 'warning');
      return;
    }
    let triangles = 0;
    for (const m of meshes) {
      triangles += Math.floor(m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3);
    }
    const buffer = new ArrayBuffer(84 + triangles * 50);
    const view = new DataView(buffer);
    const header = 'Exported by STEP/STL Viewer';
    for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i));
    view.setUint32(80, triangles, true);

    let offset = 84;
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      const pos = mesh.geometry.attributes.position;
      const idx = mesh.geometry.index;
      const triCount = Math.floor(idx ? idx.count / 3 : pos.count / 3);
      for (let t = 0; t < triCount; t++) {
        const ia = idx ? idx.getX(t * 3) : t * 3;
        const ib = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
        const ic = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        vA.fromBufferAttribute(pos, ia).applyMatrix4(mesh.matrixWorld);
        vB.fromBufferAttribute(pos, ib).applyMatrix4(mesh.matrixWorld);
        vC.fromBufferAttribute(pos, ic).applyMatrix4(mesh.matrixWorld);
        ab.subVectors(vB, vA);
        ac.subVectors(vC, vA);
        const n = ab.cross(ac).normalize();
        if (!isFinite(n.x) || !isFinite(n.y) || !isFinite(n.z)) n.set(0, 0, 0);
        view.setFloat32(offset, n.x, true);
        view.setFloat32(offset + 4, n.y, true);
        view.setFloat32(offset + 8, n.z, true);
        view.setFloat32(offset + 12, vA.x, true);
        view.setFloat32(offset + 16, vA.y, true);
        view.setFloat32(offset + 20, vA.z, true);
        view.setFloat32(offset + 24, vB.x, true);
        view.setFloat32(offset + 28, vB.y, true);
        view.setFloat32(offset + 32, vB.z, true);
        view.setFloat32(offset + 36, vC.x, true);
        view.setFloat32(offset + 40, vC.y, true);
        view.setFloat32(offset + 44, vC.z, true);
        view.setUint16(offset + 48, 0, true);
        offset += 50;
      }
    }
    download(new Blob([buffer], { type: 'model/stl' }), `${modelBaseName()}.stl`);
    ctx.toast(`Exported ${triangles.toLocaleString('en-US')} triangles as binary STL`, 'success');
  }

  ctx.screenshot = { capturePNG, exportSTL };
}
