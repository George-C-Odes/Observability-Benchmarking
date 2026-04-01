/**
 * Creates an in-memory Storage-compatible mock.
 *
 * Works for both `localStorage` and `sessionStorage` stubs.
 * jsdom's built-in storage is not always fully functional, so tests
 * that interact with storage should prefer this deterministic stub.
 *
 * Usage:
 * ```ts
 * vi.stubGlobal('localStorage', createMockStorage());
 * ```
 */
export function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as unknown as Storage;
}