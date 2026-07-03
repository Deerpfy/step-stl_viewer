/**
 * Toolbar wiring: buttons dispatch the shared actions, and application
 * events reflect state back into the controls (active tool, display mode,
 * projection, disabled-until-model-loaded).
 */
import { $, $$ } from './dom.js';

export function createToolbar(ctx, actions) {
  const bind = (id, fn) => $(id).addEventListener('click', fn);

  bind('#btn-open', (e) => actions.open(e.shiftKey));
  bind('#btn-fit', () => actions.fit());
  bind('#btn-projection', () => actions.projection());
  bind('#btn-grid', () => actions.grid());
  bind('#btn-measure', () => actions.measure());
  bind('#btn-section', () => actions.section());
  bind('#btn-explode', () => actions.explode());
  bind('#btn-transform', () => actions.transform());
  bind('#btn-screenshot', () => actions.screenshot());
  bind('#btn-export', () => actions.exportSTL());
  bind('#btn-theme', () => actions.theme());
  bind('#btn-help', () => actions.help());
  bind('#hero-open', (e) => actions.open(e.shiftKey));

  for (const btn of $$('[data-display-mode]')) {
    btn.addEventListener('click', () => actions.displayMode(btn.dataset.displayMode));
  }

  // Views popover -----------------------------------------------------------
  const viewsBtn = $('#btn-views');
  const viewsMenu = $('#views-menu');
  function closeViews() {
    viewsMenu.classList.remove('visible');
    viewsBtn.setAttribute('aria-expanded', 'false');
  }
  viewsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = viewsMenu.classList.toggle('visible');
    viewsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      const rect = viewsBtn.getBoundingClientRect();
      const menuWidth = Math.max(viewsMenu.offsetWidth, 200);
      viewsMenu.style.top = `${Math.round(rect.bottom + 10)}px`;
      viewsMenu.style.left = `${Math.round(Math.min(rect.left, window.innerWidth - menuWidth - 12))}px`;
    }
  });
  document.addEventListener('click', (e) => {
    if (!viewsMenu.contains(e.target) && e.target !== viewsBtn) closeViews();
  });
  for (const btn of $$('[data-view]')) {
    btn.addEventListener('click', () => {
      actions.view(btn.dataset.view);
      closeViews();
    });
  }
  ctx.closeViewsMenu = closeViews;

  // State reflection --------------------------------------------------------
  function setPressed(id, on) {
    const b = $(id);
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  ctx.events.on('display-mode-changed', (mode) => {
    for (const btn of $$('[data-display-mode]')) {
      const on = btn.dataset.displayMode === mode;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  });
  ctx.events.on('measure-tool-changed', (on) => setPressed('#btn-measure', on));
  ctx.events.on('section-tool-changed', ({ active }) => setPressed('#btn-section', active));
  ctx.events.on('transform-tool-changed', ({ active }) => setPressed('#btn-transform', active));
  ctx.events.on('explode-changed', (f) => setPressed('#btn-explode', f > 0));
  ctx.events.on('projection-changed', (mode) => {
    setPressed('#btn-projection', mode === 'orthographic');
    ctx.statusbar.setCam(mode === 'orthographic' ? 'Orthographic' : 'Perspective');
  });
  ctx.events.on('theme-changed', (theme) => setPressed('#btn-theme', theme === 'light'));

  const modelDependent = [
    '#btn-fit', '#btn-views', '#btn-measure', '#btn-section', '#btn-explode',
    '#btn-transform', '#btn-screenshot', '#btn-export',
    ...$$('[data-display-mode]').map((b) => `#${b.id}`),
  ];
  function refreshEnabled() {
    const hasModel = ctx.modelRoot.children.length > 0;
    document.body.classList.toggle('has-model', hasModel);
    for (const sel of modelDependent) {
      const b = $(sel);
      if (b) b.disabled = !hasModel;
    }
  }
  ctx.events.on('model-changed', refreshEnabled);
  refreshEnabled();

  // Grid button initial state (grid defaults to on).
  setPressed('#btn-grid', ctx.isGridVisible());
  ctx.events.on('grid-changed', (on) => setPressed('#btn-grid', on));
}
