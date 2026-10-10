// Settings live in IndexedDB (kv table) with an in-memory cache so views can read synchronously.
import { cfg } from '../config';
import { db } from '../data/db';

export interface AppSettings {
  theme: 'dark' | 'light';
  board: string;
  motion: 'on' | 'off';
  sound: boolean;
  coords: boolean;
  highlights: boolean;
  minutes: number;
  restDay: number;
  mode: 'coach' | 'normal';
  groqKey: string;
  groqModel: string;
}
export const defaultSettings = (): AppSettings => ({
  theme: 'dark',
  board: 'green',
  motion: 'on',
  sound: true,
  coords: true,
  highlights: true,
  minutes: cfg.get('settings.defaults.dailyMinutes'),
  restDay: cfg.get('settings.defaults.restDay'),
  mode: 'coach',
  groqKey: '',
  groqModel: cfg.get<string>('settings.defaults.groqModel'),
});

const KEY = 'settings.v1';
let s = defaultSettings();

export function applySettings() {
  const r = document.documentElement;
  r.dataset.theme = s.theme;
  r.dataset.board = s.board;
  r.dataset.motion = s.motion;
}
export async function loadSettings() {
  try {
    s = { ...defaultSettings(), ...((await db.kv.get(KEY))?.value as Partial<AppSettings> | undefined) };
  } catch {
    /* storage blocked: defaults */
  }
  applySettings();
}
export const settings = {
  get: <K extends keyof AppSettings>(k: K): AppSettings[K] => s[k],
  set<K extends keyof AppSettings>(k: K, v: AppSettings[K]) {
    s[k] = v;
    applySettings();
    db.kv.put({ key: KEY, value: s }).catch(() => {
      /* storage blocked; setting lasts this session */
    });
  },
  all: () => ({ ...s }),
};
