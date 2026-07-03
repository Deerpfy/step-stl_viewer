/** Minimal event emitter for decoupling modules. */
export function createEmitter() {
  const listeners = new Map();
  return {
    /**
     * @param {string} type
     * @param {(payload?: any) => void} fn
     */
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    /**
     * @param {string} type
     * @param {any} [payload]
     */
    emit(type, payload) {
      const set = listeners.get(type);
      if (set) for (const fn of [...set]) fn(payload);
    },
  };
}
