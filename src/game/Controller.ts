import * as THREE from 'three';
import { chooseAIMove } from '../chess/ai';
import { ChexxGame } from '../chess/game';
import { RNG } from '../chess/rng';
import { Color, Move, PieceType, Square } from '../chess/types';
import { AudioEngine } from '../audio/AudioEngine';
import { BoardView } from '../render/BoardView';
import { PieceManager } from '../render/Pieces';
import { SceneManager } from '../render/SceneManager';
import { VFX } from '../render/VFX';
import { squareToWorld, worldToSquare } from '../render/coords';
import { Hud } from '../ui/Hud';
import { Menu } from '../ui/Menu';
import { MatchConfig } from '../ui/types';

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** Orchestrates logic, rendering, input, audio and UI for one running session. */
export class Controller {
  private scene: SceneManager;
  private board: BoardView;
  private pieces: PieceManager;
  private vfx: VFX;
  private audio: AudioEngine;
  private hud: Hud;
  private menu: Menu;

  private game: ChexxGame | null = null;
  private config: MatchConfig | null = null;
  private aiRng = new RNG(12345);

  private selected: Square | null = null;
  private selMoves: Move[] = [];
  private busy = false;
  private running = false;
  private lost: Record<Color, PieceType[]> = { w: [], b: [] };

  // Camera orbit / input state.
  private pointers = new Map<number, { x: number; y: number }>();
  private dragId: number | null = null;
  private dragMoved = false;
  private lastX = 0;
  private lastY = 0;
  private pinchDist = 0;
  private targetAzimuth = 0;

  private raycaster = new THREE.Raycaster();
  private clock = new THREE.Clock();
  private fpsEMA = 60;
  private diagTimer = 0;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.scene = new SceneManager(canvas);
    this.vfx = new VFX();
    this.board = new BoardView();
    this.pieces = new PieceManager(this.vfx);
    this.scene.scene.add(this.board.group, this.pieces.group, this.vfx.group);

    this.audio = new AudioEngine();
    this.hud = new Hud(ui);
    this.menu = new Menu(
      ui,
      () => this.audio.hover(),
      () => {
        this.audio.resume();
        this.audio.click();
      },
    );
    this.hud.hide();

    this.wireUI();
    this.bindInput(canvas);
    window.addEventListener('resize', () => this.scene.resize());

    this.menu.showMenu(false);
    this.clock.start();
    this.loop();

