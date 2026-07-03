/**
 * Document tab strip: one tab per open file, click to switch, close button
 * or middle-click to close. Hidden while no document is open.
 */
import { $, el } from './dom.js';

const CLOSE_SVG = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

export function createTabs(ctx) {
  const host = $('#tabs');

  function render() {
    const docs = ctx.documents.list();
    const activeDoc = ctx.documents.getActive();
    document.body.classList.toggle('has-tabs', docs.length > 0);
    host.classList.toggle('hidden', docs.length === 0);
    host.innerHTML = '';
    let activeTab = null;
    for (const doc of docs) {
      const isActive = doc === activeDoc;
      const tab = el('div', {
        class: `tab${isActive ? ' active' : ''}`,
        role: 'tab',
        'aria-selected': isActive ? 'true' : 'false',
        title: doc.groups.length > 1 ? `${doc.name} (+${doc.groups.length - 1} more)` : doc.name,
      });
      const name = el('button', { class: 'tab-name', text: doc.name });
      name.addEventListener('click', () => ctx.documents.activate(doc.id));
      tab.append(name);
      const close = el('button', { class: 'tab-close', 'aria-label': `Close ${doc.name}` });
      close.innerHTML = CLOSE_SVG;
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        ctx.documents.close(doc.id);
      });
      tab.append(close);
      tab.addEventListener('auxclick', (e) => {
        if (e.button === 1) ctx.documents.close(doc.id);
      });
      host.append(tab);
      if (isActive) activeTab = tab;
    }
    if (activeTab) activeTab.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    ctx.invalidate(); // the orientation triad repositions around the strip
  }

  ctx.events.on('documents-changed', render);
  render();
}
