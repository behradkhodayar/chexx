import './styles.css';
import { Controller } from './game/Controller';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

if (!canvas || !ui) {
  throw new Error('Chexx: missing #game-canvas or #ui mount points');
}

// Boot the game. Controller owns the render loop and all subsystems.
new Controller(canvas, ui);

// Remove the static boot splash once the first frame has had a chance to draw.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.getElementById('boot')?.classList.add('hidden');
  });
});
