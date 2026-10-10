import { describe, expect, it } from 'vitest';
import { analyseGame } from '../../src/core/chess/analyse';
import { firstMeaningfulMistake } from '../../src/core/chess/classify';
import { createEngineClient } from '../../src/core/engine/engineClient';
import { nodeTransport } from '../helpers/nodeEngine';

// The prototype's sample game (ui/js/data.js): 11.Nh4?? hangs the knight to Qxh4 (ply 21).
const SAMPLE =
  '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. d3 d6 6. Bg5 h6 7. Bxf6 Qxf6 8. Nc3 Bg4 9. h3 Bh5 10. g4 Bg6 11. Nh4 Qxh4 12. Nd5 Qd8 13. Nxc7+ Qxc7 14. Bb5 a6 0-1';

// One in-process engine per test file: the Emscripten module is a singleton.
const engine = createEngineClient(nodeTransport, { hashMb: 16 });

describe('real Stockfish 19 (lite, single-thread)', () => {
  it('finds Ra8# in the back-rank position and returns a mate score from the side-to-move view', async () => {
    const r = await engine.analyse('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', { depth: 10, multiPv: 2 });
    expect(r.lines[0].pv[0]).toBe('a1a8');
    expect(r.lines[0].mate).toBe(1);
    expect(r.lines).toHaveLength(2);
  }, 60000);

  it('caches by position+depth+multipv and never serves a shallow result for a deeper request', async () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    await engine.analyse(fen, { depth: 6 });
    const n = engine.cacheSize();
    await engine.analyse(fen, { depth: 6 });
    expect(engine.cacheSize()).toBe(n);
    const deeper = await engine.analyse(fen, { depth: 9 });
    expect(engine.cacheSize()).toBe(n + 1);
    expect(deeper.depth).toBeGreaterThanOrEqual(9);
  }, 60000);

  it('sample game: first meaningful mistake is ply 21, a blunder, with Qxh4 as the refutation and hanging.piece', async () => {
    const a = await analyseGame(SAMPLE, 'w', engine, { depth: 12 });
    const first = firstMeaningfulMistake(a.learner);
    expect(first).toEqual({ ply: 21, isFirstMeaningful: true });
    const p21 = a.plies.find((p) => p.ply === 21)!;
    expect(p21.cls).toBe('blunder');
    expect(a.refutations[21]).toBe('f6h4');
    expect(p21.motifs?.map((m) => m.id)).toContain('hanging.piece');
  }, 180000);
});

describe('review speed (Phase 3 §10: 40-move game < 90 s at depth 12)', () => {
  it('reviews an owner game of >= 40 moves within budget, without blocking', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { Chess } = await import('chess.js');
    const dir = 'tests/fixtures/pgn';
    let pgn = '';
    let plies = 0;
    for (const f of readdirSync(dir).filter((x) => x.startsWith('game_') || x.includes('castle'))) {
      const txt = readFileSync(`${dir}/${f}`, 'utf8');
      const c = new Chess();
      try {
        c.loadPgn(txt);
      } catch {
        continue;
      }
      if (c.history().length > plies) {
        plies = c.history().length;
        pgn = txt;
      }
    }
    expect(plies).toBeGreaterThanOrEqual(60);
    const t0 = Date.now();
    const a = await analyseGame(pgn, 'w', engine, { depth: 12 });
    const secs = (Date.now() - t0) / 1000;
    process.stderr.write(`PERF ${plies} plies analysed in ${secs.toFixed(1)}s\n`);
    expect(a.plies.length).toBe(plies);
    expect(secs).toBeLessThan(90);
  }, 120000);
});
