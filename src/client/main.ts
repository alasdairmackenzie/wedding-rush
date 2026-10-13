import Phaser from 'phaser';
import QRCode from 'qrcode';
import { BRIDE, GROOM, hurdles, people, rings, Run, runChallenges, runnerSpeed, runTitle, START, TOTAL_SCORE } from '../shared/level';
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
const concentratePower = element('concentrate-power', HTMLElement);
const beckyText = element('becky-text', HTMLElement);
const beckyMessage = element('becky-message', HTMLElement);
const shareButton = element('share', HTMLButtonElement);
const scoreForm = element('score-form', HTMLFormElement);
const playerName = element('player-name', HTMLInputElement);
const submitScore = element('submit-score', HTMLButtonElement);
const scoreStatus = element('score-status', HTMLElement);
const topList = element('top-list', HTMLDialogElement);
const challengesDialog = element('challenges-dialog', HTMLDialogElement);
const challengesBack = element('challenges-back', HTMLButtonElement);
const resultChallengesButton = element('result-challenges-button', HTMLButtonElement);
const topListIntro = element('top-list-intro', HTMLElement);
const topListRows = element('top-list-rows', HTMLTableSectionElement);
const topListPlay = element('top-list-play', HTMLButtonElement);
const topListMenu = element('top-list-menu', HTMLButtonElement);
const shareStatus = element('share-status', HTMLElement);
const shareModal = element('share-modal', HTMLDialogElement);
const shareModalQr = element('share-modal-qr', HTMLElement);
const shareModalLink = element('share-modal-link', HTMLElement);
const shareModalCopy = element('share-modal-copy', HTMLButtonElement);
const shareModalStatus = element('share-modal-status', HTMLElement);
const shareModalClose = element('share-modal-close', HTMLButtonElement);
const BEST_KEY = 'wedding-rush-best';
const NAME_KEY = 'wedding-rush-name';
const CHALLENGES_KEY = 'wedding-rush-challenges';
const earnedChallenges = new Set<string>();
let challengeStorageError = '';
try {
  const stored = JSON.parse(localStorage.getItem(CHALLENGES_KEY) ?? '[]') as unknown;
  if (!Array.isArray(stored) || !stored.every(id => typeof id === 'string' && runChallenges(new Run()).some(challenge => challenge.id === id))) {
    throw new Error('Invalid saved challenge badges.');
  }
  for (const id of stored) earnedChallenges.add(id);
} catch (error) {
  console.error('Could not load challenge badges.', error);
  challengeStorageError = 'Saved badges could not be loaded. Badges will still track during this visit.';
}

function renderChallenges(run: Run): void {
  const challenges = runChallenges(run);
  const newBadges = new Set(challenges.filter(challenge => challenge.earned && !earnedChallenges.has(challenge.id)).map(challenge => challenge.id));
  challenges.filter(challenge => challenge.earned).forEach(challenge => earnedChallenges.add(challenge.id));
  try {
    localStorage.setItem(CHALLENGES_KEY, JSON.stringify([...earnedChallenges]));
  } catch (error) {
    console.error('Could not save challenge badges.', error);
    challengeStorageError = 'Badges could not be saved on this device. They will track during this visit only.';
  }
  element('result-challenges', HTMLElement).replaceChildren(...challenges.map(challenge => {
    const item = document.createElement('li');
    item.dataset.challenge = challenge.id;
    item.toggleAttribute('data-earned', earnedChallenges.has(challenge.id));
    item.toggleAttribute('data-new', newBadges.has(challenge.id));
    const title = document.createElement('strong');
    title.textContent = challenge.name;
    const status = document.createElement('span');
    status.textContent = newBadges.has(challenge.id) ? 'NEW BADGE!' : challenge.earned ? 'Earned this run'
      : earnedChallenges.has(challenge.id) ? 'Previously earned on this device' : 'Not earned yet';
    const goal = document.createElement('span');
    goal.textContent = `${challenge.goal} · This run: ${challenge.progress}`;
    item.append(title, status, goal);
    return item;
  }));
  element('challenges-status', HTMLElement).textContent = challengeStorageError || 'Earned badges are remembered on this device. No extra points for badges.';
}
let lastRun: { score: number; squashed: number; won: boolean; title: string; lives: number; rings: number } | undefined;
let posted: RankedEntry | undefined;
let topListFromRun = false;
let topListFromMenu = false;
let replayFromTopList = false;
let textTimer = 0;
const touch = document.querySelector<HTMLElement>('.touch-controls');
if (!touch) throw new Error('Missing touch controls.');
let scene: WeddingScene | undefined;
let started = false;
const audio = new GameAudio(message => { console.error(message); notice.textContent = message; });

