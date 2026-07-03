/**
 * Keyboard shortcut registry and dispatcher. The same table drives the help
 * overlay, so the two can never drift apart.
 */

/** @returns {{group: string, keys: string, label: string, action?: string}[]} */
export function shortcutTable() {
  return [
    { group: 'Files', keys: 'O', label: 'Open files in new tabs (hold Shift to add into the current tab)', action: 'open' },
    { group: 'Files', keys: 'P', label: 'Save screenshot as PNG', action: 'screenshot' },
    { group: 'Files', keys: ', / .', label: 'Previous / next tab' },
    { group: 'Files', keys: 'Middle-click', label: 'Close a tab (or use its close button)' },
    { group: 'Camera', keys: 'F', label: 'Fit view (selection first)', action: 'fit' },
    { group: 'Camera', keys: '1 / 2', label: 'Front / Back view' },
    { group: 'Camera', keys: '3 / 4', label: 'Left / Right view' },
    { group: 'Camera', keys: '5 / 6', label: 'Top / Bottom view' },
    { group: 'Camera', keys: '7', label: 'Isometric view' },
    { group: 'Camera', keys: 'V', label: 'Perspective / Orthographic', action: 'projection' },
    { group: 'Camera', keys: 'Double-click', label: 'Set orbit pivot on the surface' },
    { group: 'Display', keys: 'S', label: 'Shaded' },
    { group: 'Display', keys: 'E', label: 'Shaded with edges' },
    { group: 'Display', keys: 'W', label: 'Wireframe' },
    { group: 'Display', keys: 'X', label: 'X-ray' },
    { group: 'Display', keys: 'G', label: 'Toggle grid', action: 'grid' },
    { group: 'Display', keys: 'L', label: 'Toggle light / dark theme', action: 'theme' },
    { group: 'Tools', keys: 'M', label: 'Measure tool', action: 'measure' },
    { group: 'Tools', keys: 'C', label: 'Section planes', action: 'section' },
    { group: 'Tools', keys: 'D', label: 'Explode view', action: 'explode' },
    { group: 'Tools', keys: 'T', label: 'Transform tool (cycles move / rotate / scale / off)', action: 'transform' },
    { group: 'Tools', keys: 'Ctrl (hold)', label: 'Snap while transforming' },
    { group: 'Tools', keys: 'R', label: 'Reset all transforms', action: 'resetTransforms' },
    { group: 'Tools', keys: 'Delete', label: 'Clear measurements (measure tool active)' },
    { group: 'Selection', keys: 'Click', label: 'Select part (click empty space to deselect)' },
    { group: 'Selection', keys: 'H', label: 'Hide selected', action: 'hide' },
    { group: 'Selection', keys: 'I', label: 'Isolate selected', action: 'isolate' },
    { group: 'Selection', keys: 'U', label: 'Show all parts', action: 'showAll' },
    { group: 'Selection', keys: 'Esc', label: 'Deselect / cancel tool / close dialog' },
    { group: 'Interface', keys: '[ / ]', label: 'Toggle left / right panel' },
    { group: 'Interface', keys: '?', label: 'Keyboard shortcuts help' },
  ];
}

export function createShortcuts(ctx, actions) {
  window.addEventListener('keydown', (e) => {
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
      if (e.key === 'Escape') target.blur();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone

    const key = e.key.toLowerCase();
    let handled = true;
    switch (key) {
      case 'o': actions.open(e.shiftKey); break;
      case 'f': actions.fit(); break;
      case '1': actions.view('front'); break;
      case '2': actions.view('back'); break;
      case '3': actions.view('left'); break;
      case '4': actions.view('right'); break;
      case '5': actions.view('top'); break;
      case '6': actions.view('bottom'); break;
      case '7': actions.view('iso'); break;
      case 'v': actions.projection(); break;
      case 's': actions.displayMode('shaded'); break;
      case 'e': actions.displayMode('edges'); break;
      case 'w': actions.displayMode('wireframe'); break;
      case 'x': actions.displayMode('xray'); break;
      case 'g': actions.grid(); break;
      case 'l': actions.theme(); break;
      case 'm': actions.measure(); break;
      case 'c': actions.section(); break;
      case 'd': actions.explode(); break;
      case 't': actions.transform(); break;
      case 'r': actions.resetTransforms(); break;
      case 'h': actions.hide(); break;
      case 'i': actions.isolate(); break;
      case 'u': actions.showAll(); break;
      case 'p': actions.screenshot(); break;
      case '[': actions.leftPanel(); break;
      case ']': actions.rightPanel(); break;
      case ',': actions.prevTab(); break;
      case '.': actions.nextTab(); break;
      case '?': actions.help(); break;
      case 'delete':
      case 'backspace':
        if (ctx.measure.active()) actions.clearMeasurements();
        else handled = false;
        break;
      case 'escape': actions.escape(); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  });
}
