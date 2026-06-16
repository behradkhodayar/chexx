import { Board } from './board';
import { applyMoveRaw, inCheck, legalMoves } from './moves';
import { RNG } from './rng';
import {
  Color,
  MORPH_TYPES,
  Move,
  PIECE_VALUE,
  PieceType,
  Square,
  file,
  opposite,
  rank,
} from './types';

// Compact piece-square tables (white POV, a1 = index 0). Encourage center play.
const PST_PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, -20, -20, 10, 10, 5, 5, -5, -10, 0, 0, -10,
  -5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, 5, 10, 25, 25, 10, 5, 5, 10, 10, 20, 30,
  30, 20, 10, 10, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0,
];
const PST_KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 5, 5, 0, -20, -40, -30,
  5, 10, 15, 15, 10, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 15, 20, 20,
  15, 5, -30, -30, 0, 10, 15, 15, 10, 0, -30, -40, -20, 0, 0, 0, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const PST_CENTER = [
  -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 5, 5, 5, 5, 0, -10, -10, 5,
  10, 10, 10, 10, 5, -10, -10, 5, 10, 15, 15, 10, 5, -10, -10, 5, 10, 15, 15,
  10, 5, -10, -10, 5, 10, 10, 10, 10, 5, -10, -10, 0, 5, 5, 5, 5, 0, -10, -20,
  -10, -10, -10, -10, -10, -10, -20,
];

function pst(type: PieceType, sq: Square, color: Color): number {
  const i = color === 'w' ? sq : 63 - sq;
  switch (type) {
    case 'p':
      return PST_PAWN[i];
    case 'n':
      return PST_KNIGHT[i];
    case 'b':
    case 'r':
    case 'q':
      return PST_CENTER[i];
    case 'k':
      // Keep king toward home ranks early.
      return -PST_CENTER[i] * 0.3;
  }
}

/** Static evaluation from `color`'s perspective (centipawns-ish). */
function evaluate(board: Board, color: Color): number {
  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = board.squares[sq];
    if (!p) continue;
    const v = PIECE_VALUE[p.type] * 100 + pst(p.type, sq, p.color);
    score += p.color === color ? v : -v;
  }
  return score;
}

function negamax(
  board: Board,
  color: Color,
  depth: number,
  alpha: number,
  beta: number,
): number {
  if (depth === 0) return evaluate(board, color);
  const moves = legalMoves(board, color);
  if (moves.length === 0) {
    if (inCheck(board, color)) return -100000 + (10 - depth); // prefer slower mates
    return 0; // stalemate
  }
  let best = -Infinity;
  for (const m of moves) {
    const next = board.clone();
    applyMoveRaw(next, m);
    next.turn = opposite(color);
    const score = -negamax(next, opposite(color), depth - 1, -beta, -alpha);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** Expected material delta if a moved Minor/Major piece morphs (cap-aware). */
function expectedMorphDelta(
  board: Board,
  mover: Color,
  cap: number,
  type: PieceType,
): number {
  if (type === 'p' || type === 'k') return 0;
  const total = board.materialOf(mover, PIECE_VALUE);
  const candidates = MORPH_TYPES.filter((t) => {
    if (t === type) return false;
    return total - PIECE_VALUE[type] + PIECE_VALUE[t] <= cap;
  });
  if (candidates.length === 0) return 0;
  const avg =
    candidates.reduce((s, t) => s + PIECE_VALUE[t], 0) / candidates.length;
  return (avg - PIECE_VALUE[type]) * 100;
}

export interface AIOptions {
  depth: number; // 1 (easy) .. 3 (hard)
  randomness: number; // 0..1 score jitter for variety / lower difficulty
  cap: number;
  rng: RNG;
}

/** Choose a move for `color`. Search ignores morph; root adds expected-morph value. */
export function chooseAIMove(
  board: Board,
  color: Color,
  opts: AIOptions,
): Move | null {
  const moves = legalMoves(board, color);
  if (moves.length === 0) return null;

  let bestMove: Move | null = null;
  let bestScore = -Infinity;

  for (const m of moves) {
    const mover = board.get(m.from)!;
    const next = board.clone();
    applyMoveRaw(next, m);
    next.turn = opposite(color);
    let score = -negamax(
      next,
      opposite(color),
      Math.max(0, opts.depth - 1),
      -Infinity,
      Infinity,
    );
    // Reward/penalize the stochastic morph of the piece we just moved.
    score += expectedMorphDelta(next, color, opts.cap, mover.type);
    // Jitter keeps games from being identical and softens lower difficulties.
    score += (opts.rng.next() - 0.5) * opts.randomness * 200;
    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }
  return bestMove;
}

export function squareLabel(sq: Square): string {
  return 'abcdefgh'[file(sq)] + (rank(sq) + 1);
}
