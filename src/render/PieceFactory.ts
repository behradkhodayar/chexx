import * as THREE from 'three';
import { PieceType } from '../chess/types';
import { PieceMaterials } from './materials';

type MatKey = 'body' | 'accent';
interface Part {
  geometry: THREE.BufferGeometry;
  mat: MatKey;
  pos?: [number, number, number];
  rot?: [number, number, number];
}

const V = (x: number, y: number) => new THREE.Vector2(x, y);
const SEG = 56;

// Shared collar/base profile every piece grows out of (axis x = radius).
const BASE: THREE.Vector2[] = [
  V(0, 0),
  V(0.345, 0),
  V(0.345, 0.05),
  V(0.31, 0.085),
  V(0.265, 0.12),
  V(0.205, 0.16),
];

function lathe(points: THREE.Vector2[]): THREE.LatheGeometry {
  const g = new THREE.LatheGeometry(points, SEG);
  g.computeVertexNormals();
  return g;
}

/** Builds and caches the per-type part list. Geometry is side-independent. */
export class PieceFactory {
  private cache = new Map<PieceType, Part[]>();

  private parts(type: PieceType): Part[] {
    let p = this.cache.get(type);
    if (!p) {
      p = this.build(type);
      this.cache.set(type, p);
    }
    return p;
  }

  /** Instantiate a piece Group using a side's materials. */
  create(type: PieceType, mats: PieceMaterials): THREE.Group {
    const group = new THREE.Group();
    for (const part of this.parts(type)) {
      const mesh = new THREE.Mesh(
        part.geometry,
        part.mat === 'body' ? mats.body : mats.accent,
      );
      if (part.pos) mesh.position.set(...part.pos);
      if (part.rot) mesh.rotation.set(...part.rot);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    group.userData.pieceType = type;
    return group;
  }

  private build(type: PieceType): Part[] {
    switch (type) {
      case 'p':
        return this.pawn();
      case 'r':
        return this.rook();
      case 'n':
        return this.knight();
      case 'b':
        return this.bishop();
      case 'q':
        return this.queen();
      case 'k':
        return this.king();
    }
  }

  private pawn(): Part[] {
    const pts = [
      ...BASE,
      V(0.135, 0.2),
      V(0.12, 0.29),
      V(0.165, 0.34),
      V(0.105, 0.375),
      V(0.175, 0.43),
      V(0.185, 0.49),
      V(0.155, 0.55),
      V(0.095, 0.6),
      V(0, 0.63),
    ];
    return [{ geometry: lathe(pts), mat: 'body' }];
  }

  private rook(): Part[] {
    const pts = [
      ...BASE,
      V(0.17, 0.2),
      V(0.18, 0.27),
      V(0.2, 0.42),
      V(0.225, 0.54),
      V(0.225, 0.58),
      V(0.27, 0.585),
      V(0.27, 0.64),
      V(0.205, 0.66),
      V(0.205, 0.7),
      V(0, 0.7),
    ];
    const parts: Part[] = [{ geometry: lathe(pts), mat: 'body' }];
    // Crenellation merlons around the top rim.
    const merlon = new THREE.BoxGeometry(0.085, 0.09, 0.11);
    const count = 6;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      parts.push({
        geometry: merlon,
        mat: 'body',
        pos: [Math.cos(a) * 0.205, 0.72, Math.sin(a) * 0.205],
        rot: [0, -a, 0],
      });
    }
    return parts;
  }

  private bishop(): Part[] {
    const pts = [
      ...BASE,
      V(0.15, 0.2),
      V(0.14, 0.27),
      V(0.158, 0.35),
      V(0.17, 0.45),
      V(0.152, 0.53),
      V(0.105, 0.59),
      V(0.165, 0.63),
      V(0.13, 0.67),
      V(0.1, 0.71),
      V(0.138, 0.78),
      V(0.118, 0.86),
      V(0.07, 0.92),
      V(0.03, 0.97),
      V(0, 1.0),
    ];
    const parts: Part[] = [{ geometry: lathe(pts), mat: 'body' }];
    // Finial bead at the tip.
    parts.push({
      geometry: new THREE.SphereGeometry(0.045, 20, 16),
      mat: 'accent',
      pos: [0, 1.03, 0],
    });
    // Characteristic mitre slit (thin recessed wedge).
    const slit = new THREE.BoxGeometry(0.05, 0.2, 0.34);
    parts.push({ geometry: slit, mat: 'accent', pos: [0, 0.84, 0] });
    return parts;
  }

