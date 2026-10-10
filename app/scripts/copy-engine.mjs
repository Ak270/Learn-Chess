// Copies the Stockfish lite single-thread build into public/engine (not committed; GPLv3, private use only).
import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('public/engine', { recursive: true });
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'])
  cpSync(`node_modules/stockfish/bin/${f}`, `public/engine/${f}`);
console.log('engine files copied to public/engine');
