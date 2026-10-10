// Typed surface of the (still untyped, ts-nocheck) Board component, so views stay strictly typed.
import type { Chess, Move } from 'chess.js';
import { Board as RawBoard } from './Board';

export interface BoardOptions {
  chess?: Chess;
  orientation?: 'w' | 'b';
  interactive?: (color: 'w' | 'b') => boolean;
  onUserMove?: (m: { from: string; to: string; promotion?: string }) => boolean;
  coords?: boolean;
  animate?: boolean;
  highlights?: boolean;
}
export interface BoardApi {
  chess: Chess;
  orientation: 'w' | 'b';
  render(animated?: boolean): void;
  applyMove(m: Move, o?: { animate?: boolean }): void;
  setMarks(marks: Record<string, { text: string; badgeColor?: string; cls?: string }>): void;
  setArrows(arrows: [string, string, string?][]): void;
  setLastMove(m: Move | null): void;
  setOrientation(o: 'w' | 'b'): void;
  flip(): void;
}
export const Board = RawBoard as unknown as new (el: HTMLElement, o?: BoardOptions) => BoardApi;
