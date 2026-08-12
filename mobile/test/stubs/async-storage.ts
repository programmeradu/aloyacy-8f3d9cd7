// In-memory stand-in for @react-native-async-storage/async-storage.
// Same promise-based contract as the real module, so the code under test runs
// its genuine hydrate/persist paths. Tests reset it with `__resetStorage()`.

const store = new Map<string, string>();

export function __resetStorage(seed?: Record<string, string>) {
  store.clear();
  if (seed) for (const [k, v] of Object.entries(seed)) store.set(k, v);
}

export function __dumpStorage(): Record<string, string> {
  return Object.fromEntries(store);
}

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    return store.has(key) ? store.get(key)! : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    store.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    store.delete(key);
  },
  async multiRemove(keys: string[]): Promise<void> {
    for (const k of keys) store.delete(k);
  },
  async getAllKeys(): Promise<string[]> {
    return [...store.keys()];
  },
  async clear(): Promise<void> {
    store.clear();
  },
};

export default AsyncStorage;
