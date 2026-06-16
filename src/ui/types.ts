import { Color } from '../chess/types';

export type Mode = 'ai' | 'local';

export interface MatchConfig {
  mode: Mode;
  difficulty: 1 | 2 | 3;
  cap: number;
  capId: string;
  humanColor: Color;
}

export const GLYPH: Record<Color, Record<string, string>> = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};
