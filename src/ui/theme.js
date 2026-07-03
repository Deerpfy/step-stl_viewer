/** Dark/light theme switch. Persistence is best-effort only; a blocked
 *  localStorage (some file:// configurations) must never break the app. */
export function createTheme(ctx) {
  const KEY = 'step-stl-viewer.theme';

  function readSaved() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // storage unavailable: theme simply resets next session
    }
    ctx.events.emit('theme-changed', theme);
    if (ctx.refreshGridTheme) ctx.refreshGridTheme();
    if (ctx.invalidate) ctx.invalidate();
  }

  const saved = readSaved();
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;

  return {
    current: () => document.documentElement.dataset.theme || 'dark',
    toggle() {
      apply(this.current() === 'dark' ? 'light' : 'dark');
      return this.current();
    },
  };
}
