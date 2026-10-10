// Test-only transport: runs the real Stockfish 19 lite single-thread build in-process under Node.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { TransportFactory, UciTransport } from '../../src/core/engine/engineClient';

const require = createRequire(import.meta.url);

export const nodeTransport: TransportFactory = async () => {
  const initEngine = require('stockfish');
  const path = resolve('node_modules/stockfish/bin/stockfish-19-lite-single.js');
  const engine = await initEngine(path);
  let cb: (l: string) => void = () => {};
  engine.listener = (l: string) => cb(l);
  const t: UciTransport = {
    send: (c) => engine.sendCommand(c),
    onLine: (f) => (cb = f),
    dispose: () => engine.terminate?.(),
  };
  return t;
};
