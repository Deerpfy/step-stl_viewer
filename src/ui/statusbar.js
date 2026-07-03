/** Bottom status bar: file info, contextual hint, camera mode. */
import { $ } from './dom.js';

export function createStatusbar() {
  const fileEl = $('#status-file');
  const statsEl = $('#status-stats');
  const hintEl = $('#status-hint');
  const camEl = $('#status-cam');

  const DEFAULT_HINT = 'Left-drag orbit · Right-drag pan · Wheel zoom · Double-click sets pivot';

  return {
    setFile(text) {
      fileEl.textContent = text || 'No model loaded';
    },
    setStats(text) {
      statsEl.textContent = text || '';
    },
    setHint(text) {
      hintEl.textContent = text || DEFAULT_HINT;
    },
    setCam(text) {
      camEl.textContent = text;
    },
    DEFAULT_HINT,
  };
}
