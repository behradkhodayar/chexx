import * as THREE from 'three';

let _noise: THREE.Texture | null = null;
let _marbleLight: THREE.Texture | null = null;
let _marbleDark: THREE.Texture | null = null;

function valueNoise(
  w: number,
  h: number,
  cells: number,
  seed: number,
): number[][] {
  // Cheap deterministic value-noise grid, bilinearly sampled.
  const rand = (i: number, j: number) => {
    const n = Math.sin(i * 127.1 + j * 311.7 + seed * 13.37) * 43758.5453;
    return n - Math.floor(n);
  };
  const grid: number[][] = [];
  for (let y = 0; y <= cells; y++) {
    grid[y] = [];
    for (let x = 0; x <= cells; x++) grid[y][x] = rand(x, y);
  }
  const out: number[][] = [];
  for (let y = 0; y < h; y++) {
    out[y] = [];
    const gy = (y / h) * cells;
    const y0 = Math.floor(gy);
    const fy = gy - y0;
    for (let x = 0; x < w; x++) {
      const gx = (x / w) * cells;
      const x0 = Math.floor(gx);
      const fx = gx - x0;
      const a = grid[y0][x0];
      const b = grid[y0][x0 + 1];
      const c = grid[y0 + 1][x0];
      const d = grid[y0 + 1][x0 + 1];
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      out[y][x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    }
  }
  return out;
}

/** Subtle grayscale roughness/detail noise reused across piece materials. */
export function noiseRoughness(): THREE.Texture {
  if (_noise) return _noise;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const n1 = valueNoise(size, size, 16, 1);
  const n2 = valueNoise(size, size, 48, 2);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = 0.62 + (n1[y][x] - 0.5) * 0.3 + (n2[y][x] - 0.5) * 0.14;
      const g = Math.max(0, Math.min(255, v * 255));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  _noise = tex;
  return tex;
}

/** Veined marble texture for board squares. `light` toggles cream vs slate. */
export function marble(light: boolean): THREE.Texture {
  const cached = light ? _marbleLight : _marbleDark;
  if (cached) return cached;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const base = valueNoise(size, size, 6, light ? 3 : 7);
  const veins = valueNoise(size, size, 22, light ? 11 : 17);
  const img = ctx.createImageData(size, size);
  const baseCol = light
    ? { r: 0xc4, g: 0xb6, b: 0x93 }
    : { r: 0x21, g: 0x29, b: 0x31 };
  const veinCol = light
    ? { r: 0xa3, g: 0x92, b: 0x6c }
    : { r: 0x0d, g: 0x11, b: 0x15 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const b = base[y][x];
      const v = Math.pow(Math.abs(veins[y][x] - 0.5) * 2, 2.2);
      const t = Math.min(1, v * 0.9 + (b - 0.5) * 0.25);
      const i = (y * size + x) * 4;
      img.data[i] = baseCol.r + (veinCol.r - baseCol.r) * t;
      img.data[i + 1] = baseCol.g + (veinCol.g - baseCol.g) * t;
      img.data[i + 2] = baseCol.b + (veinCol.b - baseCol.b) * t;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (light) _marbleLight = tex;
  else _marbleDark = tex;
  return tex;
}
