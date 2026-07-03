/**
 * STL loading pipeline: parsing runs in a Web Worker created from a Blob URL
 * (the worker source is embedded in the bundle at build time, since file://
 * pages can neither fetch scripts nor start file-URL workers). The
 * ArrayBuffer is transferred in, typed arrays are transferred back.
 */
import workerSource from 'virtual:stl-worker-code';
import { buildStlModel } from './model-builder.js';

const PROGRESS_OVERLAY_BYTES = 5 * 1024 * 1024;

export function createStlLoader(ctx) {
  let worker = null;
  let nextId = 1;
  const pending = new Map();

  function ensureWorker() {
    if (worker) return worker;
    const blob = new Blob([workerSource], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = (event) => {
      const msg = event.data;
      const job = pending.get(msg.id);
      if (!job) return;
      if (msg.type === 'progress') {
        job.onProgress(msg.done, msg.total);
      } else if (msg.type === 'done') {
        pending.delete(msg.id);
        job.resolve(msg);
      } else if (msg.type === 'error') {
        pending.delete(msg.id);
        job.reject(new Error(msg.message));
      }
    };
    worker.onerror = (event) => {
      for (const job of pending.values()) job.reject(new Error(event.message || 'STL worker failed'));
      pending.clear();
      worker.terminate();
      worker = null;
    };
    return worker;
  }

  function parseInWorker(buffer, onProgress) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject, onProgress });
      ensureWorker().postMessage({ id, buffer }, [buffer]);
    });
  }

  /**
   * Loads an STL file into a model group.
   * @param {File} file
   * @param {ArrayBuffer} buffer
   * @returns {Promise<{group: import('three').Group, meta: object}>}
   */
  async function load(file, buffer) {
    const big = buffer.byteLength > PROGRESS_OVERLAY_BYTES;
    if (big) {
      ctx.overlay.show(`Loading ${file.name}`, 'Parsing STL geometry');
      ctx.overlay.setProgress(0);
      await ctx.overlay.waitForPaint();
    }
    try {
      const parsed = await parseInWorker(buffer, (done, total) => {
        if (big && total > 0) ctx.overlay.setProgress(done / total);
      });
      const name = file.name.replace(/\.[^.]+$/, '');
      const group = buildStlModel(parsed, name);
      return {
        group,
        meta: {
          fileName: file.name,
          fileSize: file.size,
          format: 'STL',
          triangles: parsed.triangles,
        },
      };
    } finally {
      if (big) ctx.overlay.hide();
    }
  }

  return { load };
}
