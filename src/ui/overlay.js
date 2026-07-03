/**
 * Modal progress overlay. The spinner animates via a composited transform so
 * it keeps spinning even while the synchronous WASM tessellation blocks the
 * main thread; callers must still yield (waitForPaint) before heavy work so
 * the overlay is on screen first.
 */
import { $, el } from './dom.js';

export function createOverlay() {
  const host = $('#overlay');
  const titleEl = $('#overlay-title');
  const stepsEl = $('#overlay-steps');
  const barWrap = $('#overlay-bar');
  const barFill = $('#overlay-bar-fill');
  const noteEl = $('#overlay-note');

  let steps = [];

  function show(title, note = '') {
    titleEl.textContent = title;
    noteEl.textContent = note;
    stepsEl.innerHTML = '';
    steps = [];
    setProgress(null);
    host.classList.add('visible');
    host.setAttribute('aria-hidden', 'false');
  }

  /** @param {string[]} labels */
  function setSteps(labels) {
    stepsEl.innerHTML = '';
    steps = labels.map((label) => {
      const row = el('div', { class: 'overlay-step' },
        el('span', { class: 'overlay-step-marker' }),
        el('span', { class: 'overlay-step-label', text: label }),
      );
      stepsEl.append(row);
      return row;
    });
  }

  /**
   * @param {number} index
   * @param {'pending'|'active'|'done'} state
   */
  function setStepState(index, state) {
    const row = steps[index];
    if (!row) return;
    row.classList.remove('active', 'done');
    if (state !== 'pending') row.classList.add(state);
  }

  /** @param {number|null} ratio 0..1, or null to hide the bar */
  function setProgress(ratio) {
    if (ratio == null) {
      barWrap.classList.add('hidden');
      return;
    }
    barWrap.classList.remove('hidden');
    barFill.style.width = `${Math.round(Math.min(Math.max(ratio, 0), 1) * 100)}%`;
  }

  function setNote(text) {
    noteEl.textContent = text;
  }

  function hide() {
    host.classList.remove('visible');
    host.setAttribute('aria-hidden', 'true');
  }

  /** Resolves after the overlay has actually been painted. */
  async function waitForPaint() {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 30));
  }

  return { show, setSteps, setStepState, setProgress, setNote, hide, waitForPaint };
}
