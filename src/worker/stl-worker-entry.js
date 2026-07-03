/**
 * Entry point of the STL parsing Web Worker. This file is bundled at build
 * time, embedded as a string in app.bundle.js, and instantiated at runtime
 * through a Blob URL (required for workers under the file:// protocol).
 */
import { parseSTL } from '../loaders/stl-parser.js';

self.onmessage = (event) => {
  const { id, buffer } = event.data;
  try {
    let lastPost = 0;
    const result = parseSTL(buffer, (done, total) => {
      const now = Date.now();
      if (now - lastPost > 80 || done === total) {
        lastPost = now;
        self.postMessage({ id, type: 'progress', done, total });
      }
    });
    self.postMessage(
      {
        id,
        type: 'done',
        positions: result.positions,
        normals: result.normals,
        triangles: result.triangles,
      },
      [result.positions.buffer, result.normals.buffer]
    );
  } catch (err) {
    self.postMessage({ id, type: 'error', message: (err && err.message) || String(err) });
  }
};
