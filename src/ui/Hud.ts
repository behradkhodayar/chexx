import { Color, PIECE_NAME, PieceType } from '../chess/types';
import { GLYPH } from './types';

const el = (tag: string, cls?: string, html?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

/** In-game heads-up display: turn, material-vs-cap bars, captures, move log. */
export class Hud {
  readonly root: HTMLElement;
  private turnDot: HTMLElement;
  private turnText: HTMLElement;
  private capChip: HTMLElement;
  private bars: Record<Color, ReturnType<Hud['makePlayerPanel']>>;
  private logList: HTMLElement;
  private morphToast: HTMLElement;
  private thinking: HTMLElement;
  private cap = 0;

  onSound?: () => void;
  onMenu?: () => void;
  onFlip?: () => void;
  onHint?: () => void;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud-root');

    // Top bar: side panels + turn indicator + buttons.
    const top = el('div', 'hud-top');
    this.bars = {
      w: this.makePlayerPanel('White', 'w'),
      b: this.makePlayerPanel('Black', 'b'),
    };

    const center = el('div', 'turn-center');
    this.turnDot = el('span', 'turn-dot w');
    this.turnText = el('span', 'turn-text', 'White to move');
    const turnPill = el('div', 'turn-pill');
    turnPill.append(this.turnDot, this.turnText);
    this.capChip = el('div', 'cap-chip', 'Cap 54');
    this.thinking = el('div', 'thinking', '<span></span><span></span><span></span>');
    this.thinking.style.display = 'none';
    center.append(turnPill, this.capChip, this.thinking);

    const tools = el('div', 'hud-tools');
    const btn = (icon: string, label: string, fn: () => void) => {
      const b = el('button', 'icon-btn', icon) as HTMLButtonElement;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.onclick = fn;
      return b;
    };
    tools.append(
      btn('♪', 'Sound', () => this.onSound?.()),
      btn('⟲', 'Flip board', () => this.onFlip?.()),
      btn('?', 'How morph works', () => this.onHint?.()),
      btn('☰', 'Menu', () => this.onMenu?.()),
    );
    this.soundBtn = tools.firstElementChild as HTMLButtonElement;

    top.append(this.bars.w.panel(), center, this.bars.b.panel(), tools);

    // Move log.
    const log = el('div', 'hud-log');
    log.append(el('div', 'log-title', 'Moves'));
    this.logList = el('div', 'log-list');
    log.append(this.logList);

    // Morph toast (hidden by CSS until `.show` runs the reveal animation).
    this.morphToast = el('div', 'morph-toast');

    this.root.append(top, log, this.morphToast);
    parent.append(this.root);
  }

  private soundBtn!: HTMLButtonElement;

  private makePlayerPanel(name: string, color: Color) {
    const panel = el('div', `player-panel ${color}`);
    const head = el('div', 'pp-head');
    head.append(el('span', 'pp-name', name), el('span', 'pp-val', '39'));
    const barWrap = el('div', 'pp-bar');
    const fill = el('div', `pp-fill ${color}`);
    const capMark = el('div', 'pp-cap');
    barWrap.append(fill, capMark);
    const taken = el('div', 'pp-taken');
    panel.append(head, barWrap, taken);
    const valEl = head.lastElementChild as HTMLElement;
    return {
      fill,
      val: valEl,
      cap: capMark,
      taken,
      panel: () => panel,
    };
  }

  setCap(cap: number): void {
    this.cap = cap;
    this.capChip.textContent = `Shared cap ${cap}`;
  }

  setTurn(color: Color, label: string): void {
    this.turnDot.className = `turn-dot ${color}`;
    this.turnText.textContent = label;
  }

  setMaterial(color: Color, value: number): void {
    const b = this.bars[color];
    b.val.textContent = String(value);
    const pct = this.cap ? Math.min(100, (value / this.cap) * 100) : 0;
    b.fill.style.width = `${pct}%`;
    b.fill.classList.toggle('near-cap', value >= this.cap - 4);
  }

  setCaptured(color: Color, types: PieceType[]): void {
    // `color` is the side that OWNS these captured pieces (shown as losses).
    const enemy: Color = color === 'w' ? 'b' : 'w';
    const panelOwner = enemy; // attacker panel shows what it captured
    const b = this.bars[panelOwner];
    b.taken.innerHTML = types
      .map((t) => `<span class="cap-glyph ${color}">${GLYPH[color][t]}</span>`)
      .join('');
  }

  addLog(ply: number, san: string, color: Color): void {
    const moveNo = Math.floor(ply / 2) + 1;
    if (color === 'w') {
      const row = el('div', 'log-row');
      row.append(
        el('span', 'log-no', `${moveNo}.`),
        el('span', 'log-w', san),
        el('span', 'log-b', ''),
      );
      this.logList.append(row);
    } else {
      const last = this.logList.lastElementChild;
      if (last && last.children[2]) last.children[2].textContent = san;
      else {
        const row = el('div', 'log-row');
        row.append(el('span', 'log-no', `${moveNo}.`), el('span', 'log-w', '…'), el('span', 'log-b', san));
        this.logList.append(row);
      }
    }
    this.logList.scrollTop = this.logList.scrollHeight;
  }

  clearLog(): void {
    this.logList.innerHTML = '';
  }

  showMorph(color: Color, from: PieceType, to: PieceType): void {
    this.morphToast.innerHTML =
      `<span class="mt-glyph ${color}">${GLYPH[color][from]}</span>` +
      `<span class="mt-name">${PIECE_NAME[from]}</span>` +
      `<span class="mt-arrow">→</span>` +
      `<span class="mt-glyph ${color}">${GLYPH[color][to]}</span>` +
      `<span class="mt-name hot">${PIECE_NAME[to]}</span>`;
    this.morphToast.classList.remove('show');
    // Force reflow to restart the animation.
    void this.morphToast.offsetWidth;
    this.morphToast.classList.add('show');
  }

  setThinking(on: boolean): void {
    this.thinking.style.display = on ? 'flex' : 'none';
  }

  setMuted(muted: boolean): void {
    this.soundBtn.textContent = muted ? '𝄚' : '♪';
    this.soundBtn.classList.toggle('muted', muted);
  }

  show(): void {
    this.root.style.display = '';
  }
  hide(): void {
    this.root.style.display = 'none';
  }
}
