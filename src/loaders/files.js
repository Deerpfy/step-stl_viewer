/**
 * File intake: window-wide drag & drop plus the Open button, content-based
 * routing to the STL or STEP pipeline, and replace-vs-add (Shift) handling.
 */
import { detectFormat } from './detect.js';
import { $ } from '../ui/dom.js';

const MAX_FILE_BYTES = 512 * 1024 * 1024;

export function createFileIntake(ctx) {
  const input = $('#file-input');
  let dialogAdditive = false;

  /**
   * Loads a list of files. Each file opens as its own document tab;
   * with `additive` (Shift) files are added into the current tab instead.
   * @param {FileList | File[]} fileList
   * @param {boolean} additive
   */
  async function loadFiles(fileList, additive) {
    const files = [...fileList];
    if (!files.length) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const t0 = performance.now();
      try {
        if (file.size > MAX_FILE_BYTES) {
          throw new Error(`File is too large (${Math.round(file.size / 1024 / 1024)} MB, limit 512 MB)`);
        }
        const buffer = await file.arrayBuffer();
        const format = detectFormat(file.name, buffer);
        if (format === 'unknown') {
          throw new Error('Unsupported format (only STEP/STP and STL are supported)');
        }
        const loader = format === 'step' ? ctx.stepLoader : ctx.stlLoader;
        const { group, meta } = await loader.load(file, buffer);
        meta.loadMs = Math.round(performance.now() - t0);
        ctx.addModel(group, meta, additive);
        ctx.toast(`Loaded ${file.name} in ${(meta.loadMs / 1000).toFixed(meta.loadMs < 10000 ? 2 : 1)} s`, 'success');
      } catch (err) {
        ctx.overlay.hide();
        ctx.toast(`Could not load ${file.name}: ${err.message || err}`, 'error');
      }
    }
  }

  function openDialog(additive) {
    dialogAdditive = !!additive;
    input.value = '';
    input.click();
  }

  input.addEventListener('change', () => {
    if (input.files && input.files.length) loadFiles(input.files, dialogAdditive);
  });

  // --- window-wide drag & drop ------------------------------------------
  const dragOverlay = $('#drag-overlay');
  let dragDepth = 0;

  function hasFiles(e) {
    return e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  }

  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    dragOverlay.classList.add('visible');
  });
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dragOverlay.classList.remove('visible');
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    dragOverlay.classList.remove('visible');
    loadFiles(e.dataTransfer.files, e.shiftKey);
  });

  ctx.loadFiles = loadFiles;
  ctx.openFileDialog = openDialog;
}
