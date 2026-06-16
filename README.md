<div align="center">

# ♞ CHEXX

### Chess, transmuted.

A premium 3D browser chess game where **every move rewrites the board**. Built from scratch with Three.js + TypeScript.

</div>

---

## What is Chexx?

Chexx plays like classic chess in almost every way — the same pieces, the same
board, check, checkmate, castling, en passant and promotion all work exactly as
you expect. **One rule changes everything:**

> Whenever a **Knight, Bishop, Rook or Queen** finishes a move, it instantly
> **transmutes** into a *different* Minor or Major piece, chosen at random. It
> then moves by the rules of its new type next time.

Pawns and Kings are stable — they never transmute.

To stop the board collapsing into an army of Queens, both sides share a single
**material cap** (shown at the top of the screen). A transmutation is only
allowed if it keeps that side's total piece value at or under the cap. So a
Queen you push forward might shrink to a Knight; a Knight you develop might
bloom into a Rook. **Position matters more than the piece in your hand.**

There is almost no luck in normal chess beyond choosing sides. Chexx threads a
controlled dose of chance through every single move while keeping both armies
balanced.

---

## For players

### Play

The game runs entirely in the browser — no install, no account.

- **Modes:** vs Computer (Novice / Skilled / Master) or 2-player hotseat.
- **Play as** White or Black against the AI.
- **Material cap presets:** Standard (46) · Classic (54) · Wild (72). Both armies
  start at 39 points of material; the cap is the shared ceiling.

### Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Select a piece | Click it | Tap it |
| Move | Click a highlighted square | Tap a highlighted square |
| Orbit the camera | Drag | One-finger drag |
| Zoom | Mouse wheel | Pinch |
| Flip the board | ⟲ button | ⟲ button |
| Mute / unmute | ♪ button | ♪ button |
| Rules reference | ? button | ? button |

Green dots mark quiet moves, red rings mark captures, a cyan ring marks your
selection, and a flash of particles marks each transmutation.

### Run it locally

