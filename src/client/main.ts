import Phaser from 'phaser';
import { BRIDE, GROOM, hurdles, people, rings, Run, runnerSpeed, runTitle, START, sweets, TOTAL_SCORE } from '../shared/level';
import { cleanName, ENTRY_ID, isRude, NAME_MAX, type RankedEntry, type ScoreEntry, TOP_LIST_PATH, topListUrl } from '../shared/leaderboard';
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
const cleared = element('cleared', HTMLElement);
const speed = element('speed', HTMLElement);
const route = element('route', HTMLProgressElement);
const notice = element('notice', HTMLElement);
const combo = element('combo', HTMLElement);
const beckyText = element('becky-text', HTMLElement);
const beckyMessage = element('becky-message', HTMLElement);
const shareButton = element('share', HTMLButtonElement);
const scoreForm = element('score-form', HTMLFormElement);
const playerName = element('player-name', HTMLInputElement);
const submitScore = element('submit-score', HTMLButtonElement);
const scoreStatus = element('score-status', HTMLElement);
const scoreEntryParts = [...scoreForm.querySelectorAll<HTMLElement>('label, .score-row')];
const leaderboardRows = element('leaderboard', HTMLTableSectionElement);
const topList = element('top-list', HTMLDialogElement);
const topListIntro = element('top-list-intro', HTMLElement);
const topListRows = element('top-list-rows', HTMLTableSectionElement);
const BEST_KEY = 'wedding-rush-best';
const NAME_KEY = 'wedding-rush-name';
let lastRun: { score: number; squashed: number; won: boolean; title: string; lives: number; rings: number } | undefined;
let posted: RankedEntry | undefined;
let textTimer = 0;
const touch = document.querySelector<HTMLElement>('.touch-controls');
if (!touch) throw new Error('Missing touch controls.');
let scene: WeddingScene | undefined;
let started = false;
const audio = new GameAudio(message => { console.error(message); notice.textContent = message; });

