import { describe, expect, it } from 'vitest';
import { createConfig, cfg } from '../../src/config';
import { readdirSync, readFileSync } from 'node:fs';

describe('config loader', () => {
  it('rejects a key without a source', () => {
    expect(() => createConfig(['t.json', { 'a.b': { value: 1 } }])).toThrow(/source/);
    expect(() => createConfig(['t.json', { 'a.b': { value: 1, source: '  ' } }])).toThrow(/source/);
  });
  it('rejects duplicate keys across files', () => {
    const f = { k: { value: 1, source: 's' } };
    expect(() => createConfig(['a', f], ['b', f])).toThrow(/twice/);
  });
  it('exposes typed values and sources', () => {
    expect(cfg.get('settings.defaults.dailyMinutes')).toBe(30);
    expect(cfg.source('settings.defaults.dailyMinutes')).toMatch(/DECISIONS/);
    expect(() => cfg.get('nope')).toThrow(/unknown/);
  });
  it('every shipped config file passes validation', () => {
    for (const f of readdirSync('src/config').filter((n) => n.endsWith('.json'))) {
      expect(() => createConfig([f, JSON.parse(readFileSync(`src/config/${f}`, 'utf8'))])).not.toThrow();
    }
  });
});
