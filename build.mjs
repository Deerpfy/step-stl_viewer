/**
 * Build script for the offline STEP/STL viewer.
 *
 * Produces two classic IIFE bundles in libs/ (no ES modules, so everything
 * works when index.html is opened directly via the file:// protocol):
 *
 *   libs/app.bundle.js   three.js + all application code. The STL worker
 *                        source is built first and embedded as a string so
 *                        the app can spawn it through a Blob URL (plain
 *                        file-URL workers are blocked under file://).
 *
 *   libs/occt.bundle.js  occt-import-js with its .wasm base64-embedded and
 *                        passed to the engine via wasmBinary (fetch() cannot
 *                        read file:// URLs). Exposes a single global:
 *                        window.loadOcct() -> Promise<occt instance>.
 *
 * Run: node build.mjs
 */
import { build } from 'esbuild';
import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const libsDir = path.join(root, 'libs');
mkdirSync(libsDir, { recursive: true });

const BROWSER_TARGETS = ['chrome96', 'firefox95', 'edge96', 'safari15'];

const common = {
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: BROWSER_TARGETS,
  legalComments: 'eof',
  logLevel: 'warning',
};

/** Serves a generated module from memory instead of a temp file on disk. */
function virtualModule(name, contents) {
  const filter = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  return {
    name: `virtual-${name}`,
    setup(b) {
      b.onResolve({ filter }, (args) => ({ path: args.path, namespace: 'virtual' }));
      b.onLoad({ filter, namespace: 'virtual' }, () => ({ contents, loader: 'js' }));
    },
  };
}

/** Replaces guarded Node-only requires (fs/path/crypto) inside the
 *  emscripten glue with empty stubs so no bare require() survives. */
const nodeBuiltinStubs = {
  name: 'node-builtin-stubs',
  setup(b) {
    b.onResolve({ filter: /^(fs|path|crypto|module|url|vm|os|util|child_process|worker_threads)$/ }, (args) => ({
      path: args.path,
      namespace: 'node-stub',
    }));
    b.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({
      contents: 'module.exports = {};',
      loader: 'js',
    }));
  },
};

function reportSize(label, file) {
  const bytes = statSync(file).size;
  const mb = (bytes / (1024 * 1024)).toFixed(2);
  console.log(`${label}  ${bytes.toLocaleString('en-US')} bytes (${mb} MiB)`);
}

// ---------------------------------------------------------------------------
// 1) STL parser worker -> bundled to text, embedded into the app bundle.
// ---------------------------------------------------------------------------
const workerResult = await build({
  ...common,
  entryPoints: [path.join(root, 'src', 'worker', 'stl-worker-entry.js')],
  write: false,
  legalComments: 'none',
});
const workerCode = workerResult.outputFiles[0].text;
console.log(`worker code embedded: ${workerCode.length.toLocaleString('en-US')} chars`);

// ---------------------------------------------------------------------------
// 2) Application bundle.
// ---------------------------------------------------------------------------
await build({
  ...common,
  entryPoints: [path.join(root, 'src', 'main.js')],
  outfile: path.join(libsDir, 'app.bundle.js'),
  plugins: [virtualModule('virtual:stl-worker-code', `export default ${JSON.stringify(workerCode)};`)],
});
reportSize('libs/app.bundle.js ', path.join(libsDir, 'app.bundle.js'));

// ---------------------------------------------------------------------------
// 3) occt-import-js bundle with base64-embedded WASM.
// ---------------------------------------------------------------------------
const wasmPath = path.join(root, 'node_modules', 'occt-import-js', 'dist', 'occt-import-js.wasm');
const wasmBase64 = readFileSync(wasmPath).toString('base64');
console.log(`wasm embedded: ${wasmBase64.length.toLocaleString('en-US')} base64 chars`);

const occtEntry = `
import occtFactory from 'occt-import-js';
import wasmBase64 from 'virtual:occt-wasm-b64';

function decodeBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const globalScope = typeof window !== 'undefined' ? window : globalThis;
let occtPromise = null;

/** Lazily initializes the OpenCascade engine. Idempotent. */
globalScope.loadOcct = function loadOcct() {
  if (!occtPromise) {
    occtPromise = occtFactory({ wasmBinary: decodeBase64(wasmBase64) });
  }
  return occtPromise;
};
`;

await build({
  ...common,
  stdin: { contents: occtEntry, resolveDir: root, sourcefile: 'occt-entry.js', loader: 'js' },
  outfile: path.join(libsDir, 'occt.bundle.js'),
  plugins: [
    nodeBuiltinStubs,
    virtualModule('virtual:occt-wasm-b64', `export default ${JSON.stringify(wasmBase64)};`),
  ],
});
reportSize('libs/occt.bundle.js', path.join(libsDir, 'occt.bundle.js'));

console.log('build complete');
