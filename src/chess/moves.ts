import { Board } from './board';
import {
  Color,
  Move,
  Square,
  file,
  onBoard,
  opposite,
  rank,
  squareOf,
} from './types';

const KNIGHT_DELTAS = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
const KING_DELTAS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
const BISHOP_DIRS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const ROOK_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Is `sq` attacked by any piece of `byColor`? Used for check + castling. */
export function isSquareAttacked(
  board: Board,
  sq: Square,
  byColor: Color,
): boolean {
  const tf = file(sq);
  const tr = rank(sq);

  // Pawn attacks: a `byColor` pawn attacks diagonally toward the enemy.
  const pawnDir = byColor === 'w' ? 1 : -1;
  for (const df of [-1, 1]) {
    const pf = tf + df;
    const pr = tr - pawnDir;
    if (onBoard(pf, pr)) {
      const p = board.get(squareOf(pf, pr));
      if (p && p.color === byColor && p.type === 'p') return true;
    }
  }

  // Knight attacks.
  for (const [df, dr] of KNIGHT_DELTAS) {
    const nf = tf + df;
    const nr = tr + dr;
    if (onBoard(nf, nr)) {
      const p = board.get(squareOf(nf, nr));
      if (p && p.color === byColor && p.type === 'n') return true;
    }
  }

  // King attacks (adjacency).
  for (const [df, dr] of KING_DELTAS) {
    const kf = tf + df;
    const kr = tr + dr;
    if (onBoard(kf, kr)) {
      const p = board.get(squareOf(kf, kr));
      if (p && p.color === byColor && p.type === 'k') return true;
    }
  }

  // Sliding attacks: bishops/queens on diagonals, rooks/queens on files/ranks.
  for (const [df, dr] of BISHOP_DIRS) {
    let f = tf + df;
    let r = tr + dr;
    while (onBoard(f, r)) {
      const p = board.get(squareOf(f, r));
      if (p) {
        if (p.color === byColor && (p.type === 'b' || p.type === 'q'))
          return true;
        break;
      }
      f += df;
      r += dr;
    }
  }
  for (const [df, dr] of ROOK_DIRS) {
    let f = tf + df;
    let r = tr + dr;
    while (onBoard(f, r)) {
      const p = board.get(squareOf(f, r));
      if (p) {
        if (p.color === byColor && (p.type === 'r' || p.type === 'q'))
          return true;
        break;
      }
      f += df;
      r += dr;
    }
  }
  return false;
}

export function inCheck(board: Board, color: Color): boolean {
  const k = board.findKing(color);
  if (k < 0) return false;
  return isSquareAttacked(board, k, opposite(color));
}

function slide(
  board: Board,
  from: Square,
  dirs: number[][],
  color: Color,
  out: Move[],
): void {
  const ff = file(from);
  const fr = rank(from);
  for (const [df, dr] of dirs) {
    let f = ff + df;
    let r = fr + dr;
    while (onBoard(f, r)) {
      const to = squareOf(f, r);
      const occ = board.get(to);
      if (!occ) {
        out.push({ from, to });
      } else {
        if (occ.color !== color) out.push({ from, to });
        break;
      }
      f += df;
      r += dr;
    }
  }
}

/** Pseudo-legal moves for the piece on `from` (ignores leaving own king in check). */
export function pseudoMoves(board: Board, from: Square): Move[] {
  const piece = board.get(from);
  if (!piece) return [];
  const out: Move[] = [];
  const { type, color } = piece;
  const ff = file(from);
  const fr = rank(from);

  switch (type) {
    case 'p': {
      const dir = color === 'w' ? 1 : -1;
      const startRank = color === 'w' ? 1 : 6;
      const promoRank = color === 'w' ? 7 : 0;
      const oneR = fr + dir;
      if (onBoard(ff, oneR) && !board.get(squareOf(ff, oneR))) {
        pushPawn(out, from, squareOf(ff, oneR), oneR === promoRank);
        // Double push.
        if (fr === startRank) {
          const twoR = fr + 2 * dir;
          if (!board.get(squareOf(ff, twoR)))
            out.push({ from, to: squareOf(ff, twoR) });
        }
      }
      // Captures + en passant.
      for (const df of [-1, 1]) {
        const cf = ff + df;
        const cr = fr + dir;
        if (!onBoard(cf, cr)) continue;
        const to = squareOf(cf, cr);
        const occ = board.get(to);
        if (occ && occ.color !== color) {
          pushPawn(out, from, to, cr === promoRank);
        } else if (to === board.enPassant) {
          out.push({ from, to, enPassant: squareOf(cf, fr) });
        }
      }
      break;
    }
    case 'n':
      for (const [df, dr] of KNIGHT_DELTAS) {
        const nf = ff + df;
        const nr = fr + dr;
        if (!onBoard(nf, nr)) continue;
        const to = squareOf(nf, nr);
        const occ = board.get(to);
        if (!occ || occ.color !== color) out.push({ from, to });
      }
      break;
    case 'b':
      slide(board, from, BISHOP_DIRS, color, out);
      break;
    case 'r':
      slide(board, from, ROOK_DIRS, color, out);
      break;
    case 'q':
      slide(board, from, [...BISHOP_DIRS, ...ROOK_DIRS], color, out);
      break;
    case 'k': {
      for (const [df, dr] of KING_DELTAS) {
        const kf = ff + df;
        const kr = fr + dr;
        if (!onBoard(kf, kr)) continue;
        const to = squareOf(kf, kr);
        const occ = board.get(to);
        if (!occ || occ.color !== color) out.push({ from, to });
      }
      addCastles(board, from, color, out);
      break;
    }
  }
  return out;
}

