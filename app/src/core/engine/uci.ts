// UCI parsing. Engine scores are side-to-move relative; we normalise into a type that carries `pov`
// immediately so signs can never be confused downstream (docs/backend/03 §1.1, §11).
export interface InfoLine {
  depth: number;
  multipv: number;
  cp?: number;
  mate?: number;
  bound?: 'lower' | 'upper';
  pv: string[];
  nodes?: number;
}

export function parseInfo(line: string): InfoLine | null {
  if (!line.startsWith('info ')) return null;
  const t = line.split(/\s+/);
  const out: InfoLine = { depth: 0, multipv: 1, pv: [] };
  let sawScore = false;
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        out.depth = +t[++i];
        break;
      case 'multipv':
        out.multipv = +t[++i];
        break;
      case 'nodes':
        out.nodes = +t[++i];
        break;
      case 'score': {
        const kind = t[++i];
        const v = +t[++i];
        if (kind === 'cp') out.cp = v;
        else if (kind === 'mate') out.mate = v;
        sawScore = true;
        break;
      }
      case 'lowerbound':
        out.bound = 'lower';
        break;
      case 'upperbound':
        out.bound = 'upper';
        break;
      case 'pv':
        out.pv = t.slice(i + 1);
        i = t.length;
        break;
      default:
        break;
    }
  }
  return sawScore && out.pv.length > 0 ? out : null;
}

export interface Bestmove {
  best: string | null;
  ponder?: string;
}
export function parseBestmove(line: string): Bestmove | null {
  if (!line.startsWith('bestmove')) return null;
  const t = line.split(/\s+/);
  return { best: t[1] && t[1] !== '(none)' ? t[1] : null, ponder: t[2] === 'ponder' ? t[3] : undefined };
}

/** Collects info lines of one search: keeps the last non-bound line per multipv. */
export class SearchCollector {
  private byPv = new Map<number, InfoLine>();
  push(line: string) {
    const info = parseInfo(line);
    if (!info || info.bound) return; // ignore bound lines
    const prev = this.byPv.get(info.multipv);
    if (!prev || info.depth >= prev.depth) this.byPv.set(info.multipv, info);
  }
  result(fen: string) {
    const lines = [...this.byPv.values()].sort((a, b) => a.multipv - b.multipv);
    return {
      fen,
      depth: lines.length ? Math.max(...lines.map((l) => l.depth)) : 0,
      lines: lines.map((l) => ({ multipv: l.multipv, cp: l.cp, mate: l.mate, pv: l.pv })),
    };
  }
}
