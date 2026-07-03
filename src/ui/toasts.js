/** Non-blocking toast notifications (info / success / warning / error). */
import { $, el } from './dom.js';

export function createToasts() {
  const host = $('#toasts');

  /**
   * Shows a toast. Errors stay longer.
   * @param {string} message
   * @param {'info'|'success'|'warning'|'error'} [type]
   * @param {number} [duration] ms
   */
  function toast(message, type = 'info', duration) {
    const ms = duration ?? (type === 'error' ? 7000 : 4000);
    const node = el('div', { class: `toast toast-${type}`, role: 'status' },
      el('span', { class: 'toast-dot' }),
      el('span', { class: 'toast-text', text: message }),
    );
    const close = el('button', { class: 'toast-close', 'aria-label': 'Dismiss notification' });
    close.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    close.addEventListener('click', () => dismiss());
    node.append(close);
    host.append(node);
    while (host.children.length > 5) host.firstElementChild.remove();
    let removed = false;
    const dismiss = () => {
      if (removed) return;
      removed = true;
      node.classList.add('toast-out');
      setTimeout(() => node.remove(), 220);
    };
    setTimeout(dismiss, ms);
    return dismiss;
  }
  return toast;
}
