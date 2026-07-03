/**
 * End-to-end STEP smoke test in Node: initializes occt-import-js through the
 * exact same code path the browser bundle uses (factory + wasmBinary, no
 * fetch), parses real STEP files shipped with the package, and runs the
 * result through the same occt -> three.js converter as the app.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { buildStepModel, computeStats } from '../src/loaders/model-builder.js';

const require = createRequire(import.meta.url);
const factory = require('occt-import-js');
const wasm = readFileSync(new URL('../node_modules/occt-import-js/dist/occt-import-js.wasm', import.meta.url));

const occt = await factory({ wasmBinary: new Uint8Array(wasm) });
assert.equal(typeof occt.ReadStepFile, 'function', 'ReadStepFile exposed');
console.log('PASS occt initialized via wasmBinary (no .wasm fetch, same path as the browser bundle)');

function parse(relPath) {
  const abs = new URL(`../node_modules/occt-import-js/test/testfiles/${relPath}`, import.meta.url);
  const content = readFileSync(abs);
  return occt.ReadStepFile(new Uint8Array(content), null);
}

// Simple single-solid file.
const cube = parse('simple-basic-cube/cube.stp');
assert.equal(cube.success, true, 'cube parse success');
assert.ok(cube.meshes.length >= 1, 'cube has meshes');
const cubeModel = buildStepModel(cube, 'cube');
const cubeStats = computeStats(cubeModel);
assert.ok(cubeStats.triangles >= 12, 'cube tessellation has triangles');
console.log(`PASS cube.stp: ${cube.meshes.length} mesh(es), ${cubeStats.parts} part(s), ${cubeStats.triangles} triangles`);

// Assembly with hierarchy, names, and colors (CAx-IF as1 example).
const asmPath = new URL('../node_modules/occt-import-js/test/testfiles/cax-if/as1-oc-214.stp', import.meta.url);
if (existsSync(asmPath)) {
  const asm = parse('cax-if/as1-oc-214.stp');
  assert.equal(asm.success, true, 'assembly parse success');
  const model = buildStepModel(asm, 'as1-oc-214');
  const stats = computeStats(model);
  assert.ok(stats.parts > 1, 'assembly has multiple parts');
  let namedNodes = 0;
  let coloredParts = 0;
  let depth = 0;
  (function walk(node, d) {
    depth = Math.max(depth, d);
    if (node.name && node.name.length > 0) namedNodes++;
    if (node.userData && node.userData.isPart) {
      const mat = node.material;
      if (mat.vertexColors || (mat.color && (mat.color.r !== mat.color.g || mat.color.g !== mat.color.b))) coloredParts++;
    }
    for (const child of node.children || []) walk(child, d + 1);
  })(model, 0);
  assert.ok(depth >= 2, 'hierarchy preserved (nested groups)');
  assert.ok(namedNodes > 3, 'part/assembly names preserved');
  assert.ok(coloredParts > 0, 'per-part colors preserved');
  console.log(`PASS as1-oc-214.stp assembly: ${stats.parts} parts, ${stats.triangles} triangles, tree depth ${depth}, ${namedNodes} named nodes, ${coloredParts} colored parts`);
} else {
  console.log('SKIP assembly fixture (not shipped in this package version)');
}

console.log('ALL OCCT SMOKE TESTS PASSED');