function showMenu(): void {
  if (result.open || challengesDialog.open || errorDialog.open || topList.open || scene?.celebrating) return;
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
type TopListData = { scores: ScoreEntry[]; you?: RankedEntry };
async function openTopList(
  id: string | null,
  options: { fromRun?: boolean; fromMenu?: boolean; data?: TopListData } = {},
): Promise<void> {
  topListFromRun = Boolean(options.fromRun);
  topListFromMenu = Boolean(options.fromMenu);
  topListPlay.textContent = topListFromRun ? 'One more big day ↗'
    : topListFromMenu ? (started ? 'Back to Becky ↗' : "I'm coming! ↗")
    : 'Beat them! Play WeddingRush ↗';
  topListMenu.hidden = !topListFromRun && !topListFromMenu;
  shareButton.hidden = true;
  shareStatus.textContent = '';
  if (!options.data) {
    topListIntro.textContent = 'Loading the top list…';
    topListRows.replaceChildren();
  }
  if (!topList.open) topList.showModal();
  try {
    const data = options.data ?? await fetchScores(id && ENTRY_ID.test(id) ? id : undefined);
    renderScores(topListRows, data.scores, data.you);
    if (data.you) {
      const yours = posted?.id === data.you.id;
      topListIntro.replaceChildren(
        Object.assign(document.createElement('strong'), { textContent: yours ? 'You' : data.you.name }),
        yours
          ? `'re #${data.you.rank} on the WeddingRush top list with ${data.you.score} points and ${data.you.squashed} squashed mates. Share it with the guests!`
          : ` is #${data.you.rank} on the WeddingRush top list with ${data.you.score} points and ${data.you.squashed} squashed mates. Can you beat them?`,
      );
      shareButton.hidden = !yours;
      if (yours) shareButton.focus();
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
    concentratePower.hidden = run.concentrateRemaining === 0;
    const powerText = `4× ORANGE SQUASH · ${(Math.ceil(run.concentrateRemaining / 100) / 10).toFixed(1)}s`;
    if (concentratePower.textContent !== powerText) concentratePower.textContent = powerText;
    arena.dataset.concentrates = String(run.concentrates.size);
    arena.dataset.hatCollected = String(run.hatCollected);
    arena.dataset.nearMisses = String(run.nearMisses.size);
    arena.dataset.concentrateRemaining = String(run.concentrateRemaining);
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
    posted = undefined;
    submitScore.disabled = false;
    playerName.disabled = false;
    scoreStatus.textContent = '';
    scoreStatus.removeAttribute('data-error');
    element('result-kicker', HTMLElement).textContent = won ? 'THE BIG DAY / SAVED' : 'THE BIG DAY / OUT OF CHANCES';
    element('result-title', HTMLElement).textContent = won ? 'Sean, you may kiss Becky.' : 'Too many distractions!';
    element('result-summary', HTMLElement).hidden = won;
    element('result-summary', HTMLElement).textContent = won
      ? ''
      : 'Three distractions used all your chances. Time your jumps and try again.';
    const stats: [string, string, boolean?][] = [
      ['🏆', `${run.score} total points`, true],
      ['♥', `${run.lives}/3 lives left`],
      ['🍬', `${run.sweetScore} / ${TOTAL_SCORE} sweet points + ${run.bonusScore} squash bonus${run.comboScore ? ` + ${run.comboScore} combo` : ''}`],
      ['🚧', `${run.cleared.size} / ${hurdles.length} hurdles cleared`],
      ['💥', `${run.squashed.size} / ${people.length} mates squashed`],
      ['💍', `${run.rings.size} / ${rings.length} rings`],
      ['👒', run.hatCollected ? `Bucket hat found! +${run.hatScore} points` : 'Bucket hat not collected'],
      ['🔥', `best streak ${run.bestStreak}`],
      ['✂', `${run.nearMisses.size} close shaves +${run.nearMissScore} points`],
    ];
    element('result-detail', HTMLElement).replaceChildren(...stats.map(([icon, text, key]) => {
      const item = document.createElement('li');
      if (key) item.dataset.key = '';
      item.append(Object.assign(document.createElement('span'), { textContent: `${icon} `, ariaHidden: 'true' }), text);
      return item;
    }));
    notice.textContent = won ? 'Just married. The football can wait.'
      : 'No chances left. Jump the hurdles to avoid distractions on your next run.';
    renderChallenges(run);
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
  submitScore.disabled = true;
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
    try { localStorage.setItem(NAME_KEY, name); } catch { /* storage unavailable */ }
    showStatus(`Posted! You're #${posted.rank} on the top list.`);
    audio.tada();
    return posted;
  } catch (error) {
    submitScore.disabled = false;
    showStatus(error instanceof Error ? error.message : 'The top list is offline right now.', true);
    return undefined;
  }
}
function showShareStatus(message: string): void {
  shareStatus.textContent = message;
}
async function shareLink(entry: RankedEntry): Promise<void> {
  const url = topListUrl(location.origin, entry.id);
  const text = `${entry.name} is #${entry.rank} on the WeddingRush top list with ${entry.score} points! Can you beat it?`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'WeddingRush top list', text, url });
      showShareStatus(`Shared! You're #${entry.rank} on the top list.`);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showShareStatus('Link copied! Paste it in the wedding group chat.');
  } catch {
    showShareStatus(`Share this link: ${url}`);
  }
}
shareButton.addEventListener('click', () => { if (posted) void shareLink(posted); });
scoreForm.addEventListener('submit', async event => {
  event.preventDefault();
  const entry = await postScore();
  if (!entry || !result.open) return;
  const scores = await fetchScores(entry.id).catch(() => undefined);
  result.close();
  history.replaceState(null, '', topListUrl('', entry.id));
  void openTopList(entry.id, { fromRun: true, data: scores ?? { scores: [], you: entry } });
});
element('result-top-list', HTMLButtonElement).addEventListener('click', () => {
  result.close();
  void openTopList(null, { fromRun: true });
});
topList.addEventListener('close', () => {
  history.replaceState(null, '', '/');
  const replay = replayFromTopList;
  replayFromTopList = false;
  if (topListFromMenu) {
    topListFromMenu = false;
    if (replay) { start(); return; }
  } else if (topListFromRun) {
    topListFromRun = false;
    if (replay) { start(true); return; }
    audio.stop();
    started = false;
  }
  showMenu();
});
topListPlay.addEventListener('click', () => { replayFromTopList = topListFromRun || topListFromMenu; topList.close(); });
element('menu-top-list', HTMLButtonElement).addEventListener('click', () => {
  menu.close();
  void openTopList(null, { fromMenu: true });
});
topListMenu.addEventListener('click', () => topList.close());
restart.addEventListener('click', () => start(true));
element('again', HTMLButtonElement).addEventListener('click', () => start(true));
element('result-menu', HTMLButtonElement).addEventListener('click', () => {
  audio.stop();
  result.close(); started = false; showMenu();
});
function returnToResults(): void {
  challengesDialog.close();
  result.showModal();
  resultChallengesButton.focus();
}
resultChallengesButton.addEventListener('click', () => {
  result.close();
  challengesDialog.showModal();
});
challengesBack.addEventListener('click', returnToResults);
challengesDialog.addEventListener('cancel', event => {
  event.preventDefault();
  returnToResults();
});
element('menu-button', HTMLButtonElement).addEventListener('click', showMenu);
const howToPlay = element('how-to-play', HTMLButtonElement);
const playInstructions = element('play-instructions', HTMLElement);
howToPlay.addEventListener('click', () => {
  playInstructions.hidden = !playInstructions.hidden;
  howToPlay.setAttribute('aria-expanded', String(!playInstructions.hidden));
});
document.addEventListener('click', event => {
  if (event.target instanceof Element && event.target.closest('dialog button, #menu-button, #mobile-pause')) audio.click();
});
element('mobile-pause', HTMLButtonElement).addEventListener('click', showMenu);
let soundMuted = false;
function openShareModal(): void {
  const url = `${location.origin}/`;
  shareModalLink.textContent = url;
  shareModalStatus.textContent = '';
  QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#302825', light: '#fffaf0' } })
    .then(svg => { shareModalQr.innerHTML = svg; })
    .catch(() => { shareModalQr.textContent = 'Scan QR code'; });
  if (!shareModal.open) shareModal.showModal();
}
shareModalCopy.addEventListener('click', async () => {
  const url = `${location.origin}/`;
  try {
    await navigator.clipboard.writeText(url);
    shareModalStatus.textContent = 'Link copied! Send it to the wedding guests 🥂';
  } catch {
    shareModalStatus.textContent = `Copy: ${url}`;
  }
});
shareModalClose.addEventListener('click', () => shareModal.close());
element('header-share-button', HTMLButtonElement).addEventListener('click', openShareModal);
element('menu-share', HTMLButtonElement).addEventListener('click', () => {
  menu.close();
  openShareModal();
});
shareModal.addEventListener('close', () => {
  if (!started && !result.open && !topList.open) showMenu();
});

