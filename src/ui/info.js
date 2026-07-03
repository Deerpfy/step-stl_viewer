/** Right-panel info cards: loaded file metadata and current selection. */
import * as THREE from 'three';
import { $, el, formatBytes, formatCount, formatMM } from './dom.js';

export function createInfo(ctx) {
  const modelCard = $('#info-model');
  const modelBody = $('#info-model-body');
  const selCard = $('#info-selection');
  const selBody = $('#info-selection-body');

  function row(label, value) {
    return el('div', { class: 'info-row' },
      el('span', { class: 'info-label', text: label }),
      el('span', { class: 'info-value', text: value }),
    );
  }

  function boxDims(box) {
    if (!box || box.isEmpty()) return 'n/a';
    const s = box.getSize(new THREE.Vector3());
    return `${formatMM(s.x)} x ${formatMM(s.y)} x ${formatMM(s.z)}`;
  }

  function refreshModel() {
    modelBody.innerHTML = '';
    const models = ctx.modelRoot.children;
    if (!models.length) {
      modelCard.classList.add('hidden');
      return;
    }
    modelCard.classList.remove('hidden');
    if (models.length === 1) {
      const meta = models[0].userData.meta || {};
      modelBody.append(
        row('File', meta.fileName || models[0].name),
        row('Format', meta.format || 'n/a'),
        row('Size', meta.fileSize != null ? formatBytes(meta.fileSize) : 'n/a'),
        row('Parts', formatCount(meta.parts ?? 0)),
        row('Triangles', formatCount(meta.triangles ?? 0)),
        row('Bounding box', boxDims(ctx.modelBox)),
        row('Load time', meta.loadMs != null ? `${formatCount(meta.loadMs)} ms` : 'n/a'),
      );
    } else {
      const stats = ctx.modelStats || { parts: 0, triangles: 0 };
      modelBody.append(
        row('Files', formatCount(models.length)),
        row('Parts', formatCount(stats.parts)),
        row('Triangles', formatCount(stats.triangles)),
        row('Bounding box', boxDims(ctx.modelBox)),
      );
    }
  }

  function refreshSelection(selected) {
    selBody.innerHTML = '';
    if (!selected) {
      selCard.classList.add('hidden');
      return;
    }
    selCard.classList.remove('hidden');
    let parts = 0;
    let triangles = 0;
    selected.traverse((o) => {
      if (o.userData.isPart) {
        parts++;
        triangles += o.userData.triangles || 0;
      }
    });
    const box = new THREE.Box3().setFromObject(selected);
    selBody.append(row('Name', selected.name || 'Unnamed'));
    if (parts > 1) selBody.append(row('Parts', formatCount(parts)));
    selBody.append(
      row('Triangles', formatCount(triangles)),
      row('Dimensions', boxDims(box)),
    );
  }

  function refreshStatus() {
    const models = ctx.modelRoot.children;
    if (!models.length) {
      ctx.statusbar.setFile('');
      ctx.statusbar.setStats('');
      return;
    }
    const stats = ctx.modelStats || { parts: 0, triangles: 0 };
    const names = models.map((m) => (m.userData.meta ? m.userData.meta.fileName : m.name));
    ctx.statusbar.setFile(names.length === 1 ? names[0] : `${names.length} files`);
    ctx.statusbar.setStats(`${formatCount(stats.parts)} parts · ${formatCount(stats.triangles)} triangles`);
  }

  ctx.events.on('model-changed', () => {
    refreshModel();
    refreshStatus();
  });
  ctx.events.on('selection-changed', refreshSelection);

  refreshModel();
  refreshSelection(null);
  refreshStatus();
}
