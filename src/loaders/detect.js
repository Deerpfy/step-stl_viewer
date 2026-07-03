/**
 * Content-based file format detection. Extension is only a fallback because
 * STEP files are routinely misnamed and binary STLs can start with "solid".
 */
import { isBinarySTL } from './stl-parser.js';

/**
 * @param {string} name file name (for the extension fallback)
 * @param {ArrayBuffer} buffer file content
 * @returns {'step' | 'stl' | 'unknown'}
 */
export function detectFormat(name, buffer) {
  if (!buffer || buffer.byteLength === 0) throw new Error('The file is empty');
  const head = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 4096));
  if (head.includes('ISO-10303-21')) return 'step';
  const view = new DataView(buffer);
  if (isBinarySTL(view, buffer.byteLength)) return 'stl';
  if (/^\s*solid\b/i.test(head) && /facet/i.test(head)) return 'stl';
  const ext = (name.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1];
  if (ext === 'step' || ext === 'stp') return 'step';
  if (ext === 'stl') return 'stl';
  return 'unknown';
}
