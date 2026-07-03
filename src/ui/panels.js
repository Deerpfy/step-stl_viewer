/** Collapsible floating side panels with edge reopen tabs. */
import { $ } from './dom.js';

export function createPanels(ctx) {
  const left = $('#panel-left');
  const right = $('#panel-right');
  const leftTab = $('#panel-left-tab');
  const rightTab = $('#panel-right-tab');

  function sync() {
    leftTab.classList.toggle('visible', left.classList.contains('collapsed'));
    rightTab.classList.toggle('visible', right.classList.contains('collapsed'));
  }

  function toggle(panel) {
    panel.classList.toggle('collapsed');
    sync();
    // The orientation triad tracks the inspector's edge; keep rendering
    // through the slide transition so it glides along instead of jumping.
    ctx.requestFrames(280);
  }
  right.addEventListener('transitionend', () => ctx.invalidate());

  $('#panel-left-collapse').addEventListener('click', () => toggle(left));
  $('#panel-right-collapse').addEventListener('click', () => toggle(right));
  leftTab.addEventListener('click', () => toggle(left));
  rightTab.addEventListener('click', () => toggle(right));

  // Panels start collapsed on narrow viewports so the model gets the space.
  if (window.innerWidth < 900) {
    left.classList.add('collapsed');
    right.classList.add('collapsed');
  }
  sync();

  return {
    toggleLeft: () => toggle(left),
    toggleRight: () => toggle(right),
    openRight: () => {
      right.classList.remove('collapsed');
      sync();
    },
  };
}
