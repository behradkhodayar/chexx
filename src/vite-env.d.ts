/// <reference types="vite/client" />

interface ChexxDiagnostics {
  fps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  running: boolean;
}

interface ChexxState {
  turn: 'w' | 'b';
  status: string;
  ply: number;
  materialW: number;
  materialB: number;
  running: boolean;
  busy: boolean;
}

interface ChexxDebug {
  start: (cfg?: Record<string, unknown>) => void;
  auto: () => Promise<{ morph: boolean; gameOver: boolean } | null>;
  step: () => { morph: boolean; gameOver: boolean; ply: number } | null;
  select: (sq: number) => void;
  over: () => void;
  cam: (d?: number, p?: number, az?: number) => void;
  project: (sq: number) => { x: number; y: number };
  sel: () => { selected: number | null; moves: number; busy: boolean };
  state: () => ChexxState | null;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ChexxDiagnostics;
  __chexx?: ChexxDebug;
}