// Secret Cheat Code: Tap the heart between Wedding and Rush 5 times on the title screen
let heartTapCount = 0;
let heartTapTimer = 0;
function onHeartTap(event: MouseEvent | TouchEvent): void {
  event.preventDefault();
  event.stopPropagation();
  window.clearTimeout(heartTapTimer);
  heartTapCount++;
  if (heartTapCount >= 5) {
    heartTapCount = 0;
    scene?.setDiscoMode(true);
  } else {
    heartTapTimer = window.setTimeout(() => { heartTapCount = 0; }, 2500);
  }
}
document.querySelectorAll('.wordmark i, #menu-title i').forEach(el => {
  el.addEventListener('click', onHeartTap as EventListener);
});

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
  if (event.code === 'Escape' && !menu.open && !result.open && !challengesDialog.open && !errorDialog.open && !topList.open) {
    event.preventDefault(); showMenu();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { audio.stop(); if (started) showMenu(); }
});
window.addEventListener('blur', () => { audio.stop(); if (started) showMenu(); });
window.addEventListener('error', event => reportError(`The game stopped unexpectedly: ${event.message}`));
window.addEventListener('unhandledrejection', event => reportError(`The game encountered an error: ${String(event.reason)}`));
window.addEventListener('pagehide', event => {
  audio.stop();
  if (started) showMenu();
  // A persisted page can be restored from the back/forward cache, so keep the game and audio alive.
  if (event.persisted) return;
  observer.disconnect(); audio.destroy(); game.destroy(true);
});
if (location.pathname === TOP_LIST_PATH) void openTopList(new URLSearchParams(location.search).get('you'));
else showMenu();
