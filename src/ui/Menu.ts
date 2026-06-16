import { CAP_PRESETS } from '../chess/game';
import { Color } from '../chess/types';
import { MatchConfig, Mode } from './types';

const el = (tag: string, cls?: string, html?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

/** Title menu, settings, help modal and game-over overlay. */
export class Menu {
  readonly root: HTMLElement;
  private overlay: HTMLElement;
  private gameOver: HTMLElement;
  private help: HTMLElement;

  private cfg: MatchConfig = {
    mode: 'ai',
    difficulty: 2,
    cap: 54,
    capId: 'classic',
    humanColor: 'w',
  };

  onStart?: (cfg: MatchConfig) => void;
  onResume?: () => void;
  private resumable = false;

  constructor(parent: HTMLElement, onHover: () => void, onClick: () => void) {
    this.root = el('div', 'menu-root');
    this.overlay = this.buildMenu(onHover, onClick);
    this.gameOver = this.buildGameOver(onClick);
    this.help = this.buildHelp(onClick);
    this.root.append(this.overlay, this.gameOver, this.help);
    parent.append(this.root);
    this.gameOver.style.display = 'none';
    this.help.style.display = 'none';
  }

  private buildMenu(onHover: () => void, onClick: () => void): HTMLElement {
    const wrap = el('div', 'overlay menu-overlay');
    const card = el('div', 'menu-card');

    const logo = el('div', 'logo');
    logo.innerHTML =
      `<span class="logo-main">CHE<span class="logo-x">XX</span></span>` +
      `<span class="logo-sub">CHESS · TRANSMUTED</span>`;
    const intro = el(
      'p',
      'menu-intro',
      'Every move rewrites the board. When a Knight, Bishop, Rook or Queen lands, it <b>transmutes</b> into another piece at random — bound by a shared material <b>cap</b>. Pawns and Kings never change.',
    );

    const groups = el('div', 'menu-groups');

    // Mode.
    const modeGroup = this.optionGroup('Opponent', [
      { id: 'ai', label: 'vs Computer' },
      { id: 'local', label: '2 Players' },
    ], this.cfg.mode, (id) => {
      this.cfg.mode = id as Mode;
      diffGroup.style.display = id === 'ai' ? '' : 'none';
      colorGroup.style.display = id === 'ai' ? '' : 'none';
      onClick();
    }, onHover);

    const diffGroup = this.optionGroup('Difficulty', [
      { id: '1', label: 'Novice' },
      { id: '2', label: 'Skilled' },
      { id: '3', label: 'Master' },
    ], String(this.cfg.difficulty), (id) => {
      this.cfg.difficulty = Number(id) as 1 | 2 | 3;
      onClick();
    }, onHover);

    const colorGroup = this.optionGroup('Play as', [
      { id: 'w', label: 'White' },
      { id: 'b', label: 'Black' },
    ], this.cfg.humanColor, (id) => {
      this.cfg.humanColor = id as Color;
      onClick();
    }, onHover);

    const capGroup = this.optionGroup(
      'Material cap (shown both sides)',
      CAP_PRESETS.map((p) => ({ id: p.id, label: `${p.label} · ${p.cap}` })),
      this.cfg.capId,
      (id) => {
        const preset = CAP_PRESETS.find((p) => p.id === id)!;
        this.cfg.cap = preset.cap;
        this.cfg.capId = id;
        capNote.textContent = this.capNote(preset.cap);
        onClick();
      },
      onHover,
    );
    const capNote = el('p', 'cap-note', this.capNote(this.cfg.cap));

    groups.append(modeGroup, diffGroup, colorGroup, capGroup, capNote);

    const actions = el('div', 'menu-actions');
    const startBtn = el('button', 'btn-primary', 'Start Match') as HTMLButtonElement;
    startBtn.onmouseenter = onHover;
    startBtn.onclick = () => {
      onClick();
      this.onStart?.({ ...this.cfg });
    };
    this.resumeBtn = el('button', 'btn-ghost', 'Resume') as HTMLButtonElement;
    this.resumeBtn.style.display = 'none';
    this.resumeBtn.onclick = () => {
      onClick();
      this.onResume?.();
    };
    const helpBtn = el('button', 'btn-link', 'How morphing works') as HTMLButtonElement;
    helpBtn.onclick = () => {
      onClick();
      this.showHelp();
    };
    actions.append(this.resumeBtn, startBtn);

    card.append(logo, intro, groups, actions, helpBtn);
    wrap.append(card);
    return wrap;
  }

  private resumeBtn!: HTMLButtonElement;

  private capNote(cap: number): string {
    return `Start material is 39 each. With a cap of ${cap}, sides have ${cap - 39} points of head-room — enough for some upgrades, but not for everything to become a Queen.`;
  }

  private optionGroup(
    title: string,
    options: { id: string; label: string }[],
    selected: string,
    onSelect: (id: string) => void,
    onHover: () => void,
  ): HTMLElement {
    const group = el('div', 'opt-group');
    group.append(el('div', 'opt-title', title));
    const row = el('div', 'opt-row');
    for (const opt of options) {
      const b = el('button', 'opt-btn', opt.label) as HTMLButtonElement;
      if (opt.id === selected) b.classList.add('active');
      b.onmouseenter = onHover;
      b.onclick = () => {
        row.querySelectorAll('.opt-btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        onSelect(opt.id);
      };
      row.append(b);
    }
    group.append(row);
    return group;
  }

  private buildGameOver(onClick: () => void): HTMLElement {
    const wrap = el('div', 'overlay gameover-overlay');
    const card = el('div', 'gameover-card');
    this.goCrest = el('div', 'go-crest');
    this.goTitle = el('h2', 'go-title', 'Checkmate');
    this.goSub = el('p', 'go-sub', '');
    const actions = el('div', 'menu-actions');
    const rematch = el('button', 'btn-primary', 'Rematch') as HTMLButtonElement;
    rematch.onclick = () => {
      onClick();
      this.onStart?.({ ...this.cfg });
    };
    const menuBtn = el('button', 'btn-ghost', 'Main Menu') as HTMLButtonElement;
    menuBtn.onclick = () => {
      onClick();
      this.showMenu(false);
    };
    actions.append(rematch, menuBtn);
    card.append(this.goCrest, this.goTitle, this.goSub, actions);
    wrap.append(card);
    return wrap;
  }
  private goCrest!: HTMLElement;
  private goTitle!: HTMLElement;
  private goSub!: HTMLElement;

  private buildHelp(onClick: () => void): HTMLElement {
    const wrap = el('div', 'overlay help-overlay');
    const card = el('div', 'help-card');
    card.innerHTML = `
      <h2>The Rule of Transmutation</h2>
      <ul class="help-list">
        <li><b>Standard chess</b> — all normal moves, check, castling, en passant, promotion.</li>
        <li><b>Transmutation</b> — whenever a Knight, Bishop, Rook or Queen finishes a move, it instantly morphs into a <i>different</i> Minor or Major piece, chosen at random. It then moves by its new rules next time.</li>
        <li><b>Pawns &amp; Kings are stable</b> — they never transmute.</li>
        <li><b>The shared cap</b> — both armies share one material ceiling, shown at the top. A morph is only allowed if it keeps that side at or under the cap, so you can never turn the whole army into Queens.</li>
        <li><b>Plan around chaos</b> — a Queen you move might shrink to a Knight; a Knight you move might bloom into a Rook. Position matters more than the piece in your hand.</li>
      </ul>`;
    const close = el('button', 'btn-primary', 'Got it') as HTMLButtonElement;
    close.onclick = () => {
      onClick();
      this.help.style.display = 'none';
    };
    card.append(close);
    wrap.append(card);
    return wrap;
  }

  showHelp(): void {
    this.help.style.display = 'flex';
  }
  hideHelp(): void {
    this.help.style.display = 'none';
  }

  setResumable(v: boolean): void {
    this.resumable = v;
    this.resumeBtn.style.display = v ? '' : 'none';
  }

  showMenu(resumable = this.resumable): void {
    this.setResumable(resumable);
    this.root.style.display = '';
    this.overlay.style.display = 'flex';
    this.gameOver.style.display = 'none';
    this.help.style.display = 'none';
  }

  hide(): void {
    this.overlay.style.display = 'none';
    this.gameOver.style.display = 'none';
    this.help.style.display = 'none';
  }

  showGameOver(title: string, sub: string, crest: string): void {
    this.goTitle.textContent = title;
    this.goSub.textContent = sub;
    this.goCrest.textContent = crest;
    this.overlay.style.display = 'none';
    this.gameOver.style.display = 'flex';
  }
}
