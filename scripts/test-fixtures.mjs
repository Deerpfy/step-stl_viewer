/**
 * Fixture tests for the STL parser and the format sniffer. Generates a unit
 * cube programmatically as ASCII STL, binary STL, and a binary STL whose
 * header starts with "solid" (the classic detection trap), then runs all
 * three through the exact parser module the Blob worker uses.
 */
import assert from 'node:assert/strict';
import { parseSTL, isBinarySTL } from '../src/loaders/stl-parser.js';
import { detectFormat } from '../src/loaders/detect.js';

const CUBE_TRIS = [
  // [normal, v1, v2, v3] for a unit cube
  [[0, 0, -1], [0, 0, 0], [1, 1, 0], [1, 0, 0]],
  [[0, 0, -1], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
  [[0, 0, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]],
  [[0, 0, 1], [0, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[0, -1, 0], [0, 0, 0], [1, 0, 0], [1, 0, 1]],
  [[0, -1, 0], [0, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[1, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[1, 0, 0], [1, 0, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 1, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1]],
  [[0, 1, 0], [1, 1, 0], [0, 1, 1], [1, 1, 1]],
  [[-1, 0, 0], [0, 1, 0], [0, 0, 0], [0, 0, 1]],
  [[-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 1, 1]],
];

function makeAsciiCube() {
  let out = 'solid cube\n';
  for (const [n, a, b, c] of CUBE_TRIS) {
    out += `  facet normal ${n.join(' ')}\n    outer loop\n`;
    for (const v of [a, b, c]) out += `      vertex ${v.join(' ')}\n`;
    out += '    endloop\n  endfacet\n';
  }
  out += 'endsolid cube\n';
  return new TextEncoder().encode(out).buffer;
}

function makeBinaryCube(headerText) {
  const buffer = new ArrayBuffer(84 + CUBE_TRIS.length * 50);
  const view = new DataView(buffer);
  for (let i = 0; i < Math.min(headerText.length, 80); i++) view.setUint8(i, headerText.charCodeAt(i));
  view.setUint32(80, CUBE_TRIS.length, true);
  let o = 84;
  for (const [n, a, b, c] of CUBE_TRIS) {
    for (const vec of [n, a, b, c]) {
      view.setFloat32(o, vec[0], true);
      view.setFloat32(o + 4, vec[1], true);
      view.setFloat32(o + 8, vec[2], true);
      o += 12;
    }
    view.setUint16(o, 0, true);
    o += 2;
  }
  return buffer;
}

function checkCube(label, buffer) {
  const res = parseSTL(buffer);
  assert.equal(res.triangles, 12, `${label}: triangle count`);
  assert.equal(res.positions.length, 108, `${label}: positions length`);
  assert.equal(res.normals.length, 108, `${label}: normals length`);
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < res.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = res.positions[i + k];
      assert.ok(Number.isFinite(v), `${label}: finite positions`);
      min[k] = Math.min(min[k], v);
      max[k] = Math.max(max[k], v);
    }
  }
  assert.deepEqual(min, [0, 0, 0], `${label}: bbox min`);
  assert.deepEqual(max, [1, 1, 1], `${label}: bbox max`);
  for (let i = 0; i < res.normals.length; i += 3) {
    const len = Math.hypot(res.normals[i], res.normals[i + 1], res.normals[i + 2]);
    assert.ok(Math.abs(len - 1) < 1e-5, `${label}: unit normals`);
  }
  console.log(`PASS ${label}: 12 triangles, unit bbox, unit normals`);
}

const ascii = makeAsciiCube();
const binary = makeBinaryCube('binary cube fixture');
const trap = makeBinaryCube('solid trap - binary file that starts with the ascii keyword');

checkCube('ASCII STL cube', ascii);
checkCube('binary STL cube', binary);
checkCube('binary STL with "solid" header', trap);

assert.equal(isBinarySTL(new DataView(binary), binary.byteLength), true, 'binary sniff');
assert.equal(isBinarySTL(new DataView(trap), trap.byteLength), true, '"solid" trap sniffed as binary');
assert.equal(isBinarySTL(new DataView(ascii), ascii.byteLength), false, 'ascii not sniffed as binary');
console.log('PASS structural binary/ascii sniffing (incl. "solid"-header binary)');

assert.equal(detectFormat('cube.stl', ascii), 'stl');
assert.equal(detectFormat('anything.bin', binary), 'stl');
assert.equal(detectFormat('trap.stl', trap), 'stl');
const stepHeader = new TextEncoder().encode('ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((\'\'),\'2;1\');\n').buffer;
assert.equal(detectFormat('model.step', stepHeader), 'step');
assert.equal(detectFormat('model.weird', stepHeader), 'step', 'STEP detected by content, not extension');
const junk = new TextEncoder().encode('this is not a supported format at all').buffer;
assert.equal(detectFormat('junk.txt', junk), 'unknown');
console.log('PASS content-based format routing (STEP by signature, STL by structure, junk rejected)');

console.log('ALL FIXTURE TESTS PASSED');
