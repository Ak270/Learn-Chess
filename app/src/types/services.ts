// Service contracts between phases (docs/backend/01 §3). Implementations arrive in their own phase.
import type { ID, Ms, SkillId } from './ids';

export interface EngineResult {
  fen: string;
  depth: number;
  lines: { multipv: number; cp?: number; mate?: number; pv: string[] }[]; // cp/mate: side-to-move view
}
export interface EngineClient {
  init(opts?: { threads?: number; hashMb?: number }): Promise<void>;
  analyse(fen: string, o: { depth?: number; movetimeMs?: number; multiPv?: number }): Promise<EngineResult>;
  stop(): void;
  dispose(): void;
}

export interface AiProvider {
  id: string;
  explain(pkg: unknown, style: string): Promise<string>;
  available(): Promise<boolean>;
}

export interface Opponent {
  name: string;
  elo: number;
  chooseMove(fen: string, history: string[], ctx: unknown): Promise<string>;
}

export interface RawGame {
  source: 'lichess' | 'chesscom' | 'pgn';
  sourceId?: string;
  pgn: string;
}
export interface ImportQuery {
  username?: string;
  since?: Ms;
  max?: number;
}
export interface Importer {
  id: 'lichess' | 'chesscom' | 'pgn';
  fetchGames(q: ImportQuery): AsyncIterable<RawGame>;
}

export interface ReviewProgress {
  gameId: ID;
  ply: number;
  total: number;
}
export interface SrsCardRef {
  id: ID;
  skillTags: SkillId[];
}
