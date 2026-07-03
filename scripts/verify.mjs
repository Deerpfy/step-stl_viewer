/**
 * Automated delivery gates. Exits non-zero if any check fails.
 *
 *  1. Bundles exist; app.bundle.js < 2 MB; occt.bundle.js > 10 MB and
 *     contains the embedded WASM plus the loadOcct global.
 *  2. index.html: zero http(s) URLs, no type="module", only relative
 *     ./libs/... script references, exactly one style tag.
 *  3. Bundles: any http(s) occurrence must be a comment or an inert string
 *     (DOM namespace constants / doc links inside warning strings); nothing
 *     may appear in a loadable position (src=, href=, fetch(, import(, ...).
 *  4. No importScripts( anywhere; no new Worker("...") string form - the
 *     only worker construction must go through a Blob URL.
 */
import { readFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failures = 0;

function check(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` -- ${detail}` : ''}`);
  if (!ok) failures++;
}

const appPath = path.join(root, 'libs', 'app.bundle.js');
const occtPath = path.join(root, 'libs', 'occt.bundle.js');
const htmlPath = path.join(root, 'index.html');

check(existsSync(appPath), 'libs/app.bundle.js exists');
check(existsSync(occtPath), 'libs/occt.bundle.js exists');
if (failures) process.exit(1);

const appSize = statSync(appPath).size;
const occtSize = statSync(occtPath).size;
check(appSize < 2 * 1024 * 1024, 'app bundle under 2 MB', `${appSize.toLocaleString('en-US')} bytes`);
check(occtSize > 10 * 1000 * 1000, 'occt bundle over 10 MB (contains base64 wasm)', `${occtSize.toLocaleString('en-US')} bytes`);

const app = readFileSync(appPath, 'utf8');
const occt = readFileSync(occtPath, 'utf8');
const html = readFileSync(htmlPath, 'utf8');

check(occt.includes('loadOcct'), 'occt bundle exposes loadOcct global');
// The embedded payload must be the real wasm: compare a base64 slice of the
// actual .wasm file (aligned to 3-byte groups so the base64 text matches).
const wasmFile = readFileSync(path.join(root, 'node_modules', 'occt-import-js', 'dist', 'occt-import-js.wasm'));
const wasmProbe = wasmFile.subarray(0, 3000).toString('base64');
check(occt.includes(wasmProbe), 'occt bundle embeds the actual wasm binary as base64');

// ---- index.html ------------------------------------------------------------
check(!/https?:\/\//.test(html), 'index.html has zero http(s) URLs');
check(!/type\s*=\s*["']module["']/.test(html), 'index.html has no type="module"');
const scriptSrcs = [...html.matchAll(/<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
check(scriptSrcs.length === 1 && scriptSrcs[0] === './libs/app.bundle.js',
  'index.html loads exactly one script: ./libs/app.bundle.js', JSON.stringify(scriptSrcs));
const externalRefs = [...html.matchAll(/\s(?:href|src)\s*=\s*["']([^"']+)["']/g)]
  .map((m) => m[1])
  .filter((u) => !u.startsWith('./') && !u.startsWith('#') && !u.startsWith('data:'));
check(externalRefs.length === 0, 'index.html references only relative ./ or data: URLs', JSON.stringify(externalRefs));
check((html.match(/<style/g) || []).length === 1, 'index.html has exactly one style tag');
check(html.includes('viewport-fit=cover'), 'viewport meta includes viewport-fit=cover');

// ---- URL scan in bundles -----------------------------------------------------
const INERT_HOSTS = ['www.w3.org', 'threejs.org', 'github.com', 'mrdoob.com', 'emscripten.org', 'opencascade.com', 'khronos.org'];
const LOADING_CONTEXT = /(fetch\s*\(|importScripts\s*\(|import\s*\(|new\s+URL\s*\(|src\s*=|href\s*=|\.open\s*\(\s*["'](GET|POST)["']\s*,)\s*["'`]?$/i;

function scanBundle(name, text) {
  const re = /https?:\/\/[^\s"'`\\)]+/g;
  let match;
  let inert = 0;
  const problems = [];
  while ((match = re.exec(text)) !== null) {
    const url = match[0];
    const before = text.slice(Math.max(0, match.index - 64), match.index);
    const lineStart = text.lastIndexOf('\n', match.index) + 1;
    const linePrefix = text.slice(lineStart, match.index);
    const isComment = /^\s*(\/\/|\/\*|\*)/.test(linePrefix) || /\/\*[^*]*$/.test(before) || linePrefix.includes('//');
    const isInertHost = INERT_HOSTS.some((h) => url.includes(h));
    const inLoadingContext = LOADING_CONTEXT.test(before);
    if (inLoadingContext) {
      problems.push({ url: url.slice(0, 90), context: before.slice(-48) });
    } else if (isComment || isInertHost) {
      inert++;
    } else {
      problems.push({ url: url.slice(0, 90), context: before.slice(-48) });
    }
  }
  check(problems.length === 0,
    `${name}: no loadable/unexpected URL (${inert} inert comment/namespace/doc-string occurrences)`,
    problems.length ? JSON.stringify(problems.slice(0, 5)) : '');
}
scanBundle('app.bundle.js', app);
scanBundle('occt.bundle.js', occt);

// ---- worker / module discipline ---------------------------------------------
check(!app.includes('importScripts(') && !occt.includes('importScripts('),
  'no importScripts( call in any bundle');
const stringWorker = /new\s+Worker\s*\(\s*["'`]/;
check(!stringWorker.test(app) && !stringWorker.test(occt),
  'no new Worker("<url>") string form in any bundle');
const workerUses = [...app.matchAll(/new\s+Worker\s*\(/g)];
check(workerUses.length >= 1, 'app bundle constructs its worker', `${workerUses.length} construction site(s)`);
for (const m of workerUses) {
  const around = app.slice(Math.max(0, m.index - 220), m.index + 60);
  check(/createObjectURL/.test(around), 'worker constructed from a Blob URL', around.includes('createObjectURL') ? '' : around);
}
check(app.includes('wasmBinary') || occt.includes('wasmBinary'), 'occt initialized with wasmBinary (no wasm fetch path used)');

// ---- source hygiene -----------------------------------------------------------
const srcFiles = ['scene.js', 'models.js'].map((f) => readFileSync(path.join(root, 'src', 'core', f), 'utf8')).join('\n')
  + readFileSync(path.join(root, 'src', 'loaders', 'model-builder.js'), 'utf8');
check(/\.dispose\(\)/.test(srcFiles), 'dispose calls present for geometry/material cleanup');
const allSrc = [htmlPath, appPath].map((f) => readFileSync(f, 'utf8')).join('');
const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
check(!emojiRe.test(allSrc), 'no emoji in index.html or app bundle');

console.log(failures === 0 ? 'ALL VERIFICATION GATES PASSED' : `${failures} GATE(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
