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
  explain(pkg: unknown, style?: string): Promise<string>;
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
  white: string;
  black: string;
  playerColor: 'w' | 'b';
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  startedAt: Ms;
  timeControl?: string;
  termination?: string;
  whiteRating?: number;
  blackRating?: number;
  clocks?: number[];
  plies: number;
}
export interface ImportQuery {
  username?: string;
  since?: Ms;
  max?: number;
  /** called for every game skipped, with a user-facing reason */
  onSkip?: (code: string, message: string) => void;
  signal?: { cancelled: boolean };
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
