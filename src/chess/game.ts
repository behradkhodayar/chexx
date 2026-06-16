import { Board } from './board';
import {
  applyMoveRaw,
  hasLegalMoves,
  inCheck,
  legalMoves,
  legalMovesFrom,
} from './moves';
import { RNG } from './rng';
import {
  Color,
  GameStatus,
  MORPH_TYPES,
  Move,
  MoveResult,
  PIECE_VALUE,
  Piece,
  PieceType,
  Square,
  opposite,
} from './types';

export interface ChexxConfig {
  /** Shared material cap shown at game start. Same for both sides. */
  cap: number;
  seed: number;
}

export interface HistoryEntry {
  result: MoveResult;
  san: string;
  mover: Color;
}

export const CAP_PRESETS = [
  { id: 'standard', label: 'Standard', cap: 46 },
  { id: 'classic', label: 'Classic', cap: 54 },
  { id: 'wild', label: 'Wild', cap: 72 },
] as const;

/** Top-level Chexx game: standard chess + random morph of moved Minor/Major pieces. */
export class ChexxGame {
  board: Board;
  cap: number;
  rng: RNG;
  history: HistoryEntry[] = [];
  status: GameStatus = 'playing';

  constructor(config: ChexxConfig) {
    this.board = new Board();
    this.cap = config.cap;
    this.rng = new RNG(config.seed);
  }

  get turn(): Color {
    return this.board.turn;
  }

  material(color: Color): number {
    return this.board.materialOf(color, PIECE_VALUE);
  }

  legalMovesFrom(sq: Square): Move[] {
    return legalMovesFrom(this.board, sq);
  }

  legalMoves(color = this.turn): Move[] {
    return legalMoves(this.board, color);
  }

  /**
   * Pick the morph target for a piece that just moved.
   * Returns a different Minor/Major type chosen at random, constrained so the
   * mover's total material stays at or under the shared cap. Returns null if
   * no morph is possible (never expected, since a Knight downgrade always fits).
   */
  private chooseMorph(color: Color, current: PieceType): PieceType | null {
    const totalNow = this.material(color); // includes `current` already
    const candidates = MORPH_TYPES.filter((t) => {
      if (t === current) return false;
      const projected = totalNow - PIECE_VALUE[current] + PIECE_VALUE[t];
      return projected <= this.cap;
    });
    if (candidates.length === 0) return null;
    return this.rng.pick(candidates);
  }

  /**
   * Apply a fully-legal move, running the Chexx morph for moved Minor/Major
   * pieces, then recompute game status. Returns a rich result for the view layer.
   */
  applyMove(move: Move): MoveResult {
    const mover = this.board.turn;
    const movingPiece = this.board.get(move.from)!;
    const movingTypeAtStart = movingPiece.type;
    const captured = this.capturedBy(move);

    applyMoveRaw(this.board, move);

    // Chexx morph: only pieces that *began the move* as Minor/Major morph.
    // A pawn that promotes this move was a pawn at move start -> no morph yet.
    let morph: MoveResult['morph'];
    const landed = this.board.get(move.to);
    if (
      landed &&
      movingTypeAtStart !== 'p' &&
      movingTypeAtStart !== 'k' &&
      MORPH_TYPES.includes(landed.type)
    ) {
      const to = this.chooseMorph(mover, landed.type);
      if (to) {
        morph = { square: move.to, from: landed.type, to };
        landed.type = to;
      }
    }

    this.board.switchTurn();

    const enemy = this.board.turn;
    const check = inCheck(this.board, enemy);
    const enemyHasMoves = hasLegalMoves(this.board, enemy);
    const checkmate = check && !enemyHasMoves;
    const stalemate = !check && !enemyHasMoves;

    this.status = checkmate
      ? 'checkmate'
      : stalemate
        ? 'stalemate'
        : this.board.halfmoveClock >= 100
          ? 'draw'
          : check
            ? 'check'
            : 'playing';

    const result: MoveResult = {
      move,
      movedType: movingTypeAtStart,
      captured: captured ?? undefined,
      morph,
      check,
      checkmate,
      stalemate,
    };
    this.history.push({ result, san: this.toSan(result, mover), mover });
    return result;
  }

  private capturedBy(move: Move): Piece | null {
    if (move.enPassant !== undefined) return this.board.get(move.enPassant);
    return this.board.get(move.to);
  }

  isGameOver(): boolean {
    return (
      this.status === 'checkmate' ||
      this.status === 'stalemate' ||
      this.status === 'draw'
    );
  }

  winner(): Color | null {
    if (this.status === 'checkmate') return opposite(this.board.turn);
    return null;
  }

  /** Minimal SAN-ish string for the move log (includes morph annotation). */
  private toSan(result: MoveResult, _mover: Color): string {
    const m = result.move;
    if (m.castle === 'K') return 'O-O';
    if (m.castle === 'Q') return 'O-O-O';
    const fromName = 'abcdefgh'[m.from & 7] + ((m.from >> 3) + 1);
    const toName = 'abcdefgh'[m.to & 7] + ((m.to >> 3) + 1);
    let s = `${fromName}${result.captured ? 'x' : '-'}${toName}`;
    if (m.promotion) s += '=Q';
    if (result.morph) s += `→${result.morph.to.toUpperCase()}`;
    if (result.checkmate) s += '#';
    else if (result.check) s += '+';
    return s;
  }
}
