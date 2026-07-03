/**
 * Converts parsed STL data and occt-import-js STEP results into three.js
 * object trees. Browser-API free so the STEP conversion can also be smoke
 * tested under Node.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const DEFAULT_PART_COLOR = 0x94a3b8;

/**
 * Creates the standard part material used across the viewer.
 * @param {{color?: THREE.Color, vertexColors?: boolean}} [opts]
 * @returns {THREE.MeshStandardMaterial}
 */
export function createPartMaterial(opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: opts.vertexColors ? 0xffffff : (opts.color ?? DEFAULT_PART_COLOR),
    vertexColors: !!opts.vertexColors,
    metalness: 0.12,
    roughness: 0.58,
    envMapIntensity: 0.85,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  return mat;
}

function markAsPart(mesh, name, triangles) {
  mesh.name = name;
  mesh.userData.isPart = true;
  mesh.userData.triangles = triangles;
  mesh.userData.baseColor = mesh.material.color.clone();
  mesh.userData.baseOpacity = 1;
  return mesh;
}

function triangleCount(geometry) {
  return geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
}

/**
 * Builds a model group from worker-parsed STL arrays.
 * @param {{positions: Float32Array, normals: Float32Array, triangles: number}} parsed
 * @param {string} name display name (file name without extension)
 * @returns {THREE.Group}
 */
export function buildStlModel(parsed, name) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(parsed.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(parsed.normals, 3));
  const mesh = new THREE.Mesh(geometry, createPartMaterial());
  markAsPart(mesh, name, parsed.triangles);
  const group = new THREE.Group();
  group.name = name;
  group.userData.isModel = true;
  group.add(mesh);
  return group;
}

const colorCache = new Map();
function toLinearColor(rgb) {
  const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
  let c = colorCache.get(key);
  if (!c) {
    c = new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
    colorCache.set(key, c);
  }
  return c;
}

/**
 * Builds a BufferGeometry from one occt mesh entry. Per-face colors from
 * brep_faces are baked as vertex colors so a part always renders with a
 * single material (one draw call per part).
 */