function pushPawn(out: Move[], from: Square, to: Square, promo: boolean): void {
  if (promo) out.push({ from, to, promotion: 'q' });
  else out.push({ from, to });
}

function addCastles(
  board: Board,
  from: Square,
  color: Color,
  out: Move[],
): void {
  const king = board.get(from);
  if (!king || king.moved) return;
  const r = rank(from);
  const homeRank = color === 'w' ? 0 : 7;
  if (r !== homeRank || file(from) !== 4) return;
  if (inCheck(board, color)) return;
  const enemy = opposite(color);

  // Kingside: rook on h-file.
  const hRook = board.get(squareOf(7, homeRank));
  if (hRook && hRook.type === 'r' && !hRook.moved) {
    const f5 = squareOf(5, homeRank);
    const f6 = squareOf(6, homeRank);
    if (
      !board.get(f5) &&
      !board.get(f6) &&
      !isSquareAttacked(board, f5, enemy) &&
      !isSquareAttacked(board, f6, enemy)
    ) {
      out.push({
        from,
        to: f6,
        castle: 'K',
        rookFrom: squareOf(7, homeRank),
        rookTo: f5,
      });
    }
  }
  // Queenside: rook on a-file.
  const aRook = board.get(squareOf(0, homeRank));
  if (aRook && aRook.type === 'r' && !aRook.moved) {
    const f1 = squareOf(1, homeRank);
    const f2 = squareOf(2, homeRank);
    const f3 = squareOf(3, homeRank);
    if (
      !board.get(f1) &&
      !board.get(f2) &&
      !board.get(f3) &&
      !isSquareAttacked(board, f3, enemy) &&
      !isSquareAttacked(board, f2, enemy)
    ) {
      out.push({
        from,
        to: f2,
        castle: 'Q',
        rookFrom: squareOf(0, homeRank),
        rookTo: f3,
      });
    }
  }
}

/** Apply a move to a board in place (no morph, no turn bookkeeping beyond clocks). */
export function applyMoveRaw(board: Board, move: Move): void {
  const piece = board.get(move.from);
  if (!piece) return;
  const isPawn = piece.type === 'p';
  const isCapture = !!board.get(move.to) || move.enPassant !== undefined;

  // En passant capture removes the pawn behind the target.
  if (move.enPassant !== undefined) board.set(move.enPassant, null);

  board.set(move.from, null);
  piece.moved = true;
  if (move.promotion) piece.type = move.promotion;
  board.set(move.to, piece);

  // Castling rook hop.
  if (move.castle && move.rookFrom !== undefined && move.rookTo !== undefined) {
    const rookPiece = board.get(move.rookFrom);
    board.set(move.rookFrom, null);
    if (rookPiece) {
      rookPiece.moved = true;
      board.set(move.rookTo, rookPiece);
    }
  }

  // En passant target for next move.
  if (isPawn && Math.abs(rank(move.to) - rank(move.from)) === 2) {
    board.enPassant = squareOf(file(move.from), (rank(move.from) + rank(move.to)) / 2);
  } else {
    board.enPassant = -1;
  }

  if (isPawn || isCapture) board.halfmoveClock = 0;
  else board.halfmoveClock++;
}

/** Fully legal moves for a single piece. */
export function legalMovesFrom(board: Board, from: Square): Move[] {
  const piece = board.get(from);
  if (!piece) return [];
  const color = piece.color;
  return pseudoMoves(board, from).filter((m) => {
    const test = board.clone();
    applyMoveRaw(test, m);
    return !inCheck(test, color);
  });
}

/** All legal moves for a color. */
export function legalMoves(board: Board, color: Color): Move[] {
  const out: Move[] = [];
  for (const { sq } of board.piecesOf(color)) {
    out.push(...legalMovesFrom(board, sq));
  }
  return out;
}

export function hasLegalMoves(board: Board, color: Color): boolean {
  for (const { sq } of board.piecesOf(color)) {
    if (legalMovesFrom(board, sq).length > 0) return true;
  }
  return false;
}
