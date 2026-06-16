import * as THREE from 'three';
import { Board } from '../chess/board';
import { Color, MoveResult, PieceType, Square } from '../chess/types';
import { PieceFactory } from './PieceFactory';
import { makePieceMaterials, PieceMaterials } from './materials';
import { squareToWorld } from './coords';
import { VFX } from './VFX';

export const PIECE_Y = 0.04;

// Knights/bishops should face the opponent. Tuned so white faces -Z (toward black).
const FACING: Record<Color, number> = { w: Math.PI / 2, b: -Math.PI / 2 };

type Ease = (t: number) => number;
const easeInOutCubic: Ease = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutBack: Ease = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

interface Tween {
  delay: number;
  t: number;
  dur: number;
  ease: Ease;
  onUpdate: (k: number) => void;
  onDone?: () => void;
}

interface Entry {
  group: THREE.Group;
  type: PieceType;
  color: Color;
}

interface FlashLight {
  light: THREE.PointLight;
  t: number;
  dur: number;
}

/** Owns all piece meshes, drives move/morph/capture animations via a tween list. */
export class PieceManager {
  readonly group = new THREE.Group();
  private factory = new PieceFactory();
  private mats: Record<Color, PieceMaterials>;
  private entries = new Map<number, Entry>();
  private tweens: Tween[] = [];
  private flashes: FlashLight[] = [];

  constructor(private vfx: VFX) {
    this.mats = { w: makePieceMaterials('w'), b: makePieceMaterials('b') };
  }

  /** Rebuild all pieces from a board snapshot (new game / hard reset). */
  buildFromBoard(board: Board): void {
    for (const e of this.entries.values()) this.group.remove(e.group);
    this.entries.clear();
    this.tweens.length = 0;
    for (let sq = 0; sq < 64; sq++) {
      const p = board.get(sq);
      if (p) this.spawn(p.id, p.type, p.color, sq);
    }
  }

  private spawn(id: number, type: PieceType, color: Color, sq: Square): Entry {
    const group = this.factory.create(type, this.mats[color]);
    group.rotation.y = FACING[color];
    const p = squareToWorld(sq, PIECE_Y);
    group.position.copy(p);
    this.group.add(group);
    const entry: Entry = { group, type, color };
    this.entries.set(id, entry);
    return entry;
  }

  private swapType(entry: Entry, newType: PieceType): void {
    const pos = entry.group.position.clone();
    const color = entry.color;
    this.group.remove(entry.group);
    const fresh = this.factory.create(newType, this.mats[color]);
    fresh.rotation.y = FACING[color];
    fresh.position.copy(pos);
    fresh.scale.setScalar(0.5);
    this.group.add(fresh);
    entry.group = fresh;
    entry.type = newType;
    // Pop-in.
    this.tweens.push({
      delay: 0,
      t: 0,
      dur: 0.32,
      ease: easeOutBack,
      onUpdate: (k) => fresh.scale.setScalar(0.5 + 0.5 * k),
    });
  }