  private knight(): Part[] {
    // Lathe pedestal/neck up to a flat top.
    const pts = [
      ...BASE,
      V(0.165, 0.2),
      V(0.155, 0.3),
      V(0.175, 0.39),
      V(0.15, 0.43),
      V(0, 0.43),
    ];
    const parts: Part[] = [{ geometry: lathe(pts), mat: 'body' }];

    // Stylized horse head as an extruded silhouette (faces +X).
    const s = new THREE.Shape();
    const path: [number, number][] = [
      [-0.2, 0.0],
      [-0.245, 0.2],
      [-0.205, 0.34],
      [-0.18, 0.41],
      [-0.2, 0.52],
      [-0.1, 0.45],
      [-0.06, 0.55],
      [-0.015, 0.44],
      [0.12, 0.42],
      [0.24, 0.35],
      [0.32, 0.24],
      [0.28, 0.15],
      [0.16, 0.15],
      [0.1, 0.2],
      [0.02, 0.13],
      [-0.05, 0.03],
    ];
    s.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) s.lineTo(path[i][0], path[i][1]);
    s.closePath();
    const head = new THREE.ExtrudeGeometry(s, {
      depth: 0.24,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 3,
      steps: 1,
    });
    head.translate(0, 0, -0.12); // center across Z
    head.computeVertexNormals();
    parts.push({ geometry: head, mat: 'body', pos: [0, 0.43, 0] });

    // Eye accent.
    parts.push({
      geometry: new THREE.SphereGeometry(0.028, 14, 12),
      mat: 'accent',
      pos: [0.12, 0.83, 0.13],
    });
    parts.push({
      geometry: new THREE.SphereGeometry(0.028, 14, 12),
      mat: 'accent',
      pos: [0.12, 0.83, -0.13],
    });
    return parts;
  }

  private queen(): Part[] {
    const pts = [
      ...BASE,
      V(0.158, 0.22),
      V(0.142, 0.3),
      V(0.152, 0.42),
      V(0.16, 0.56),
      V(0.15, 0.66),
      V(0.112, 0.74),
      V(0.175, 0.8),
      V(0.205, 0.87),
      V(0.21, 0.91),
      V(0.15, 0.93),
      V(0.1, 0.95),
      V(0, 0.97),
    ];
    const parts: Part[] = [{ geometry: lathe(pts), mat: 'body' }];
    // Coronet of beads.
    const bead = new THREE.SphereGeometry(0.045, 16, 14);
    const count = 8;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      parts.push({
        geometry: bead,
        mat: 'accent',
        pos: [Math.cos(a) * 0.2, 0.93, Math.sin(a) * 0.2],
      });
    }
    // Center finial.
    parts.push({
      geometry: new THREE.SphereGeometry(0.06, 18, 16),
      mat: 'accent',
      pos: [0, 1.0, 0],
    });
    return parts;
  }

  private king(): Part[] {
    const pts = [
      ...BASE,
      V(0.162, 0.22),
      V(0.146, 0.32),
      V(0.156, 0.46),
      V(0.17, 0.6),
      V(0.16, 0.72),
      V(0.12, 0.8),
      V(0.185, 0.86),
      V(0.216, 0.92),
      V(0.216, 0.96),
      V(0.16, 0.98),
      V(0, 1.0),
    ];
    const parts: Part[] = [{ geometry: lathe(pts), mat: 'body' }];
    // Crown cross.
    const vert = new THREE.BoxGeometry(0.07, 0.22, 0.07);
    const horiz = new THREE.BoxGeometry(0.18, 0.07, 0.07);
    parts.push({ geometry: vert, mat: 'accent', pos: [0, 1.12, 0] });
    parts.push({ geometry: horiz, mat: 'accent', pos: [0, 1.12, 0] });
    return parts;
  }
}
