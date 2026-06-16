import * as THREE from 'three';
import { Move, Square, file, rank, squareOf } from '../chess/types';
import { BoardMaterials, makeBoardMaterials, makeHighlightMaterials } from './materials';
import { SQUARE, squareToWorld } from './coords';

/** Renders the board plinth, tiles, frame, coordinates and all highlight overlays. */
export class BoardView {
  readonly group = new THREE.Group();
  private mats: BoardMaterials;
  private hi = makeHighlightMaterials();

  private selectRing: THREE.Mesh;
  private hoverPlane: THREE.Mesh;
  private checkPlane: THREE.Mesh;
  private lastFrom: THREE.Mesh;
  private lastTo: THREE.Mesh;
  private movePool: THREE.Mesh[] = [];
  private moveActive = 0;

  constructor() {
    this.mats = makeBoardMaterials();
    this.buildPlinth();
    this.buildTiles();
    this.buildCoordinates();

    // Selection glow ring.
    this.selectRing = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.46, 40),
      this.hi.select,
    );
    this.selectRing.rotation.x = -Math.PI / 2;
    this.selectRing.position.y = 0.05;
    this.selectRing.visible = false;
    this.group.add(this.selectRing);

    this.hoverPlane = this.makeSquarePlane(this.hi.hover);
    this.checkPlane = this.makeSquarePlane(this.hi.check);
    this.lastFrom = this.makeSquarePlane(this.hi.lastMove);
    this.lastTo = this.makeSquarePlane(this.hi.lastMove);

    // Pool of move indicators (discs / capture rings share geometry sets).
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), this.hi.move);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.05;
      m.visible = false;
      this.movePool.push(m);
      this.group.add(m);
    }
  }

  private makeSquarePlane(mat: THREE.Material): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(SQUARE, SQUARE), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.044;
    m.visible = false;
    this.group.add(m);
    return m;
  }

  private buildPlinth(): void {
    const border = 0.62;
    const span = 8 * SQUARE + border * 2;
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(span, 0.5, span),
      this.mats.frame,
    );
    plinth.position.y = -0.26;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    this.group.add(plinth);

    // Gold inlay rim hugging the playfield edge.
    const inner = 8 * SQUARE + 0.08;
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(inner + 0.12, 0.04, inner + 0.12),
      this.mats.inlay,
    );
    const innerHole = new THREE.Mesh(
      new THREE.BoxGeometry(inner, 0.06, inner),
      this.mats.frame,
    );
    rim.position.y = -0.005;
    innerHole.position.y = -0.005;
    this.group.add(rim);
    this.group.add(innerHole);

    // Substrate under tiles for grout lines.
    const sub = new THREE.Mesh(
      new THREE.BoxGeometry(8 * SQUARE, 0.1, 8 * SQUARE),
      new THREE.MeshStandardMaterial({ color: 0x05080b, roughness: 0.7 }),
    );
    sub.position.y = -0.05;
    sub.receiveShadow = true;
    this.group.add(sub);
  }

  private buildTiles(): void {
    const tileGeo = new THREE.BoxGeometry(SQUARE * 0.95, 0.08, SQUARE * 0.95);
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const lightSquare = (f + r) % 2 === 1;
        const tile = new THREE.Mesh(
          tileGeo,
          lightSquare ? this.mats.lightSquare : this.mats.darkSquare,
        );
        const p = squareToWorld(squareOf(f, r));
        tile.position.set(p.x, -0.005, p.z);
        tile.receiveShadow = true;
        this.group.add(tile);
      }
    }
  }

  private buildCoordinates(): void {
    const makeLabel = (text: string): THREE.Mesh => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, 64, 64);
      ctx.fillStyle = '#cbb277';
      ctx.font = 'bold 40px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 32, 34);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.32, 0.32),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.011;
      return m;
    };
    const edge = 4 * SQUARE + 0.3;
    for (let f = 0; f < 8; f++) {
      const x = (f - 3.5) * SQUARE;
      const lbl = makeLabel('abcdefgh'[f]);
      lbl.position.set(x, 0.011, edge);
      this.group.add(lbl);
    }
    for (let r = 0; r < 8; r++) {
      const z = (3.5 - r) * SQUARE;
      const lbl = makeLabel(String(r + 1));
      lbl.position.set(-edge, 0.011, z);
      this.group.add(lbl);
    }
  }

  // --- Highlight API ---

  setSelected(sq: Square | null): void {
    if (sq == null) {
      this.selectRing.visible = false;
      return;
    }
    const p = squareToWorld(sq);
    this.selectRing.position.set(p.x, 0.05, p.z);
    this.selectRing.visible = true;
  }

  setHover(sq: Square | null): void {
    this.place(this.hoverPlane, sq);
  }

  setCheck(sq: Square | null): void {
    this.place(this.checkPlane, sq);
  }

  setLastMove(from: Square | null, to: Square | null): void {
    this.place(this.lastFrom, from);
    this.place(this.lastTo, to);
  }

  setLegalMoves(moves: Move[], isCapture: (m: Move) => boolean): void {
    this.moveActive = 0;
    for (const m of moves) {
      const mesh = this.movePool[this.moveActive++];
      if (!mesh) break;
      const p = squareToWorld(m.to);
      mesh.position.set(p.x, 0.05, p.z);
      mesh.material = isCapture(m) ? this.hi.capture : this.hi.move;
      mesh.scale.setScalar(isCapture(m) ? 1.55 : 1);
      mesh.visible = true;
    }
    for (let i = this.moveActive; i < this.movePool.length; i++)
      this.movePool[i].visible = false;
  }

  clearLegalMoves(): void {
    for (const m of this.movePool) m.visible = false;
    this.moveActive = 0;
  }

  private place(mesh: THREE.Mesh, sq: Square | null): void {
    if (sq == null) {
      mesh.visible = false;
      return;
    }
    const p = squareToWorld(sq);
    mesh.position.set(p.x, mesh.position.y, p.z);
    mesh.visible = true;
  }

  /** Pulse animation for selection + check highlights. */
  update(t: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    (this.selectRing.material as THREE.MeshBasicMaterial).opacity =
      0.4 + pulse * 0.5;
    (this.hi.check as THREE.MeshBasicMaterial).opacity = 0.35 + pulse * 0.4;
    for (let i = 0; i < this.moveActive; i++) {
      const m = this.movePool[i];
      const base = m.material === this.hi.capture ? 1.55 : 1;
      m.scale.setScalar(base * (0.9 + pulse * 0.18));
    }
  }

  isLightSquare(sq: Square): boolean {
    return (file(sq) + rank(sq)) % 2 === 1;
  }
}