You need [Node.js](https://nodejs.org) **20.19+** (or 22.12+).

```bash
git clone https://github.com/behradkhodayar/chexx.git
cd chexx
npm install
npm run dev
```

Then open the printed URL (default <http://127.0.0.1:5188/>).

To build and preview the optimised production bundle:

```bash
npm run build
npm run preview   # serves the dist/ build at http://127.0.0.1:4188/
```

The build uses a **relative base path**, so the contents of `dist/` can be
dropped onto any static host (GitHub Pages project sites, itch.io, Netlify, an
S3 prefix, …) without further configuration.

---

## For developers

Chexx is a plain Vite + TypeScript app with **no game framework** — just
Three.js and a clean separation between game logic, rendering, UI and audio. The
chess engine is completely decoupled from the renderer and has no DOM or Three.js
dependencies, which makes it easy to test and reason about.

### Tech stack

- **Three.js** — rendering, lighting, post-processing (bloom, ACES tonemapping).
- **TypeScript** (strict) + **Vite** — build and dev server.
- **Web Audio API** — all sound effects and ambience are synthesised at runtime
  (no external audio files).
- **Playwright** — browser-driven regression and visual tests.
- All visual assets are **procedural** (lathe/extrude geometry, canvas-generated
  marble and noise textures, an image-based environment) — there are no binary
  model or texture assets to manage.

### Project layout

```
chexx-game/
├─ index.html              # canvas + UI mount + boot splash
├─ src/
│  ├─ main.ts              # entry point — boots the Controller
│  ├─ chess/               # pure game engine (no rendering)
│  │  ├─ types.ts          #   pieces, colours, squares, values, MORPH_TYPES
│  │  ├─ board.ts          #   64-square board state + helpers
│  │  ├─ moves.ts          #   move generation, attacks, check, castling, EP
│  │  ├─ game.ts           #   ChexxGame: morph-on-move + shared cap + status
│  │  ├─ ai.ts             #   negamax + alpha-beta with expected-morph eval
│  │  ├─ rng.ts            #   seedable PRNG (reproducible morphs)
│  │  └─ perft.ts          #   move-tree node counter (correctness oracle)
│  ├─ render/              # everything Three.js
│  │  ├─ SceneManager.ts   #   renderer, camera, lights, IBL, post pipeline
│  │  ├─ PieceFactory.ts   #   procedural Staunton piece geometry
│  │  ├─ BoardView.ts      #   board, frame, coordinates, highlight overlays
│  │  ├─ Pieces.ts         #   piece meshes + move/morph/capture animations
│  │  ├─ VFX.ts            #   particle bursts + shock rings
│  │  ├─ materials.ts      #   shared PBR materials
│  │  ├─ textures.ts       #   canvas marble + value-noise generators
│  │  └─ coords.ts         #   square ⇄ world-position mapping
│  ├─ ui/                  # DOM overlays
│  │  ├─ Menu.ts           #   title, settings, help, game-over
│  │  ├─ Hud.ts            #   turn, material-vs-cap bars, captures, move log
│  │  └─ types.ts          #   shared UI types + piece glyphs
│  ├─ audio/AudioEngine.ts # synthesised SFX + ambient pad
│  ├─ game/Controller.ts   # orchestrator: input, turn flow, AI, animation, UI
│  └─ styles.css           # the entire UI theme
├─ scripts/
│  ├─ inspect-threejs-canvas.mjs  # canvas non-blank + diagnostics probe
│  └─ qa-drive.mjs                # drives the real UI, captures screenshots
└─ tests/visual.spec.ts    # Playwright regression test
```

### How a turn flows

1. The player (or AI) chooses a `Move`. `ChexxGame.applyMove` mutates the board,
   resolves any capture, then — if the moved piece *started* the move as a
   Minor/Major type — runs the transmutation, picking a random new type that
   keeps the side under the cap.
2. `Controller` plays the visual sequence via `PieceManager` (slide/hop, capture
   sink, mesh swap on morph) and fires the matching audio + VFX + HUD updates.
3. Status is recomputed (check / checkmate / stalemate / draw) and, in AI mode,
   the engine's reply is scheduled.

The morph logic lives in one place — `ChexxGame.chooseMorph` — and the cap is
the only thing constraining it, so the core rule is easy to find and tweak.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server (HMR) on `127.0.0.1:5188`. |
| `npm run build` | Type-check (`tsc`) and build the production bundle to `dist/`. |
| `npm run preview` | Serve the built bundle on `127.0.0.1:4188`. |
| `npm test` | Run the Playwright suite (desktop + portrait profiles). |
| `npm run inspect:canvas` | Headless non-blank/diagnostics check of the canvas. |
| `node scripts/qa-drive.mjs` | Drive the real UI and write screenshots to `artifacts/qa/`. |

### Debug & automation hooks

When the app is running it exposes two globals (used by the tests and handy in
the console):

- `window.__THREE_GAME_DIAGNOSTICS__` — `{ fps, drawCalls, triangles, … }`.
- `window.__chexx` — `{ start(cfg), auto(), step(), select(sq), over(), cam(d,p,az), state() }`.
  `step()` applies one random legal move with no animation (deterministic, used
  by headless tests); `auto()` is the fully-animated equivalent.

### Testing notes

The engine is validated against **perft** (move-tree node counts): from the
start position it produces exactly 20 / 400 / 8902 nodes at depths 1–3, which
covers move generation, check detection, castling and en passant. The Playwright
test additionally proves the scene renders real geometry, that moves and
transmutations actually happen, and that **neither army ever exceeds the cap**.

> If you run Playwright on a machine with only software WebGL (headless CI), see
> the comments in `playwright.config.ts` — tracing and `isMobile` device
> emulation can be unstable there, so the config disables them and uses a
> portrait viewport profile instead.

---

## Contributing

Contributions are welcome — bug fixes, AI improvements, new cap presets, piece
styling, accessibility, sound design, all fair game.

1. **Fork** the repository and create a topic branch
   (`feat/…`, `fix/…`, `chore/…`).
2. Keep the **engine pure** — anything in `src/chess/` must stay free of Three.js
   and DOM dependencies so it remains testable in isolation.
3. Before opening a PR, make sure these pass:
   ```bash
   npm run build   # tsc + production build (no type errors)
   npm test        # Playwright regression suite
   ```
   For visual changes, refresh and eyeball the screenshots:
   ```bash
   node scripts/qa-drive.mjs   # writes to artifacts/qa/
   ```
4. Match the surrounding code style (the project is strict TypeScript; new code
   should type-check with no `any`-escapes and no unused symbols).
5. Open a PR with a short **summary** and a **test plan**. One logical change per
   PR, please.

### Good first issues

- Choose-your-own promotion piece (currently auto-Queen).
- A "morph preview" that shows which types a selected piece could become.
- Optional sound themes / volume slider in the settings panel.
- Move-history export (PGN-style, annotated with transmutations).
- An "undo last move" affordance for hotseat games.

---

## Credits & licence

Designed and built as an original take on chess — the transmutation-under-a-cap
mechanic is the core idea. Pieces, textures, environment and audio are all
generated procedurally at runtime.

No licence has been declared yet; add one (`LICENSE`) before distributing.
