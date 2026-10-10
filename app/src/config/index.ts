// Typed config loader. Every key must carry a `source` note (no magic numbers, docs/backend/01 §4.5).
import app from './app.json';
import chessCfg from './chess.json';
import skillmap from './skillmap.json';

export interface ConfigEntry<T = unknown> {
  value: T;
  source: string;
}
export type ConfigFile = Record<string, ConfigEntry>;

export function validateConfig(file: Record<string, unknown>, name = 'config'): ConfigFile {
  for (const [key, entry] of Object.entries(file)) {
    const e = entry as Partial<ConfigEntry> | null;
    if (!e || typeof e !== 'object' || !('value' in e)) throw new Error(`${name}: key "${key}" has no value`);
    if (typeof e.source !== 'string' || e.source.trim() === '')
      throw new Error(`${name}: key "${key}" is missing a "source" note`);
  }
  return file as ConfigFile;
}

export function createConfig(...files: [string, Record<string, unknown>][]) {
  const merged = new Map<string, ConfigEntry>();
  for (const [name, file] of files) {
    for (const [k, v] of Object.entries(validateConfig(file, name))) {
      if (merged.has(k)) throw new Error(`config key "${k}" defined twice (${name})`);
      merged.set(k, v);
    }
  }
  return {
    get<T = number>(key: string): T {
      const e = merged.get(key);
      if (!e) throw new Error(`unknown config key "${key}"`);
      return e.value as T;
    },
    source: (key: string) => merged.get(key)?.source,
    keys: () => [...merged.keys()],
  };
}

export type Config = ReturnType<typeof createConfig>;
export const cfg = createConfig(['app.json', app], ['chess.json', chessCfg], ['skillmap.json', skillmap]);
