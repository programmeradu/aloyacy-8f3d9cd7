/**
 * In-memory stand-in for AsyncStorage so persistence logic runs for real.
 *
 * The map hangs off `globalThis` on purpose: suites use `vi.resetModules()` to
 * re-import a module with a cold cache, which would otherwise hand them a
 * brand-new stub and silently drop everything written before the reset.
 */
const globalStore = globalThis as typeof globalThis & {
  __aloyaAsyncStorage?: Map<string, string>;
};
const store = (globalStore.__aloyaAsyncStorage ??= new Map<string, string>());


const AsyncStorage = {
  async getItem(key: string) {
    return store.has(key) ? store.get(key)! : null;
  },
  async setItem(key: string, value: string) {
    store.set(key, value);
  },
  async removeItem(key: string) {
    store.delete(key);
  },
  async multiRemove(keys: string[]) {
    for (const key of keys) store.delete(key);
  },
  async getAllKeys() {
    return [...store.keys()];
  },
  async clear() {
    store.clear();
  },
  /** Test-only escape hatch: reset between cases without touching the API. */
  __reset() {
    store.clear();
  },
};

export default AsyncStorage;
