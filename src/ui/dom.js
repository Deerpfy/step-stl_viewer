/** Small DOM helpers and value formatters shared by the UI modules. */

/** @param {string} sel @returns {HTMLElement} */
export const $ = (sel) => document.querySelector(sel);

/** @param {string} sel @returns {HTMLElement[]} */
export const $$ = (sel) => [...document.querySelectorAll(sel)];

/**
 * Creates an element with attributes and children.
 * @param {string} tag
 * @param {Record<string, string> | null} [attrs]
 * @param {...(Node | string)} children
 */
export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    }
  }
  for (const child of children) {
    node.append(child);
  }
  return node;
}

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** @param {number} n */
export function formatCount(n) {
  return n.toLocaleString('en-US');
}

/** Millimeter value with adaptive precision. @param {number} v */
export function formatMM(v) {
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 1 : abs >= 10 ? 2 : 3;
  return `${v.toFixed(digits)} mm`;
}