function showMenu(): void {
  if (result.open || errorDialog.open || topList.open || scene?.celebrating) return;
  scene?.pause();
  play.textContent = started ? 'Back to Becky ↗' : "I'm coming! ↗";
  restart.hidden = !started;
  if (!menu.open) menu.showModal();
}
function start(fresh = false): void {
  if (!scene) return;
  audio.unlock();
  menu.close(); result.close();
  window.clearTimeout(textTimer);
  beckyText.hidden = true;
  started = true;
  requestAnimationFrame(() => scene?.start(fresh));
}
function readBest(): number {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
function saveBest(value: number): void {
  try { localStorage.setItem(BEST_KEY, String(value)); } catch { /* storage unavailable */ }
}
function showText(message: string): void {
  window.clearTimeout(textTimer);
  beckyMessage.textContent = message;
  beckyText.toggleAttribute('data-frantic', /!!|[A-Z]{3,}/.test(message));
  beckyText.hidden = true;
  void beckyText.offsetWidth;
  beckyText.hidden = false;
  textTimer = window.setTimeout(() => { beckyText.hidden = true; }, 2600);
}
function scoreRow(entry: ScoreEntry, rank: number, you?: ScoreEntry): HTMLTableRowElement {
  const row = document.createElement('tr');
  const name = `${entry.name}${entry.won ? ' 💍' : ''}`;
  for (const value of [String(rank), name, String(entry.score), String(entry.squashed)]) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.append(cell);
  }
  if (you && entry.id === you.id) {
    row.dataset.you = '';
    row.setAttribute('aria-current', 'true');
  }
  return row;
}
function renderScores(body: HTMLTableSectionElement, scores: ScoreEntry[], you?: RankedEntry): void {
  const rows = scores.map((entry, index) => scoreRow(entry, index + 1, you));
  if (you && !scores.some(entry => entry.id === you.id)) {
    const gap = document.createElement('tr');
    gap.className = 'gap';
    gap.innerHTML = '<td colspan="4">⋯</td>';
    rows.push(gap, scoreRow(you, you.rank, you));
  }
  if (!rows.length) {
    const empty = document.createElement('tr');
    empty.innerHTML = '<td class="empty" colspan="4">No scores yet. Be the first!</td>';
    rows.push(empty);
  }
  body.replaceChildren(...rows);
}
async function fetchScores(you?: string): Promise<{ scores: ScoreEntry[]; you?: RankedEntry }> {
  const query = you ? `?you=${encodeURIComponent(you)}` : '';
  const response = await fetch(`/api/scores${query}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<{ scores: ScoreEntry[]; you?: RankedEntry }>;
}
async function loadLeaderboard(): Promise<void> {
  try {
    renderScores(leaderboardRows, (await fetchScores()).scores);
  } catch {
    leaderboardRows.replaceChildren();
    scoreStatus.textContent = 'The top list is offline right now.';
  }
}
async function openTopList(id: string | null): Promise<void> {
  topList.showModal();
  try {
    const data = await fetchScores(id && ENTRY_ID.test(id) ? id : undefined);
    renderScores(topListRows, data.scores, data.you);
    if (data.you) {
      topListIntro.replaceChildren(
        Object.assign(document.createElement('strong'), { textContent: data.you.name }),
        ` is #${data.you.rank} on the WeddingRush top list with ${data.you.score} points and ${data.you.squashed} squashed mates. Can you beat them?`,
      );
    } else {
      topListIntro.textContent = id ? "We couldn't find that score, but here are the top wedding guests." : 'The top wedding guests so far.';
    }
  } catch {
    topListRows.replaceChildren();
    topListIntro.textContent = 'The top list is offline right now. Try again soon.';
  }
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
  text: showText,
  update: (run: Run, x: number) => {
    element('menu-button', HTMLButtonElement).disabled = wedding.celebrating;
    element('mobile-pause', HTMLButtonElement).disabled = wedding.celebrating;
    score.textContent = `${run.score} points`;
    lives.textContent = `${run.lives} / 3`;
    cleared.textContent = `${run.cleared.size} / ${hurdles.length}`;
    speed.textContent = `${Math.round(runnerSpeed(x))}`;
    const multiplier = `×${run.multiplier}`;
    if (combo.textContent !== multiplier) {
      combo.textContent = multiplier;
      combo.removeAttribute('data-hot');
      if (run.multiplier > 1) { void combo.offsetWidth; combo.setAttribute('data-hot', ''); }
    }
    route.value = Phaser.Math.Clamp((x - START.x) / (BRIDE.x - START.x) * 100, 0, 100);
    arena.dataset.phase = run.phase;
    arena.dataset.collected = String(run.collected.size);
    arena.dataset.score = String(run.score);
    arena.dataset.bonus = String(run.bonusScore);
    arena.dataset.distractions = String(run.distractions);
    arena.dataset.cleared = String(run.cleared.size);
    arena.dataset.speed = String(runnerSpeed(x));
  },
  end: run => {
    const won = run.phase === 'won';
    window.clearTimeout(textTimer);
    beckyText.hidden = true;
    const best = readBest();
    const record = run.score > best;
    if (record) saveBest(run.score);
    const title = runTitle(run);
    lastRun = { score: run.score, squashed: run.squashed.size, won, title, lives: run.lives, rings: run.rings.size };
    element('result-badge', HTMLElement).textContent = `🏅 ${title}`;
    element('result-best', HTMLElement).textContent = record
      ? `NEW RECORD! ${run.score} beats your old best of ${best}.`
      : `Your best: ${best} points.`;
    const extras = ` Squashed ${run.squashed.size} / ${people.length} mates, ${run.rings.size} / ${rings.length} rings, best combo streak ${run.bestStreak}${run.comboScore ? ` (+ ${run.comboScore} combo)` : ''}.`;
    posted = undefined;
    submitScore.disabled = false;
    playerName.disabled = false;
    for (const part of scoreEntryParts) part.hidden = false;
    scoreStatus.textContent = '';
    scoreStatus.removeAttribute('data-error');
    void loadLeaderboard();
    element('result-kicker', HTMLElement).textContent = won ? 'THE BIG DAY / SAVED' : 'THE BIG DAY / OUT OF CHANCES';
    element('result-title', HTMLElement).textContent = won ? 'Sean, you may kiss Becky.' : 'Too many distractions!';
    element('result-detail', HTMLElement).textContent = won
      ? `Sean made it to Becky with ${run.lives} / 3 chances left! ${run.cleared.size} / ${hurdles.length} hurdles cleared, ${run.score} total points (${run.sweetScore} / ${TOTAL_SCORE} sweet points + ${run.bonusScore} squash bonus) and ${run.collected.size} / ${sweets.length} dice sweets. Becky said yes.${extras}`
      : `Three distractions used all your chances. You cleared ${run.cleared.size} hurdles and earned ${run.score} total points (${run.sweetScore} sweet points + ${run.bonusScore} squash bonus). Time your jumps and try again.${extras}`;
    notice.textContent = won ? 'Just married. The football can wait.'
      : 'No chances left. Jump the hurdles to avoid distractions on your next run.';
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
try { playerName.value = localStorage.getItem(NAME_KEY) ?? ''; } catch { /* storage unavailable */ }
playerName.maxLength = NAME_MAX;
function showStatus(message: string, error = false): void {
  scoreStatus.toggleAttribute('data-error', error);
  scoreStatus.textContent = message;
}
async function postScore(): Promise<RankedEntry | undefined> {
  if (!lastRun) return undefined;
  if (posted) return posted;
  const name = cleanName(playerName.value);
  if (!name || isRude(name)) {
    showStatus(!name ? `Add your name (1 to ${NAME_MAX} letters, numbers or spaces).` : "Keep it clean, it's a wedding! Try another name.", true);
    playerName.focus();
    return undefined;
  }
  submitScore.disabled = shareButton.disabled = true;
  showStatus('Posting…');
  try {
    const response = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name, score: lastRun.score, squashed: lastRun.squashed, won: lastRun.won }),
    });
    const data = await response.json() as { error?: string; entry?: RankedEntry; scores?: ScoreEntry[] };
    if (!response.ok || !data.entry || !data.scores) throw new Error(data.error ?? 'The top list is offline right now.');
    posted = data.entry;
    playerName.disabled = true;
    for (const part of scoreEntryParts) part.hidden = true;
    try { localStorage.setItem(NAME_KEY, name); } catch { /* storage unavailable */ }
    showStatus(`Posted! You're #${posted.rank} on the top list.`);
    renderScores(leaderboardRows, data.scores, posted);
    return posted;
  } catch (error) {
    submitScore.disabled = false;
    showStatus(error instanceof Error ? error.message : 'The top list is offline right now.', true);
    return undefined;
  } finally {
    shareButton.disabled = false;
  }
}
async function shareLink(entry: RankedEntry): Promise<void> {
  const url = topListUrl(location.origin, entry.id);
  const text = `${entry.name} is #${entry.rank} on the WeddingRush top list with ${entry.score} points! Can you beat it?`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'WeddingRush top list', text, url });
      showStatus(`Shared! You're #${entry.rank} on the top list.`);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showStatus('Link copied! Paste it in the wedding group chat.');
  } catch {
    showStatus(`Share this link: ${url}`);
  }
}
shareButton.addEventListener('click', async () => {
  const entry = await postScore();
  if (entry) await shareLink(entry);
});
scoreForm.addEventListener('submit', event => {
  event.preventDefault();
  void postScore();
});
topList.addEventListener('close', () => {
  history.replaceState(null, '', '/');
  showMenu();
});
element('top-list-play', HTMLButtonElement).addEventListener('click', () => topList.close());
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
  if (event.code === 'Escape' && !menu.open && !result.open && !errorDialog.open && !topList.open) {
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
if (location.pathname === TOP_LIST_PATH) void openTopList(new URLSearchParams(location.search).get('you'));
else showMenu();
