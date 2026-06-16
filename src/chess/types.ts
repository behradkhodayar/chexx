// Core chess + Chexx type definitions.
// Board is a flat array of 64 squares. index = rank * 8 + file.
// file 0..7 => a..h, rank 0..7 => 1..8. White starts on ranks 0-1 and moves toward rank 7.

export type Color = 'w' | 'b';

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

/** Piece types that participate in the Chexx morph (Minor + Major). */
export const MORPH_TYPES: PieceType[] = ['n', 'b', 'r', 'q'];

/** Standard approximate material values. King is not counted toward the cap. */
export const PIECE_VALUE: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export const PIECE_NAME: Record<PieceType, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

export interface Piece {
  type: PieceType;
  color: Color;
  /** Whether the piece has ever moved (for castling / pawn double-step). */
  moved: boolean;
  /** Stable id so the renderer can track a piece across moves and morphs. */
  id: number;
}

export type Square = number; // 0..63

export interface Move {
  from: Square;
  to: Square;
  /** Pawn promotion target (always 'q' here, then it morphs like any major). */
  promotion?: PieceType;
  /** Square of a pawn captured en passant (differs from `to`). */
  enPassant?: Square;
  /** Castling: 'K' kingside, 'Q' queenside. */
  castle?: 'K' | 'Q';
  /** Rook move executed alongside a castle (from -> to). */
  rookFrom?: Square;
  rookTo?: Square;
}

/** Result of applying a move, including any Chexx morph that occurred. */
export interface MoveResult {
  move: Move;
  /** Type the moving piece had at the start of the move (before any morph). */
  movedType: PieceType;
  captured?: Piece;
  morph?: {
    square: Square;
    from: PieceType;
    to: PieceType;
  };
  check: boolean;
  checkmate: boolean;
  stalemate: boolean;
}

export type GameStatus =
  | 'playing'
  | 'check'
  | 'checkmate'
  | 'stalemate'
  | 'draw';

export function file(sq: Square): number {
  return sq & 7;
}
export function rank(sq: Square): number {
  return sq >> 3;
}
export function squareOf(f: number, r: number): Square {
  return r * 8 + f;
}
export function onBoard(f: number, r: number): boolean {
  return f >= 0 && f < 8 && r >= 0 && r < 8;
}
export function squareName(sq: Square): string {
  return 'abcdefgh'[file(sq)] + (rank(sq) + 1);
}
export function opposite(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}
