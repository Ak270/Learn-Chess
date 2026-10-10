import { describe, expect, it } from 'vitest';
import { getServices, setServices } from '../../src/services';
import type { AiProvider, EngineClient } from '../../src/types/services';

describe('service registry', () => {
  it('accepts fake engine and AI provider (proves boundaries)', async () => {
    const engine: EngineClient = {
      init: async () => {},
      stop() {},
      dispose() {},
      analyse: async (fen) => ({ fen, depth: 1, lines: [{ multipv: 1, cp: 0, pv: [] }] }),
    };
    const ai: AiProvider = { id: 'fake', available: async () => true, explain: async () => 'ok' };
    setServices({ engine, ai });
    expect((await getServices().engine!.analyse('x', {})).lines[0].cp).toBe(0);
    expect(await getServices().ai!.explain({}, 'plain')).toBe('ok');
  });
});
