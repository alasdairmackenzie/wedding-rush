import Phaser from 'phaser';
import { BRIDE, formatTime, GROOM, hurdles, Run, runnerSpeed, START, sweets, TOTAL_SCORE } from '../shared/level';
import { WeddingScene } from './scene';
import { GameAudio } from './audio';
import './style.css';

function element<T extends HTMLElement>(id: string, type: new (...args: never[]) => T): T {
  const node = document.getElementById(id);
  if (!(node instanceof type)) throw new Error(`Missing or invalid element: ${id}`);
  return node;
}
const arena = element('game', HTMLElement);
const menu = element('menu', HTMLDialogElement);
const result = element('result', HTMLDialogElement);
const errorDialog = element('error-dialog', HTMLDialogElement);
const play = element('play', HTMLButtonElement);
const restart = element('restart', HTMLButtonElement);
const score = element('score', HTMLElement);
const lives = element('lives', HTMLElement);
const timer = element('timer', HTMLElement);
const cleared = element('cleared', HTMLElement);
const speed = element('speed', HTMLElement);
const route = element('route', HTMLProgressElement);
const notice = element('notice', HTMLElement);
const touch = document.querySelector<HTMLElement>('.touch-controls');
if (!touch) throw new Error('Missing touch controls.');
let scene: WeddingScene | undefined;
let started = false;
const audio = new GameAudio(message => { console.error(message); notice.textContent = message; });

function showMenu(): void {
  if (result.open || errorDialog.open || scene?.celebrating) return;
  scene?.pause();
  play.textContent = started ? 'Back to Becky ↗' : "I'm coming! ↗";
  restart.hidden = !started;
  if (!menu.open) menu.showModal();
}
function start(fresh = false): void {
  if (!scene) return;
  audio.unlock();
  menu.close(); result.close();
  started = true;
  requestAnimationFrame(() => scene?.start(fresh));
}
function reportError(message: string): void {
  console.error(message);
  scene?.pause();
  element('error-message', HTMLElement).textContent = message;
  if (!errorDialog.open) errorDialog.showModal();
}

const wedding = new WeddingScene({
  arena, touch, audio,
  error: reportError,
  notice: message => { notice.textContent = message; },
  update: (run: Run, x: number) => {
    element('menu-button', HTMLButtonElement).disabled = wedding.celebrating;
    element('mobile-pause', HTMLButtonElement).disabled = wedding.celebrating;
    score.textContent = `${run.score} points`;
    lives.textContent = `${run.lives} / 3`;
    timer.textContent = formatTime(run.remaining);
    cleared.textContent = `${run.cleared.size} / ${hurdles.length}`;
    speed.textContent = `${Math.round(runnerSpeed(x))}`;
    timer.classList.toggle('urgent', run.remaining <= 20_000);
    route.value = Phaser.Math.Clamp((x - START.x) / (BRIDE.x - START.x) * 100, 0, 100);
    arena.dataset.phase = run.phase;
    arena.dataset.collected = String(run.collected.size);
    arena.dataset.score = String(run.score);
    arena.dataset.bonus = String(run.bonusScore);
    arena.dataset.distractions = String(run.distractions);
    arena.dataset.remaining = String(Math.ceil(run.remaining));
    arena.dataset.cleared = String(run.cleared.size);
    arena.dataset.speed = String(runnerSpeed(x));
  },
  end: run => {
    const won = run.phase === 'won';
    const outOfChances = !won && run.lives === 0;
    element('result-kicker', HTMLElement).textContent = won ? 'THE BIG DAY / SAVED'
      : outOfChances ? 'THE BIG DAY / OUT OF CHANCES' : 'THE BIG DAY / TIME UP';
    element('result-title', HTMLElement).textContent = won ? 'Sean, you may kiss Becky.'
      : outOfChances ? 'Too many distractions!' : 'Fashionably... too late.';
    element('result-detail', HTMLElement).textContent = won
      ? `Sean made it to Becky with ${formatTime(run.remaining)} to spare! ${run.cleared.size} / ${hurdles.length} hurdles cleared, ${run.score} total points (${run.sweetScore} / ${TOTAL_SCORE} sweet points + ${run.bonusScore} squash bonus) and ${run.collected.size} / ${sweets.length} dice sweets. Becky said yes.`
      : `${outOfChances ? `Three distractions used all your chances, with ${formatTime(run.remaining)} left on the clock.` : 'Time ran out. The ceremony started without you.'} You cleared ${run.cleared.size} hurdles and earned ${run.score} total points (${run.sweetScore} sweet points + ${run.bonusScore} squash bonus). Time your jumps and try again.`;
    notice.textContent = won ? 'Just married. The football can wait.'
      : outOfChances ? 'No chances left. Jump the hurdles to avoid distractions on your next run.'
        : 'Time ran out. Becky is waiting for your next attempt.';
    result.showModal();
  },
  ready: readyScene => {
    scene = readyScene;
    play.disabled = false;
    if (menu.open) play.focus();
  },
});
play.disabled = true;
export const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: arena,
  backgroundColor: '#f4d4bc',
  scale: { mode: Phaser.Scale.RESIZE, width: arena.clientWidth, height: arena.clientHeight },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: GROOM.gravity }, fps: 60 } },
  scene: wedding,
  render: { antialias: true },
});
const observer = new ResizeObserver(() => game.scale.resize(arena.clientWidth, arena.clientHeight));
observer.observe(arena);
play.addEventListener('click', () => start());
restart.addEventListener('click', () => start(true));
element('again', HTMLButtonElement).addEventListener('click', () => start(true));
element('result-menu', HTMLButtonElement).addEventListener('click', () => {
  audio.stop();
  result.close(); started = false; showMenu();
});
element('menu-button', HTMLButtonElement).addEventListener('click', showMenu);
element('mobile-pause', HTMLButtonElement).addEventListener('click', showMenu);
let soundMuted = false;
const soundToggle = element('sound-toggle', HTMLButtonElement);
soundToggle.addEventListener('click', () => {
  soundMuted = !soundMuted;
  audio.setMuted(soundMuted);
  soundToggle.textContent = soundMuted ? 'Sound: off' : 'Sound: on';
  soundToggle.setAttribute('aria-pressed', String(soundMuted));
});
menu.addEventListener('cancel', event => {
  event.preventDefault();
  if (started) start();
});
result.addEventListener('cancel', event => event.preventDefault());
errorDialog.addEventListener('close', showMenu);
window.addEventListener('keydown', event => {
  if (event.code === 'Escape' && !menu.open && !result.open && !errorDialog.open) {
    event.preventDefault(); showMenu();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { audio.stop(); if (started) showMenu(); }
});
window.addEventListener('blur', () => { audio.stop(); if (started) showMenu(); });
window.addEventListener('error', event => reportError(`The game stopped unexpectedly: ${event.message}`));
window.addEventListener('unhandledrejection', event => reportError(`The game encountered an error: ${String(event.reason)}`));
window.addEventListener('pagehide', () => { observer.disconnect(); audio.destroy(); game.destroy(true); });
showMenu();
