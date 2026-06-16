import * as THREE from 'three';
import { Color } from '../chess/types';
import { marble, noiseRoughness } from './textures';

export interface PieceMaterials {
  body: THREE.MeshPhysicalMaterial;
  accent: THREE.MeshStandardMaterial; // emissive trim, animated on morph
}

/** Build the polished material set for one side. Light = pearl, dark = onyx. */
export function makePieceMaterials(color: Color): PieceMaterials {
  const rough = noiseRoughness();
  const light = color === 'w';
  const body = new THREE.MeshPhysicalMaterial({
    color: light ? 0xd6c6a1 : 0x20262f,
    roughness: light ? 0.45 : 0.26,
    metalness: light ? 0.0 : 0.12,
    roughnessMap: rough,
    clearcoat: light ? 0.35 : 0.85,
    clearcoatRoughness: light ? 0.4 : 0.18,
    sheen: light ? 0.25 : 0.4,
    sheenColor: new THREE.Color(light ? 0xe9dcc0 : 0x3a4a63),
    sheenRoughness: 0.6,
    envMapIntensity: light ? 0.7 : 1.0,
    reflectivity: 0.4,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: light ? 0xbf9a52 : 0x6fa8ff,
    metalness: 0.9,
    roughness: 0.28,
    emissive: new THREE.Color(light ? 0x000000 : 0x000000),
    emissiveIntensity: 0,
  });
  return { body, accent };
}

export interface BoardMaterials {
  lightSquare: THREE.MeshPhysicalMaterial;
  darkSquare: THREE.MeshPhysicalMaterial;
  frame: THREE.MeshPhysicalMaterial;
  inlay: THREE.MeshStandardMaterial;
}

export function makeBoardMaterials(): BoardMaterials {
  const lightSquare = new THREE.MeshPhysicalMaterial({
    map: marble(true),
    roughness: 0.42,
    metalness: 0.0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.38,
    envMapIntensity: 0.6,
  });
  const darkSquare = new THREE.MeshPhysicalMaterial({
    map: marble(false),
    roughness: 0.26,
    metalness: 0.08,
    clearcoat: 0.6,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1.0,
  });
  const frame = new THREE.MeshPhysicalMaterial({
    color: 0x1a120b,
    roughness: 0.36,
    metalness: 0.25,
    clearcoat: 0.7,
    clearcoatRoughness: 0.3,
    envMapIntensity: 1.1,
  });
  const inlay = new THREE.MeshStandardMaterial({
    color: 0xb88a3a,
    metalness: 0.95,
    roughness: 0.32,
    emissive: 0x2a1d08,
    emissiveIntensity: 0.4,
  });
  return { lightSquare, darkSquare, frame, inlay };
}

/** Glowing highlight materials (selection, moves, captures, check, last move). */
export function makeHighlightMaterials() {
  return {
    select: new THREE.MeshBasicMaterial({
      color: 0x46e0c8,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    move: new THREE.MeshBasicMaterial({
      color: 0x39d98a,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    capture: new THREE.MeshBasicMaterial({
      color: 0xff5d6c,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    lastMove: new THREE.MeshBasicMaterial({
      color: 0x4ea8ff,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    check: new THREE.MeshBasicMaterial({
      color: 0xff3b46,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    hover: new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  };
}
