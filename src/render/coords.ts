import * as THREE from 'three';
import { Square, file, rank } from '../chess/types';

export const SQUARE = 1.0;

/** World position of a board square's center (piece base sits at y=0). */
export function squareToWorld(sq: Square, y = 0): THREE.Vector3 {
  return new THREE.Vector3(
    (file(sq) - 3.5) * SQUARE,
    y,
    (3.5 - rank(sq)) * SQUARE,
  );
}

/** Inverse: world point -> square index, or -1 if off the board. */
export function worldToSquare(p: THREE.Vector3): Square {
  const f = Math.round(p.x / SQUARE + 3.5);
  const r = Math.round(3.5 - p.z / SQUARE);
  if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
  return r * 8 + f;
}
