import {
  Color,
  Piece,
  PieceType,
  Square,
  opposite,
  squareOf,
} from './types';

/** Mutable board state: 64 squares + side to move + en passant + counters. */
export class Board {
  squares: (Piece | null)[];
  turn: Color;
  /** En passant target square (the square a pawn skipped over), or -1. */
  enPassant: Square;
  halfmoveClock: number; // for 50-move rule
  fullmove: number;
  private nextId: number;

  constructor(empty = false) {
    this.squares = new Array(64).fill(null);
    this.turn = 'w';
    this.enPassant = -1;
    this.halfmoveClock = 0;
    this.fullmove = 1;
    this.nextId = 1;
    if (!empty) this.setupStandard();
  }

  private place(type: PieceType, color: Color, sq: Square): void {
    this.squares[sq] = { type, color, moved: false, id: this.nextId++ };
  }

  setupStandard(): void {
    this.squares.fill(null);
    const back: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (let f = 0; f < 8; f++) {
      this.place(back[f], 'w', squareOf(f, 0));
      this.place('p', 'w', squareOf(f, 1));
      this.place('p', 'b', squareOf(f, 6));
      this.place(back[f], 'b', squareOf(f, 7));
    }
    this.turn = 'w';
    this.enPassant = -1;
    this.halfmoveClock = 0;
    this.fullmove = 1;
  }

  get(sq: Square): Piece | null {
    return this.squares[sq];
  }

  set(sq: Square, piece: Piece | null): void {
    this.squares[sq] = piece;
  }

  findKing(color: Color): Square {
    for (let i = 0; i < 64; i++) {
      const p = this.squares[i];
      if (p && p.type === 'k' && p.color === color) return i;
    }
    return -1;
  }

  /** All squares occupied by a given color. */
  *piecesOf(color: Color): Generator<{ sq: Square; piece: Piece }> {
    for (let i = 0; i < 64; i++) {
      const p = this.squares[i];
      if (p && p.color === color) yield { sq: i, piece: p };
    }
  }

  /** Sum of non-king material for a color (Chexx cap accounting). */
  materialOf(color: Color, value: Record<PieceType, number>): number {
    let total = 0;
    for (let i = 0; i < 64; i++) {
      const p = this.squares[i];
      if (p && p.color === color) total += value[p.type];
    }
    return total;
  }

  clone(): Board {
    const b = new Board(true);
    b.turn = this.turn;
    b.enPassant = this.enPassant;
    b.halfmoveClock = this.halfmoveClock;
    b.fullmove = this.fullmove;
    b.nextId = this.nextId;
    for (let i = 0; i < 64; i++) {
      const p = this.squares[i];
      b.squares[i] = p ? { ...p } : null;
    }
    return b;
  }

  switchTurn(): void {
    this.turn = opposite(this.turn);
    if (this.turn === 'w') this.fullmove++;
  }
}
