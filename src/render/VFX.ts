import * as THREE from 'three';

interface Burst {
  points: THREE.Points;
  vel: Float32Array;
  life: number;
  maxLife: number;
  base: Float32Array;
}
interface Ring {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  from: number;
  to: number;
}

function softParticleTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/** Pooled additive particle bursts + expanding shock rings for morph/capture. */
export class VFX {
  readonly group = new THREE.Group();
  private bursts: Burst[] = [];
  private rings: Ring[] = [];
  private sprite = softParticleTexture();

  spawnMorph(pos: THREE.Vector3): void {
    this.spawnBurst(pos, 46, new THREE.Color(0x7be0ff), new THREE.Color(0xb98cff), 2.4, 0.85);
    this.spawnRing(pos, 0x8fd6ff, 0.7);
    this.spawnRing(pos, 0xc59cff, 0.55);
  }

  spawnCapture(pos: THREE.Vector3): void {
    this.spawnBurst(pos, 36, new THREE.Color(0xffb05a), new THREE.Color(0xff4d5e), 2.8, 0.7);
    this.spawnRing(pos, 0xff6a5a, 0.5);
  }

  spawnSelect(pos: THREE.Vector3): void {
    this.spawnRing(pos, 0x46e0c8, 0.4);
  }

  private spawnBurst(
    pos: THREE.Vector3,
    n: number,
    c1: THREE.Color,
    c2: THREE.Color,
    speed: number,
    maxLife: number,
  ): void {
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const base = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const up = 0.4 + Math.random() * 0.9;
      const dx = Math.sin(phi) * Math.cos(theta);
      const dz = Math.sin(phi) * Math.sin(theta);
      const sp = speed * (0.5 + Math.random() * 0.8);
      vel[i * 3] = dx * sp;
      vel[i * 3 + 1] = up * sp;
      vel[i * 3 + 2] = dz * sp;
      const px = pos.x + dx * 0.1;
      const py = pos.y + 0.4 + Math.random() * 0.3;
      const pz = pos.z + dz * 0.1;
      positions[i * 3] = base[i * 3] = px;
      positions[i * 3 + 1] = base[i * 3 + 1] = py;
      positions[i * 3 + 2] = base[i * 3 + 2] = pz;
      const col = c1.clone().lerp(c2, Math.random());
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.22,
      map: this.sprite,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 1,
    });
    const points = new THREE.Points(geo, mat);
    this.group.add(points);
    this.bursts.push({ points, vel, life: maxLife, maxLife, base });
  }

  private spawnRing(pos: THREE.Vector3, color: number, maxLife: number): void {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.34, 40),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.05, pos.z);
    this.group.add(mesh);
    this.rings.push({ mesh, life: maxLife, maxLife, from: 0.3, to: 1.4 });
  }

  update(dt: number): void {
    // Bursts.
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      const t = 1 - b.life / b.maxLife;
      const pos = b.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let j = 0; j < arr.length; j += 3) {
        b.vel[j + 1] -= 5.5 * dt; // gravity
        arr[j] += b.vel[j] * dt;
        arr[j + 1] += b.vel[j + 1] * dt;
        arr[j + 2] += b.vel[j + 2] * dt;
      }
      pos.needsUpdate = true;
      const mat = b.points.material as THREE.PointsMaterial;
      mat.opacity = Math.max(0, 1 - t);
      mat.size = 0.22 * (1 - t * 0.5);
      if (b.life <= 0) {
        this.group.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
      }
    }
    // Rings.
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const t = 1 - r.life / r.maxLife;
      const s = r.from + (r.to - r.from) * t;
      r.mesh.scale.setScalar(s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - t));
      if (r.life <= 0) {
        this.group.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }
  }
}
