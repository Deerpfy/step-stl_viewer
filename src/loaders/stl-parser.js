/**
 * Standalone STL parser (binary and ASCII), dependency-free so the same code
 * runs inside the Blob-URL worker, in the main thread, and in Node tests.
 */

/**
 * Detects whether a buffer holds a binary STL. Extension and the leading
 * "solid" keyword are unreliable (binary files may start with "solid"), so
 * the check is structural: 80-byte header + uint32 triangle count, where
 * 84 + count * 50 must match the file size (small trailing padding allowed).
 * @param {DataView} view
 * @param {number} size total byte length
 * @returns {boolean}
 */
export function isBinarySTL(view, size) {
  if (size < 84) return false;
  const count = view.getUint32(80, true);
  if (count === 0) return false;
  const expected = 84 + count * 50;
  return expected === size || (size > expected && size - expected <= 512);
}

/**
 * Parses an STL buffer (auto-detects binary vs ASCII).
 * @param {ArrayBuffer} buffer
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {{positions: Float32Array, normals: Float32Array, triangles: number}}
 */
export function parseSTL(buffer, onProgress) {
  const size = buffer.byteLength;
  if (size === 0) throw new Error('The file is empty');
  const view = new DataView(buffer);
  if (isBinarySTL(view, size)) return parseBinary(view, onProgress);
  return parseASCII(buffer, onProgress);
}

function normalize(nx, ny, nz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  let len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len < 1e-12 || !isFinite(len)) {
    // Degenerate or missing normal in the file: derive it from the vertices.
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    nx = uy * vz - uz * vy;
    ny = uz * vx - ux * vz;
    nz = ux * vy - uy * vx;
    len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-12 || !isFinite(len)) return [0, 0, 1];
  }
  return [nx / len, ny / len, nz / len];
}

function parseBinary(view, onProgress) {
  const count = view.getUint32(80, true);
  const positions = new Float32Array(count * 9);
  const normals = new Float32Array(count * 9);
  let offset = 84;
  for (let i = 0; i < count; i++) {
    const nx = view.getFloat32(offset, true);
    const ny = view.getFloat32(offset + 4, true);
    const nz = view.getFloat32(offset + 8, true);
    const p = i * 9;
    for (let v = 0; v < 3; v++) {
      const o = offset + 12 + v * 12;
      positions[p + v * 3] = view.getFloat32(o, true);
      positions[p + v * 3 + 1] = view.getFloat32(o + 4, true);
      positions[p + v * 3 + 2] = view.getFloat32(o + 8, true);
    }
    const n = normalize(
      nx, ny, nz,
      positions[p], positions[p + 1], positions[p + 2],
      positions[p + 3], positions[p + 4], positions[p + 5],
      positions[p + 6], positions[p + 7], positions[p + 8]
    );
    for (let v = 0; v < 3; v++) {
      normals[p + v * 3] = n[0];
      normals[p + v * 3 + 1] = n[1];
      normals[p + v * 3 + 2] = n[2];
    }
    offset += 50;
    if (onProgress && (i & 0xffff) === 0) onProgress(i, count);
  }
  if (onProgress) onProgress(count, count);
  return { positions, normals, triangles: count };
}

function parseASCII(buffer, onProgress) {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  if (!/^\s*solid/i.test(text)) {
    throw new Error('Not a valid STL file (no binary header and no "solid" keyword)');
  }
  const positionChunks = [];
  const normalChunks = [];
  const CHUNK_TRIS = 8192;
  let posChunk = new Float32Array(CHUNK_TRIS * 9);
  let nrmChunk = new Float32Array(CHUNK_TRIS * 9);
  let chunkFill = 0;
  let triangles = 0;

  const flushChunk = () => {
    positionChunks.push(posChunk.subarray(0, chunkFill * 9));
    normalChunks.push(nrmChunk.subarray(0, chunkFill * 9));
    posChunk = new Float32Array(CHUNK_TRIS * 9);
    nrmChunk = new Float32Array(CHUNK_TRIS * 9);
    chunkFill = 0;
  };

  const facetRe = /facet\s+normal\s+(\S+)\s+(\S+)\s+(\S+)\s+outer\s+loop\s+vertex\s+(\S+)\s+(\S+)\s+(\S+)\s+vertex\s+(\S+)\s+(\S+)\s+(\S+)\s+vertex\s+(\S+)\s+(\S+)\s+(\S+)\s+endloop\s+endfacet/g;
  let m;
  while ((m = facetRe.exec(text)) !== null) {
    const vals = new Array(12);
    for (let i = 0; i < 12; i++) {
      const v = parseFloat(m[i + 1]);
      if (!isFinite(v)) throw new Error(`Invalid number in ASCII STL near character ${m.index}`);
      vals[i] = v;
    }
    const p = chunkFill * 9;
    for (let i = 0; i < 9; i++) posChunk[p + i] = vals[3 + i];
    const n = normalize(
      vals[0], vals[1], vals[2],
      vals[3], vals[4], vals[5],
      vals[6], vals[7], vals[8],
      vals[9], vals[10], vals[11]
    );
    for (let v = 0; v < 3; v++) {
      nrmChunk[p + v * 3] = n[0];
      nrmChunk[p + v * 3 + 1] = n[1];
      nrmChunk[p + v * 3 + 2] = n[2];
    }
    chunkFill++;
    triangles++;
    if (chunkFill === CHUNK_TRIS) {
      flushChunk();
      if (onProgress) onProgress(facetRe.lastIndex, text.length);
    }
  }
  if (chunkFill > 0) flushChunk();
  if (triangles === 0) throw new Error('The STL file contains no triangles');

  const positions = new Float32Array(triangles * 9);
  const normals = new Float32Array(triangles * 9);
  let cursor = 0;
  for (let i = 0; i < positionChunks.length; i++) {
    positions.set(positionChunks[i], cursor);
    normals.set(normalChunks[i], cursor);
    cursor += positionChunks[i].length;
  }
  if (onProgress) onProgress(text.length, text.length);
  return { positions, normals, triangles };
}
