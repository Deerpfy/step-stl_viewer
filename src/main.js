/**
 * Application entry point: builds the shared context, wires modules, defines
 * the action registry used by both the toolbar and keyboard shortcuts.
 */
import { createEmitter } from './core/events.js';
import { createSceneManager } from './core/scene.js';
import { createViews } from './core/views.js';
import { createTriad } from './core/triad.js';
import { createModelManager } from './core/models.js';
import { createDocuments } from './core/documents.js';
import { createStlLoader } from './loaders/stl-loader.js';
import { createStepLoader } from './loaders/step-loader.js';
import { createFileIntake } from './loaders/files.js';
import { createSelection } from './tools/selection.js';
import { createDisplayModes } from './tools/displaymodes.js';
import { createTransformTool } from './tools/transform.js';
import { createMeasureTool } from './tools/measure.js';
import { createSectionTool } from './tools/section.js';
import { createExplodeTool } from './tools/explode.js';
import { createScreenshot } from './tools/screenshot.js';
import { $ } from './ui/dom.js';
import { createToasts } from './ui/toasts.js';
import { createOverlay } from './ui/overlay.js';
import { createTheme } from './ui/theme.js';
import { createStatusbar } from './ui/statusbar.js';
import { createPanels } from './ui/panels.js';
import { createTabs } from './ui/tabs.js';
import { createTree } from './ui/tree.js';
import { createInfo } from './ui/info.js';
import { createHelp } from './ui/help.js';
import { createToolbar } from './ui/toolbar.js';
import { createShortcuts } from './ui/shortcuts.js';

const ctx = {};
ctx.events = createEmitter();
ctx.toast = createToasts();
ctx.overlay = createOverlay();
ctx.statusbar = createStatusbar();

const theme = createTheme(ctx);
createSceneManager(ctx);
createViews(ctx);
createTriad(ctx);
createModelManager(ctx);
ctx.stlLoader = createStlLoader(ctx);
ctx.stepLoader = createStepLoader(ctx);
createFileIntake(ctx);
createDisplayModes(ctx);
createSelection(ctx);
createTransformTool(ctx);
createMeasureTool(ctx);
createSectionTool(ctx);
createExplodeTool(ctx);
createScreenshot(ctx);
createDocuments(ctx);

const panels = createPanels(ctx);
const help = createHelp();

const hasModel = () => ctx.modelRoot.children.length > 0;

const actions = {
  open: (additive) => ctx.openFileDialog(additive),
  fit: () => {
    if (!hasModel()) return;
    ctx.views.fit(ctx.selection.get() || ctx.modelRoot, true);
  },
  view: (name) => {
    if (!hasModel()) return;
    ctx.views.setView(name);
  },
  projection: () => ctx.views.toggleProjection(),
  displayMode: (mode) => {
    if (!hasModel()) return;
    ctx.displayModes.setMode(mode);
  },
  grid: () => {
    const next = !ctx.isGridVisible();
    ctx.setGridVisible(next);
    ctx.events.emit('grid-changed', next);
  },
  theme: () => theme.toggle(),
  measure: () => {
    if (!hasModel()) return;
    if (ctx.transformTool.isActive()) ctx.transformTool.setActive(false);
    ctx.measure.toggle();
    if (ctx.measure.active()) panels.openRight();
  },
  section: () => {
    if (!hasModel()) return;
    ctx.sectionTool.toggle();
    if (ctx.sectionTool.isActive()) panels.openRight();
  },
  explode: () => {
    if (!hasModel()) return;
    if (ctx.explode.partCount() < 2) {
      ctx.toast('Explode needs an assembly with at least two parts', 'info');
      return;
    }
    ctx.explode.toggle();
    panels.openRight();
  },
  transform: () => {
    if (!hasModel()) return;
    if (ctx.measure.active()) ctx.measure.setActive(false);
    ctx.transformTool.cycle();
    if (ctx.transformTool.isActive()) {
      panels.openRight();
      if (!ctx.selection.get()) ctx.toast('Select a part to transform', 'info', 2500);
    }
  },
  resetTransforms: () => {
    if (!hasModel()) return;
    ctx.transformTool.resetAll();
    ctx.toast('All transforms reset', 'success', 2200);
  },
  hide: () => ctx.selection.hideSelected(),
  isolate: () => ctx.selection.isolateSelected(),
  showAll: () => {
    if (!hasModel()) return;
    ctx.selection.showAll();
  },
  screenshot: () => {
    if (!hasModel()) return;
    ctx.screenshot.capturePNG();
  },
  exportSTL: () => {
    if (!hasModel()) return;
    ctx.screenshot.exportSTL();
  },
  leftPanel: () => panels.toggleLeft(),
  rightPanel: () => panels.toggleRight(),
  nextTab: () => ctx.documents.next(),
  prevTab: () => ctx.documents.prev(),
  help: () => help.toggle(),
  clearMeasurements: () => ctx.measure.clearAll(),
  escape: () => {
    if (help.isOpen()) {
      help.close();
      return;
    }
    ctx.closeViewsMenu();
    if (ctx.measure.active()) {
      ctx.measure.setActive(false);
      return;
    }
    if (ctx.transformTool.isActive()) {
      ctx.transformTool.setActive(false);
      return;
    }
    if (ctx.sectionTool.isActive()) {
      ctx.sectionTool.setActive(false);
      return;
    }
    ctx.selection.select(null);
  },
};

