/**
 * Model tree: assembly hierarchy with tri-state visibility checkboxes
 * (cascading to children), lazy child rendering for large assemblies,
 * click-to-select, and double-click-to-zoom.
 */
import { $, el } from './dom.js';

const TWIST_SVG = '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M5.5 3.5L10.5 8l-5 4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PART_SVG = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2l-5.4-3.1V4.9L8 1.8z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M2.8 5L8 8m0 0l5.2-3M8 8v6" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>';
const GROUP_SVG = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="1.8" y="4.5" width="12.4" height="8.7" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M1.8 6.5V4.2A1.4 1.4 0 013.2 2.8h3l1.4 1.7h6.2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';

export function createTree(ctx) {
  const host = $('#tree');
  const rowByObject = new Map();

  function isTreeNode(o) {
    return o.userData.isPart || o.isGroup;
  }

  function childrenOf(object) {
    return object.children.filter(isTreeNode);
  }

  function buildRow(object, depth) {
    const kids = childrenOf(object);
    const row = el('div', { class: 'tree-row', role: 'treeitem' });
    row.style.paddingLeft = `${8 + depth * 14}px`;

    const twist = el('button', { class: 'tree-twist', 'aria-label': 'Expand' });
    twist.innerHTML = kids.length ? TWIST_SVG : '';
    if (!kids.length) twist.classList.add('leaf');
    row.append(twist);

    const check = el('input', { type: 'checkbox', class: 'tree-check', 'aria-label': 'Visibility' });
    check.checked = true;
    row.append(check);

    const icon = el('span', { class: 'tree-icon' });
    icon.innerHTML = object.userData.isPart ? PART_SVG : GROUP_SVG;
    row.append(icon);

    row.append(el('span', { class: 'tree-name', text: object.name || 'Unnamed' }));

    const wrap = el('div', { class: 'tree-node' });
    wrap.append(row);
    const childHost = el('div', { class: 'tree-children' });
    wrap.append(childHost);

    const record = { object, row, check, childHost, kids, built: false, expanded: false, twist };
    rowByObject.set(object, record);

    const setExpanded = (on) => {
      if (!kids.length) return;
      record.expanded = on;
      twist.classList.toggle('open', on);
      if (on && !record.built) {
        record.built = true;
        for (const child of kids) childHost.append(buildRow(child, depth + 1));
      }
      childHost.style.display = on ? '' : 'none';
    };
    record.setExpanded = setExpanded;
    childHost.style.display = 'none';

    twist.addEventListener('click', (e) => {
      e.stopPropagation();
      setExpanded(!record.expanded);
    });
    check.addEventListener('click', (e) => e.stopPropagation());
    check.addEventListener('change', () => {
      setSubtreeVisible(object, check.checked);
      ctx.events.emit('visibility-changed');
      ctx.invalidate();
    });
    row.addEventListener('click', () => ctx.selection.select(object));
    row.addEventListener('dblclick', () => ctx.views.fit(object, true));

    return wrap;
  }

  function setSubtreeVisible(object, visible) {
    object.traverse((o) => {
      if (o.userData.isPart) o.visible = visible;
      if (o.isGroup) o.visible = true; // groups stay on; parts carry the state
    });
  }

  function rebuild() {
    host.innerHTML = '';
    rowByObject.clear();
    const models = ctx.modelRoot.children;
    if (!models.length) {
      host.append(el('div', { class: 'tree-empty', text: 'No model loaded' }));
      return;
    }
    for (const model of models) {
      const rootRow = buildRow(model, 0);
      host.append(rootRow);
      const record = rowByObject.get(model);
      record.setExpanded(true);
      // Auto-expand single-child chains so shallow assemblies open readable.
      let node = model;
      let depthGuard = 0;
      while (depthGuard++ < 4) {
        const kids = childrenOf(node);
        if (kids.length !== 1) break;
        node = kids[0];
        const rec = rowByObject.get(node);
        if (rec) rec.setExpanded(true);
      }
    }
    syncVisibility();
    syncSelection(ctx.selection.get());
  }

  /** Updates checkbox checked/indeterminate states from the scene graph. */
  function syncVisibility() {
    for (const [object, record] of rowByObject) {
      let visibleParts = 0;
      let totalParts = 0;
      object.traverse((o) => {
        if (o.userData.isPart) {
          totalParts++;
          if (o.visible) visibleParts++;
        }
      });
      if (totalParts === 0) {
        record.check.checked = object.visible;
        record.check.indeterminate = false;
      } else {
        record.check.checked = visibleParts === totalParts;
        record.check.indeterminate = visibleParts > 0 && visibleParts < totalParts;
      }
    }
  }

  function syncSelection(selected) {
    for (const [object, record] of rowByObject) {
      record.row.classList.toggle('selected', object === selected);
    }
    if (selected) {
      // Reveal the selected row by expanding its ancestors.
      const chain = [];
      for (let o = selected.parent; o && o !== ctx.modelRoot; o = o.parent) chain.unshift(o);
      for (const node of chain) {
        const rec = rowByObject.get(node);
        if (rec && !rec.expanded) rec.setExpanded(true);
      }
      const rec = rowByObject.get(selected);
      if (rec) rec.row.scrollIntoView({ block: 'nearest' });
    }
  }

  ctx.events.on('model-changed', rebuild);
  ctx.events.on('visibility-changed', syncVisibility);
  ctx.events.on('selection-changed', syncSelection);

  rebuild();
}
