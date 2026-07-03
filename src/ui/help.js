/** Help overlay listing every keyboard shortcut, generated from the same
 *  table the dispatcher uses. */
import { $, el } from './dom.js';
import { shortcutTable } from './shortcuts.js';

export function createHelp() {
  const host = $('#help');
  const body = $('#help-body');

  const groups = new Map();
  for (const item of shortcutTable()) {
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group).push(item);
  }
  for (const [group, items] of groups) {
    const section = el('div', { class: 'help-group' }, el('h3', { text: group }));
    for (const item of items) {
      section.append(el('div', { class: 'help-row' },
        el('kbd', { text: item.keys }),
        el('span', { text: item.label }),
      ));
    }
    body.append(section);
  }

  function setOpen(on) {
    host.classList.toggle('visible', on);
    host.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  $('#help-close').addEventListener('click', () => setOpen(false));
  host.addEventListener('click', (e) => {
    if (e.target === host) setOpen(false);
  });

  return {
    isOpen: () => host.classList.contains('visible'),
    toggle: () => setOpen(!host.classList.contains('visible')),
    close: () => setOpen(false),
  };
}
