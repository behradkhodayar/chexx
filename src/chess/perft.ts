import { Board } from './board';
import { applyMoveRaw, inCheck, legalMovesFrom } from './moves';
import { Color, opposite } from './types';

/** Count leaf nodes of the move tree to depth `d` — a correctness oracle. */
export function perft(board: Board, color: Color, d: number): number {
  if (d === 0) return 1;
  let nodes = 0;
  for (const { sq } of board.piecesOf(color)) {
    for (const m of legalMovesFrom(board, sq)) {
      const next = board.clone();
      applyMoveRaw(next, m);
      // legalMovesFrom already guarantees own king safety.
      void inCheck;
      nodes += perft(next, opposite(color), d - 1);
    }
  }
  return nodes;
}