  /** Animate a fully-applied move. Resolves when the visual sequence completes. */
  animateMove(board: Board, result: MoveResult): Promise<void> {
    return new Promise((resolve) => {
      const move = result.move;
      const moverPiece = board.get(move.to)!;
      const entry = this.entries.get(moverPiece.id)!;
      const start = squareToWorld(move.from, PIECE_Y);
      const end = squareToWorld(move.to, PIECE_Y);
      const arc = result.movedType === 'n' ? 0.95 : 0.16;
      const dur = result.movedType === 'n' ? 0.5 : 0.42;

      // Captured piece: sink + fade then remove.
      if (result.captured) {
        const capEntry = this.entries.get(result.captured.id);
        if (capEntry) {
          const capSq =
            move.enPassant !== undefined ? move.enPassant : move.to;
          const capPos = squareToWorld(capSq, PIECE_Y);
          this.killEntry(result.captured.id, capEntry, 0.18);
          this.vfx.spawnCapture(capPos);
        }
      }

      // Castling rook.
      if (move.castle && move.rookTo !== undefined) {
        const rook = board.get(move.rookTo);
        if (rook) {
          const re = this.entries.get(rook.id);
          if (re) {
            const rs = squareToWorld(move.rookFrom!, PIECE_Y);
            const rt = squareToWorld(move.rookTo, PIECE_Y);
            this.tweens.push({
              delay: 0,
              t: 0,
              dur: 0.42,
              ease: easeInOutCubic,
              onUpdate: (k) =>
                re.group.position.set(
                  rs.x + (rt.x - rs.x) * k,
                  PIECE_Y,
                  rs.z + (rt.z - rs.z) * k,
                ),
            });
          }
        }
      }

      // Main slide / hop.
      this.tweens.push({
        delay: 0,
        t: 0,
        dur,
        ease: easeInOutCubic,
        onUpdate: (k) => {
          entry.group.position.set(
            start.x + (end.x - start.x) * k,
            PIECE_Y + arc * Math.sin(Math.PI * k),
            start.z + (end.z - start.z) * k,
          );
        },
        onDone: () => {
          entry.group.position.copy(end);
          const finalType = moverPiece.type;
          if (finalType !== entry.type) {
            // Morph or promotion: swap mesh + effects.
            if (result.morph) {
              this.vfx.spawnMorph(end);
              this.flash(end, 0x7fd0ff);
            } else {
              this.vfx.spawnCapture(end); // promotion sparkle
              this.flash(end, 0xffcf6a);
            }
            this.swapType(entry, finalType);
            window.setTimeout(resolve, 180);
          } else {
            resolve();
          }
        },
      });
    });
  }

  private killEntry(id: number, entry: Entry, delay: number): void {
    const g = entry.group;
    const y0 = g.position.y;
    this.tweens.push({
      delay,
      t: 0,
      dur: 0.34,
      ease: easeInOutCubic,
      onUpdate: (k) => {
        g.position.y = y0 - k * 0.5;
        g.scale.setScalar(1 - k);
        g.rotation.y += 0.12;
      },
      onDone: () => {
        this.group.remove(g);
      },
    });
    this.entries.delete(id);
  }

  private flash(pos: THREE.Vector3, color: number): void {
    const light = new THREE.PointLight(color, 0, 4, 2);
    light.position.set(pos.x, pos.y + 0.6, pos.z);
    this.group.add(light);
    this.flashes.push({ light, t: 0, dur: 0.5 });
  }

  update(dt: number): void {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      if (tw.delay > 0) {
        tw.delay -= dt;
        continue;
      }
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.onUpdate(tw.ease(k));
      if (k >= 1) {
        tw.onDone?.();
        this.tweens.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const k = f.t / f.dur;
      f.light.intensity = Math.sin(Math.min(1, k) * Math.PI) * 6;
      if (k >= 1) {
        this.group.remove(f.light);
        this.flashes.splice(i, 1);
      }
    }
  }

  get animating(): boolean {
    return this.tweens.length > 0;
  }

  /** World position of a piece by id (for camera focus etc.). */
  positionOf(id: number): THREE.Vector3 | null {
    return this.entries.get(id)?.group.position.clone() ?? null;
  }

  groupOf(id: number): THREE.Group | null {
    return this.entries.get(id)?.group ?? null;
  }

  /** Nearest piece id hit by the ray, or null. */
  pickPieceId(raycaster: THREE.Raycaster): number | null {
    let bestId: number | null = null;
    let bestDist = Infinity;
    for (const [id, entry] of this.entries) {
      const hits = raycaster.intersectObject(entry.group, true);
      if (hits.length && hits[0].distance < bestDist) {
        bestDist = hits[0].distance;
        bestId = id;
      }
    }
    return bestId;
  }
}
