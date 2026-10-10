// Browser transport: the Stockfish build is itself a worker script speaking UCI over postMessage.
import type { TransportFactory, UciTransport } from './engineClient';

/** Lite single-thread build works everywhere; multi-thread needs cross-origin isolation (docs/backend/01 §6). */
export const engineUrl = (base = import.meta.env.BASE_URL) => `${base}engine/stockfish-19-lite-single.js`;

export const workerTransport: TransportFactory = async () => {
  const w = new Worker(engineUrl());
  let cb: (l: string) => void = () => {};
  w.onmessage = (e) =>
    String(e.data)
      .split('\n')
      .forEach((l) => cb(l));
  const t: UciTransport = {
    send: (c) => w.postMessage(c),
    onLine: (f) => (cb = f),
    dispose: () => w.terminate(),
  };
  return t;
};