    this.exposeDebug();
  }

  /** Headless QA/automation hooks (also handy for manual debugging). */
  private exposeDebug(): void {
    (window as unknown as { __chexx: unknown }).__chexx = {
      start: (cfg?: Partial<MatchConfig>) =>
        this.startMatch({
          mode: 'local',
          difficulty: 2,
          cap: 54,
          capId: 'classic',
          humanColor: 'w',
          ...cfg,
        }),
      auto: () => this.debugAutoMove(),
      step: () => this.debugStep(),
      project: (sq: number) => {
        const w = squareToWorld(sq, 0.04).project(this.scene.camera);
        return {
          x: (w.x * 0.5 + 0.5) * window.innerWidth,
          y: (-w.y * 0.5 + 0.5) * window.innerHeight,
        };
      },
      sel: () => ({ selected: this.selected, moves: this.selMoves.length, busy: this.busy }),
      select: (sq: number) => {
        if (this.game && this.game.board.get(sq)?.color === this.game.turn)
          this.select(sq);
      },
      over: () =>
        this.menu.showGameOver(
          'Checkmate',
          'You win — the transmutation favoured you.',
          '♚',
        ),
      cam: (d?: number, p?: number, az?: number) => {
        if (d !== undefined) this.scene.distance = d;
        if (p !== undefined) this.scene.polar = p;
        if (az !== undefined) {
          this.scene.azimuth = az;
          this.targetAzimuth = az;
        }
        this.scene.updateCamera();
      },
      state: () =>
        this.game
          ? {
              turn: this.game.turn,
              status: this.game.status,
              ply: this.game.history.length,
              materialW: this.game.material('w'),
              materialB: this.game.material('b'),
              running: this.running,
              busy: this.busy,
            }
          : null,
    };
  }

  /**
   * Logic-only random move: apply to the engine and resync the board visuals
   * instantly (no animation). Independent of the render loop so headless QA
   * never blocks on rAF/GPU timing.
   */
  private debugStep(): { morph: boolean; gameOver: boolean; ply: number } | null {
    if (!this.game || !this.running) return null;
    const moves = this.game.legalMoves();
    if (!moves.length) return null;
    const mv = moves[Math.floor(Math.random() * moves.length)];
    const mover = this.game.turn;
    const ply = this.game.history.length;
    const result = this.game.applyMove(mv);
    if (result.captured) this.lost[result.captured.color].push(result.captured.type);
    this.pieces.buildFromBoard(this.game.board);
    this.board.setLastMove(mv.from, mv.to);
    this.board.setCheck(result.check ? this.game.board.findKing(this.game.turn) : null);
    this.hud.setCaptured('w', this.lost.w);
    this.hud.setCaptured('b', this.lost.b);
    this.hud.addLog(ply, this.game.history[this.game.history.length - 1].san, mover);
    this.refreshHud();
    if (this.game.isGameOver()) this.endGame();
    return { morph: !!result.morph, gameOver: this.game.isGameOver(), ply: ply + 1 };
  }

  /** Play a random legal move for the side to move (QA only). */
  private async debugAutoMove(): Promise<{ morph: boolean; gameOver: boolean } | null> {
    if (!this.game || !this.running || this.busy) return null;
    const moves = this.game.legalMoves();
    if (!moves.length) return null;
    const mv = moves[Math.floor(Math.random() * moves.length)];
    const willMorph = this.game.board.get(mv.from);
    void willMorph;
    await this.executeMove(mv);
    const last = this.game.history[this.game.history.length - 1];
    return { morph: !!last?.result.morph, gameOver: this.game.isGameOver() };
  }

  private wireUI(): void {
    this.menu.onStart = (cfg) => {
      this.audio.resume();
      this.audio.setAmbient(true);
      this.startMatch(cfg);
    };
    this.menu.onResume = () => {
      this.menu.hide();
      this.hud.show();
    };
    this.hud.onMenu = () => {
      this.menu.showMenu(true);
      this.hud.hide();
    };
    this.hud.onSound = () => {
      this.audio.resume();
      const m = !this.audio.muted;
      this.audio.setMuted(m);
      this.hud.setMuted(m);
    };
    this.hud.onFlip = () => {
      this.audio.click();
      this.targetAzimuth += Math.PI;
    };
    this.hud.onHint = () => this.menu.showHelp();
  }

  // --- Match lifecycle ---

  private startMatch(cfg: MatchConfig): void {
    this.config = cfg;
    this.game = new ChexxGame({ cap: cfg.cap, seed: (Date.now() & 0xffffff) || 7 });
    this.lost = { w: [], b: [] };
    this.selected = null;
    this.selMoves = [];
    this.busy = false;
    this.running = true;

    this.pieces.buildFromBoard(this.game.board);
    this.board.setSelected(null);
    this.board.clearLegalMoves();
    this.board.setLastMove(null, null);
    this.board.setCheck(null);

    this.hud.clearLog();
    this.hud.setCap(cfg.cap);
    this.hud.show();
    this.menu.hide();
    this.menu.setResumable(true);

    // Camera perspective + framing: human side faces the player.
    this.targetAzimuth = cfg.mode === 'ai' && cfg.humanColor === 'b' ? Math.PI : 0;
    this.scene.azimuth = this.targetAzimuth;
    this.scene.distance = 12.6;
    this.scene.polar = 1.0;
    this.scene.updateCamera();

    this.refreshHud();
    this.audio.start();

    // If the human plays Black vs AI, the engine (White) opens.
    if (this.isAITurn()) this.scheduleAI();
  }

  private isAITurn(): boolean {
    if (!this.game || !this.config || this.config.mode !== 'ai') return false;
    return this.game.turn !== this.config.humanColor;
  }

  private refreshHud(): void {
    if (!this.game) return;
    this.hud.setMaterial('w', this.game.material('w'));
    this.hud.setMaterial('b', this.game.material('b'));
    const turn = this.game.turn;
    const label =
      this.game.status === 'check'
        ? `${turn === 'w' ? 'White' : 'Black'} in check`
        : `${turn === 'w' ? 'White' : 'Black'} to move`;
    this.hud.setTurn(turn, label);
  }

  // --- Input ---

  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      this.audio.resume();
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.dragId = e.pointerId;
        this.dragMoved = false;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      } else if (this.pointers.size === 2) {
        this.pinchDist = this.pointerDistance();
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 2) {
        const d = this.pointerDistance();
        if (this.pinchDist > 0) {
          this.scene.distance *= this.pinchDist / d;
          this.scene.updateCamera();
        }
        this.pinchDist = d;
        return;
      }
      if (e.pointerId !== this.dragId) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.dragMoved = true;
      if (this.dragMoved) {
        this.scene.azimuth -= dx * 0.01;
        this.targetAzimuth = this.scene.azimuth;
        this.scene.polar -= dy * 0.008;
        this.scene.updateCamera();
      }
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });

    const endPointer = (e: PointerEvent) => {
      const wasDrag = this.dragMoved;
      const isPrimary = e.pointerId === this.dragId;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
      if (isPrimary) {
        this.dragId = null;
        if (!wasDrag) this.handleTap(e);
      }
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', (e) => {
      this.pointers.delete(e.pointerId);
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.scene.distance *= 1 + Math.sign(e.deltaY) * 0.08;
        this.scene.updateCamera();
      },
      { passive: false },
    );
  }

  private pointerDistance(): number {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  private handleTap(e: PointerEvent): void {
    if (!this.game || this.busy || !this.running) return;
    if (this.isAITurn()) return;

    const ndc = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.scene.camera);

    // Resolve the tapped square. The board plane is the primary source of truth:
    // pointing at a square always selects that square, regardless of which (often
    // taller, foreground) piece mesh happens to occlude it from this camera angle.
    // Mesh picking is only a fallback for taps that land beyond the board plane
    // (e.g. a tall piece silhouette near the far edge).
    let sq = -1;
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(GROUND, hit)) {
      sq = worldToSquare(hit);
    }
    if (sq < 0) {
      const pieceId = this.pieces.pickPieceId(this.raycaster);
      if (pieceId != null) sq = this.squareOfId(pieceId);
    }
    if (sq < 0) {
      this.deselect();
      return;
    }
    this.onSquare(sq);
  }

  private onSquare(sq: Square): void {
    if (!this.game) return;
    const piece = this.game.board.get(sq);

    if (this.selected != null) {
      const mv = this.selMoves.find((m) => m.to === sq);
      if (mv) {
        void this.playHumanMove(mv);
        return;
      }
    }
    if (piece && piece.color === this.game.turn && this.humanControls(piece.color)) {
      this.select(sq);
    } else {
      this.deselect();
    }
  }

  private humanControls(color: Color): boolean {
    if (!this.config) return false;
    if (this.config.mode === 'local') return true;
    return color === this.config.humanColor;
  }

  private select(sq: Square): void {
    if (!this.game) return;
    this.selected = sq;
    this.selMoves = this.game.legalMovesFrom(sq);
    this.board.setSelected(sq);
    this.board.setLegalMoves(this.selMoves, (m) => this.isCaptureMove(m));
    this.vfx.spawnSelect(squareToWorld(sq, 0.04));
    this.audio.select();
  }

  private deselect(): void {
    this.selected = null;
    this.selMoves = [];
    this.board.setSelected(null);
    this.board.clearLegalMoves();
  }

  private isCaptureMove(m: Move): boolean {
    if (!this.game) return false;
    return !!this.game.board.get(m.to) || m.enPassant !== undefined;
  }

  // --- Turn execution ---

  private async playHumanMove(mv: Move): Promise<void> {
    this.deselect();
    await this.executeMove(mv);
    if (this.running && this.isAITurn()) this.scheduleAI();
  }

  private scheduleAI(): void {
    this.busy = true;
    this.hud.setThinking(true);
    // Defer so the "thinking" indicator paints before the (sync) search.
    window.setTimeout(() => void this.runAI(), 220);
  }

  private async runAI(): Promise<void> {
    if (!this.game || !this.config || !this.running) {
      this.busy = false;
      this.hud.setThinking(false);
      return;
    }
    const move = chooseAIMove(this.game.board, this.game.turn, {
      depth: this.config.difficulty,
      randomness: this.config.difficulty === 1 ? 0.9 : this.config.difficulty === 2 ? 0.35 : 0.08,
      cap: this.config.cap,
      rng: this.aiRng,
    });
    this.hud.setThinking(false);
    if (!move) {
      this.busy = false;
      return;
    }
    await this.executeMove(move);
    // Chained AI is only for AI-vs-AI; here next turn is human.
    if (this.running && this.isAITurn()) this.scheduleAI();
  }

  /** Apply to logic, play animation, sync HUD/audio, then resolve game state. */
  private async executeMove(mv: Move): Promise<void> {
    if (!this.game) return;
    this.busy = true;
    const ply = this.game.history.length;
    const mover = this.game.turn;
    const result = this.game.applyMove(mv);

    // Audio cues.
    if (mv.castle) this.audio.castle();
    else if (result.captured) this.audio.capture();
    else this.audio.move();

    const anim = this.pieces.animateMove(this.game.board, result);

    if (result.morph) {
      window.setTimeout(() => {
        this.audio.morph();
        this.hud.showMorph(mover, result.morph!.from, result.morph!.to);
      }, 380);
    }
    if (result.captured) this.lost[result.captured.color].push(result.captured.type);

    await anim;

    // Update board highlights + HUD.
    this.board.setLastMove(mv.from, mv.to);
    this.hud.setCaptured('w', this.lost.w);
    this.hud.setCaptured('b', this.lost.b);
    this.hud.addLog(ply, this.game.history[this.game.history.length - 1].san, mover);
    this.refreshHud();

    const kingSq = result.check
      ? this.game.board.findKing(this.game.turn)
      : null;
    this.board.setCheck(kingSq);
    if (result.check && !result.checkmate) this.audio.check();

    if (this.game.isGameOver()) {
      this.endGame();
    }
    this.busy = false;
  }

  private endGame(): void {
    if (!this.game) return;
    this.running = false;
    const status = this.game.status;
    let title = 'Draw';
    let sub = '';
    let crest = '½';
    if (status === 'checkmate') {
      const w = this.game.winner()!;
      const won = this.config?.mode === 'ai' ? w === this.config.humanColor : true;
      title = 'Checkmate';
      crest = w === 'w' ? '♔' : '♚';
      sub =
        this.config?.mode === 'ai'
          ? won
            ? 'You win — the transmutation favoured you.'
            : 'The machine prevails. Rematch?'
          : `${w === 'w' ? 'White' : 'Black'} wins the duel.`;
      if (this.config?.mode === 'ai') (won ? this.audio.win() : this.audio.lose());
      else this.audio.win();
    } else if (status === 'stalemate') {
      title = 'Stalemate';
      sub = 'No legal moves — the board locks in a draw.';
      this.audio.lose();
    } else {
      title = 'Draw';
      sub = 'Fifty moves without a capture or pawn move.';
      this.audio.lose();
    }
    window.setTimeout(() => this.menu.showGameOver(title, sub, crest), 700);
  }

  // --- Helpers ---

  private squareOfId(id: number): Square {
    if (!this.game) return -1;
    for (let i = 0; i < 64; i++) {
      const p = this.game.board.get(i);
      if (p && p.id === id) return i;
    }
    return -1;
  }

  // --- Render loop ---

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;

    // Smooth camera azimuth toward target (flip / perspective changes).
    if (Math.abs(this.scene.azimuth - this.targetAzimuth) > 0.001) {
      this.scene.azimuth += (this.targetAzimuth - this.scene.azimuth) * Math.min(1, dt * 6);
      this.scene.updateCamera();
    }

    this.pieces.update(dt);
    this.vfx.update(dt);
    this.board.update(t);
    this.scene.render();

    // Publish renderer diagnostics for the QA inspector (throttled).
    if (dt > 0) this.fpsEMA += (1 / dt - this.fpsEMA) * 0.05;
    this.diagTimer += dt;
    if (this.diagTimer > 0.5) {
      this.diagTimer = 0;
      const info = this.scene.renderer.info;
      (window as unknown as { __THREE_GAME_DIAGNOSTICS__: unknown }).__THREE_GAME_DIAGNOSTICS__ =
        {
          fps: Math.round(this.fpsEMA),
          drawCalls: info.render.calls,
          triangles: info.render.triangles,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          programs: info.programs?.length ?? 0,
          running: this.running,
        };
    }
  };
}
