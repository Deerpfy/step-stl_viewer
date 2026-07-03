/**
 * STEP loading pipeline. The heavy occt bundle (~10 MB, WASM base64-embedded)
 * is NOT part of the app bundle: it is injected as a classic script tag the
 * first time a STEP file is opened, so STL-only sessions never pay for it.
 * Tessellation runs synchronously inside WASM on the main thread, so the
 * progress overlay is painted (event-loop yield) before the call starts.
 */
import { buildStepModel } from './model-builder.js';

export function createStepLoader(ctx) {
  let occtPromise = null;

  function injectOcctScript() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './libs/occt.bundle.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load the geometry engine (libs/occt.bundle.js missing?)'));
      document.head.appendChild(script);
    });
  }

  function ensureOcct() {
    if (!occtPromise) {
      occtPromise = (async () => {
        if (typeof window.loadOcct !== 'function') await injectOcctScript();
        return window.loadOcct();
      })();
      occtPromise.catch(() => {
        occtPromise = null; // allow a retry on the next attempt
      });
    }
    return occtPromise;
  }

  /**
   * Loads a STEP file into a model group (hierarchy, names, colors).
   * @param {File} file
   * @param {ArrayBuffer} buffer
   * @returns {Promise<{group: import('three').Group, meta: object}>}
   */
  async function load(file, buffer) {
    const engineReady = typeof window.loadOcct === 'function' && occtPromise;
    ctx.overlay.show(`Loading ${file.name}`, 'Large assemblies can take a while');
    ctx.overlay.setSteps(['Load geometry engine', 'Parse STEP file', 'Build scene']);
    ctx.overlay.setStepState(0, engineReady ? 'done' : 'active');
    await ctx.overlay.waitForPaint();
    try {
      const occt = await ensureOcct();
      ctx.overlay.setStepState(0, 'done');
      ctx.overlay.setStepState(1, 'active');
      await ctx.overlay.waitForPaint(); // paint before the synchronous WASM call
      const result = occt.ReadStepFile(new Uint8Array(buffer), null);
      ctx.overlay.setStepState(1, 'done');
      ctx.overlay.setStepState(2, 'active');
      await ctx.overlay.waitForPaint();
      const name = file.name.replace(/\.[^.]+$/, '');
      const group = buildStepModel(result, name);
      ctx.overlay.setStepState(2, 'done');
      return {
        group,
        meta: {
          fileName: file.name,
          fileSize: file.size,
          format: 'STEP',
        },
      };
    } finally {
      ctx.overlay.hide();
    }
  }

  return { load };
}