function occtMeshToGeometry(occtMesh) {
  const positions = new Float32Array(occtMesh.attributes.position.array);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (occtMesh.attributes.normal) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(occtMesh.attributes.normal.array), 3));
  }
  const index = occtMesh.index && occtMesh.index.array;
  if (index) {
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1));
  }
  if (!occtMesh.attributes.normal) geometry.computeVertexNormals();

  const baseRgb = occtMesh.color || null;
  const faces = occtMesh.brep_faces || [];
  const hasFaceColors = faces.some((f) => f.color && (!baseRgb ||
    f.color[0] !== baseRgb[0] || f.color[1] !== baseRgb[1] || f.color[2] !== baseRgb[2]));

  if (hasFaceColors && index) {
    const vertexCount = geometry.attributes.position.count;
    const colors = new Float32Array(vertexCount * 3);
    const base = baseRgb ? toLinearColor(baseRgb) : new THREE.Color(DEFAULT_PART_COLOR);
    for (let i = 0; i < vertexCount; i++) {
      colors[i * 3] = base.r;
      colors[i * 3 + 1] = base.g;
      colors[i * 3 + 2] = base.b;
    }
    const idx = geometry.index.array;
    for (const face of faces) {
      if (!face.color) continue;
      const c = toLinearColor(face.color);
      for (let t = face.first; t <= face.last; t++) {
        for (let v = 0; v < 3; v++) {
          const vi = idx[t * 3 + v];
          colors[vi * 3] = c.r;
          colors[vi * 3 + 1] = c.g;
          colors[vi * 3 + 2] = c.b;
        }
      }
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  return { geometry, baseRgb, hasColors: hasFaceColors && !!index };
}

function buildPartMesh(built, name) {
  const material = built.hasColors
    ? createPartMaterial({ vertexColors: true })
    : createPartMaterial({ color: built.baseRgb ? toLinearColor(built.baseRgb).clone() : undefined });
  const mesh = new THREE.Mesh(built.geometry, material);
  return markAsPart(mesh, name, triangleCount(built.geometry));
}

/** Adds a uniform vertex-color attribute so mixed geometries can merge. */
function ensureColorAttribute(built) {
  if (built.geometry.attributes.color) return;
  const count = built.geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const c = built.baseRgb ? toLinearColor(built.baseRgb) : new THREE.Color(DEFAULT_PART_COLOR);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  built.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Converts an occt-import-js result into a THREE.Group that preserves the
 * assembly hierarchy, node names, and per-part / per-face colors.
 * Multiple meshes referenced by one node are merged into a single mesh
 * (per part) unless the geometry is instanced by other nodes as well.
 * @param {object} result occt ReadStepFile result
 * @param {string} name display name for the root group
 * @returns {THREE.Group}
 */
export function buildStepModel(result, name) {
  if (!result || !result.success) throw new Error('The STEP file could not be parsed');
  if (!result.meshes || result.meshes.length === 0) throw new Error('The STEP file contains no geometry');

  const usage = new Array(result.meshes.length).fill(0);
  (function countUsage(node) {
    for (const i of node.meshes || []) usage[i]++;
    for (const child of node.children || []) countUsage(child);
  })(result.root);

  const builtCache = new Map();
  const getBuilt = (i) => {
    let b = builtCache.get(i);
    if (!b) {
      b = occtMeshToGeometry(result.meshes[i]);
      builtCache.set(i, b);
    }
    return b;
  };

  let unnamedPart = 0;
  let unnamedGroup = 0;

  const convertNode = (node, isRoot) => {
    const meshIndices = node.meshes || [];
    const children = node.children || [];
    const nodeName = node.name || null;

    const partMeshes = [];
    const mergeable = meshIndices.filter((i) => usage[i] === 1);
    const shared = meshIndices.filter((i) => usage[i] > 1);

    if (mergeable.length > 1) {
      const builts = mergeable.map(getBuilt);
      const firstRgb = builts[0].baseRgb;
      const uniformBase = builts.every((b) => (!b.baseRgb && !firstRgb) || (b.baseRgb && firstRgb &&
        b.baseRgb[0] === firstRgb[0] && b.baseRgb[1] === firstRgb[1] && b.baseRgb[2] === firstRgb[2]));
      const anyColored = builts.some((b) => b.hasColors) || !uniformBase;
      if (anyColored) builts.forEach(ensureColorAttribute);
      const merged = mergeGeometries(builts.map((b) => b.geometry), false);
      if (merged) {
        const partName = nodeName || result.meshes[mergeable[0]].name || `Part ${++unnamedPart}`;
        partMeshes.push(buildPartMesh(
          { geometry: merged, baseRgb: builts[0].baseRgb, hasColors: anyColored || builts.some((b) => b.geometry.attributes.color) },
          partName
        ));
        builts.forEach((b) => b.geometry.dispose());
      } else {
        for (const i of mergeable) {
          partMeshes.push(buildPartMesh(getBuilt(i), result.meshes[i].name || nodeName || `Part ${++unnamedPart}`));
        }
      }
    } else {
      for (const i of mergeable) {
        partMeshes.push(buildPartMesh(getBuilt(i), result.meshes[i].name || nodeName || `Part ${++unnamedPart}`));
      }
    }
    for (const i of shared) {
      // Instanced geometry: share the BufferGeometry, clone the material so
      // selection highlighting stays per-instance.
      const built = getBuilt(i);
      partMeshes.push(buildPartMesh(built, result.meshes[i].name || nodeName || `Part ${++unnamedPart}`));
    }

    // A node with exactly one mesh and no children collapses to the mesh
    // itself, keeping the tree free of single-child wrapper groups.
    if (!isRoot && children.length === 0 && partMeshes.length === 1) {
      if (nodeName) partMeshes[0].name = nodeName;
      return partMeshes[0];
    }

    const group = new THREE.Group();
    group.name = nodeName || (isRoot ? name : `Assembly ${++unnamedGroup}`);
    for (const mesh of partMeshes) group.add(mesh);
    for (const child of children) group.add(convertNode(child, false));
    return group;
  };

  let root = convertNode(result.root, true);
  if (root.isMesh) {
    const wrap = new THREE.Group();
    wrap.name = name;
    wrap.add(root);
    root = wrap;
  }
  root.name = name;
  root.userData.isModel = true;
  return root;
}

/**
 * Aggregates statistics for a model subtree.
 * @param {THREE.Object3D} object
 * @returns {{parts: number, triangles: number, box: THREE.Box3}}
 */
export function computeStats(object) {
  let parts = 0;
  let triangles = 0;
  object.traverse((o) => {
    if (o.userData.isPart) {
      parts++;
      triangles += o.userData.triangles || 0;
    }
  });
  const box = new THREE.Box3().setFromObject(object);
  return { parts, triangles, box };
}

/**
 * Releases GPU resources for an object tree (geometries, materials, and any
 * cached edge overlays) so replacing a model does not leak.
 * @param {THREE.Object3D} object
 */
export function disposeObject(object) {
  object.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
}
