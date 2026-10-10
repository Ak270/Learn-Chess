import { cfg } from '../../config';

export interface Level {
  id: number;
  name: string;
  elo: number;
  depth: number;
  multiPv: number;
  temperature: number;
  pBlunder: number;
  blurb: string;
  bookPlies: number;
}
export const LEVELS = (): Level[] => cfg.get<Level[]>('levels');
export const levelById = (id: number): Level => LEVELS().find((l) => l.id === id) ?? LEVELS()[3];