createToolbar(ctx, actions);
createShortcuts(ctx, actions);
createTabs(ctx);
createTree(ctx);
createInfo(ctx);

// Right-panel tool cards follow tool state ---------------------------------
const cardMeasure = $('#card-measure');
const cardSection = $('#card-section');
const cardTransform = $('#card-transform');
const cardExplode = $('#card-explode');

ctx.events.on('measure-tool-changed', (on) => cardMeasure.classList.toggle('hidden', !on));
ctx.events.on('section-tool-changed', ({ active, axis, flipped }) => {
  cardSection.classList.toggle('hidden', !active);
  for (const btn of document.querySelectorAll('[data-section-axis]')) {
    btn.classList.toggle('active', btn.dataset.sectionAxis === axis);
  }
  $('#section-flip').classList.toggle('active', flipped);
});
ctx.events.on('transform-tool-changed', ({ active, mode }) => {
  cardTransform.classList.toggle('hidden', !active);
  for (const btn of document.querySelectorAll('[data-transform-mode]')) {
    btn.classList.toggle('active', active && btn.dataset.transformMode === mode);
  }
  ctx.statusbar.setHint(active
    ? `Transform (${mode}): drag the gizmo · hold Ctrl to snap · T cycles mode`
    : '');
});
ctx.events.on('model-changed', () => {
  cardExplode.classList.toggle('hidden', !hasModel());
  $('#explode-slider').disabled = ctx.explode.partCount() < 2;
  $('#explode-note').classList.toggle('hidden', ctx.explode.partCount() >= 2);
});
for (const btn of document.querySelectorAll('[data-transform-mode]')) {
  btn.addEventListener('click', () => ctx.transformTool.setMode(btn.dataset.transformMode));
}
$('#transform-reset').addEventListener('click', () => actions.resetTransforms());
$('#measure-clear').addEventListener('click', () => ctx.measure.clearAll());

// Reflect state also when tools turn off via Escape.
ctx.events.on('measure-tool-changed', (on) => {
  if (!on) ctx.statusbar.setHint('');
});
ctx.events.on('section-tool-changed', ({ active }) => {
  ctx.statusbar.setHint(active ? 'Section: pick an axis and drag the slider · C toggles off' : '');
});

// Initial UI state ----------------------------------------------------------
ctx.statusbar.setFile('');
ctx.statusbar.setHint('');
ctx.statusbar.setCam('Perspective');
ctx.events.emit('display-mode-changed', 'shaded');
ctx.events.emit('theme-changed', theme.current());

// Robustness: unexpected errors surface as toasts, never silently.
let lastErrorToast = 0;
function reportError(message) {
  const now = Date.now();
  if (now - lastErrorToast < 2000) return;
  lastErrorToast = now;
  ctx.toast(`Unexpected error: ${message}`, 'error');
}
window.addEventListener('error', (e) => reportError(e.message || 'unknown'));
window.addEventListener('unhandledrejection', (e) => {
  reportError((e.reason && (e.reason.message || String(e.reason))) || 'unknown');
});

ctx.invalidate();
