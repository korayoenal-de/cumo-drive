/** AsyncStorage im Speicher, je Fahrer frisch (jedes Bundle hat seine eigene Instanz). */
const mem = new Map<string, string>();

const AsyncStorage = {
  getItem: async (k: string) => mem.get(k) ?? null,
  setItem: async (k: string, v: string) => void mem.set(k, v),
  removeItem: async (k: string) => void mem.delete(k),
  multiRemove: async (ks: string[]) => ks.forEach((k) => mem.delete(k)),
  getAllKeys: async () => [...mem.keys()],
  clear: async () => mem.clear(),
};

export default AsyncStorage;
