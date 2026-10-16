import Phaser from 'phaser';
import QRCode from 'qrcode';
import { BRIDE, GROOM, hurdles, people, rings, Run, runChallenges, runnerSpeed, runTitle, START } from '../shared/level';
import { cleanName, ENTRY_ID, FULL_RESULTS_SIZE, isRude, NAME_MAX, type RankedEntry, type ScoreEntry, TOP_LIST_PATH, topListUrl } from '../shared/leaderboard';
import { WeddingScene } from './scene';
import { createReplayViewer } from './replay';
import { isReplay, type Replay } from '../shared/replay';
import perfectRunUrl from '../assets/other/perfect-run.json?url';
import { GameAudio, type MusicMode } from './audio';
import { createAnalytics } from './analytics';
import { TARGETS } from '../shared/analytics';
import './style.css';

function element<T extends HTMLElement>(id: string, type: new (...args: never[]) => T): T {
  const node = document.getElementById(id);
  if (!(node instanceof type)) throw new Error(`Missing or invalid element: ${id}`);
  return node;
}
function setButtonText(button: HTMLButtonElement, text: string): void {
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = `${button.dataset.icon} `;
  button.replaceChildren(icon, text);
}
document.querySelectorAll<HTMLButtonElement>('button[data-icon]').forEach(button => {
  setButtonText(button, button.textContent ?? '');
});
const arena = element('game', HTMLElement);
const menu = element('menu', HTMLDialogElement);
const weddingBadge = element('wedding-day-badge', HTMLButtonElement);
const weddingMessage = element('wedding-day-message', HTMLElement);
const confettiMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const menuConfetti = document.createElement('div');
menuConfetti.className = 'menu-confetti';
menuConfetti.setAttribute('aria-hidden', 'true');
menu.append(menuConfetti);
let weddingDay = false;
let menuCelebrated = false;
let firstMenuOpening = true;
function clearMenuConfetti(): void {
  menuConfetti.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
  menuConfetti.replaceChildren();
}
function burstMenuConfetti(manual = false): void {
  if (!menu.open || weddingBadge.hidden || document.hidden || (!manual && confettiMotion.matches)) return;
  clearMenuConfetti();
  const badge = weddingBadge.getBoundingClientRect();
  const bounds = menu.getBoundingClientRect();
  const x = badge.x + badge.width / 2 - bounds.x - menu.clientLeft + menu.scrollLeft;
  const y = badge.y + badge.height / 2 - bounds.y - menu.clientTop + menu.scrollTop;
  const colours = ['#b84b64', '#ffd465', '#578878', '#795777', '#fffaf0'];
  for (let i = 0; i < 120; i++) {
    const piece = document.createElement('span');
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    piece.style.background = colours[i % colours.length];
    menuConfetti.append(piece);
    const angle = (i + Math.random()) / 120 * Math.PI * 2;
    const velocity = 130 + Math.random() * 300;
    const vx = Math.cos(angle) * velocity;
    const vy = Math.sin(angle) * velocity;
    const spin = (Math.random() - .5) * 900;
    const frames = Array.from({ length: 13 }, (_, frame) => {
      const progress = frame / 12;
      const time = progress * 2.2;
      return {
        transform: `translate(${vx * time}px, ${vy * time + 190 * time * time}px) rotate(${spin * progress}deg)`,
        opacity: progress < .7 ? 1 : (1 - progress) / .3,
      };
    });
    const animation = piece.animate(frames, { duration: 2200, easing: 'linear' });
    animation.onfinish = () => piece.remove();
  }
}
function celebrateMenu(): void {
  if (!menu.open) { menuCelebrated = false; clearMenuConfetti(); return; }
  if ((!weddingDay && !firstMenuOpening) || menuCelebrated || document.hidden) return;
  firstMenuOpening = false;
  menuCelebrated = true;
  burstMenuConfetti();
}
weddingBadge.addEventListener('click', () => burstMenuConfetti(true));
const confettiObserver = new MutationObserver(celebrateMenu);
confettiObserver.observe(menu, { attributes: true, attributeFilter: ['open'] });
confettiMotion.addEventListener('change', clearMenuConfetti);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearMenuConfetti();
  else celebrateMenu();
});
function updateWeddingBadge(): void {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find(value => value.type === type)!.value);
  const today = Date.UTC(part('year'), part('month') - 1, part('day'));
  const days = Math.round((Date.UTC(2026, 9, 17) - today) / 86400_000);
  weddingDay = days === 0;
  weddingBadge.hidden = days < 0;
  if (days < 0) { clearMenuConfetti(); return; }
  const lines = days === 0 ? ['HAPPY', 'WEDDING', 'DAY!'] : [String(days), days === 1 ? 'DAY' : 'DAYS', 'TO GO'];
  weddingBadge.setAttribute('aria-label', lines.join(' '));
  weddingMessage.replaceChildren();
  for (const [index, line] of lines.entries()) {
    if (index) weddingMessage.append(document.createElement('br'));
    weddingMessage.append(line);
  }
  celebrateMenu();
}
updateWeddingBadge();
window.setInterval(updateWeddingBadge, 1000);
document.addEventListener('visibilitychange', updateWeddingBadge);
window.addEventListener('focus', updateWeddingBadge);
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
const fullResults = element('full-results', HTMLDialogElement);
const fullResultsOpen = element('full-results-open', HTMLButtonElement);
const fullResultsRows = element('full-results-rows', HTMLTableSectionElement);
const fullResultsStatus = element('full-results-status', HTMLElement);
let fullResultsRequest = 0;
const challengesDialog = element('challenges-dialog', HTMLDialogElement);
const challengesBack = element('challenges-back', HTMLButtonElement);
const resultChallengesButton = element('result-challenges-button', HTMLButtonElement);
const menuAchievements = element('menu-achievements', HTMLButtonElement);
let achievementsFromMenu = false;
const topListIntro = element('top-list-intro', HTMLElement);
const topListRows = element('top-list-rows', HTMLTableSectionElement);
const topListPlay = element('top-list-play', HTMLButtonElement);
const topListMenu = element('top-list-menu', HTMLButtonElement);
const topListBack = element('top-list-back', HTMLButtonElement);
const menuResults = element('menu-results', HTMLButtonElement);
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

function renderAchievementCounts(): void {
  const label = `My Achievements (${earnedChallenges.size}/${runChallenges(new Run()).length})`;
  setButtonText(menuAchievements, label);
  setButtonText(resultChallengesButton, label);
}
renderAchievementCounts();

function renderChallenges(run: Run, save = true): void {
  const challenges = runChallenges(run);
  const newBadges = new Set(challenges.filter(challenge => save && challenge.earned && !earnedChallenges.has(challenge.id)).map(challenge => challenge.id));
  if (save) {
    challenges.filter(challenge => challenge.earned).forEach(challenge => earnedChallenges.add(challenge.id));
    try {
      localStorage.setItem(CHALLENGES_KEY, JSON.stringify([...earnedChallenges]));
    } catch (error) {
      console.error('Could not save challenge badges.', error);
      challengeStorageError = 'Badges could not be saved on this device. They will track during this visit only.';
    }
  }
  renderAchievementCounts();
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
let lastRun: { score: number; squashed: number; won: boolean; title: string; lives: number; rings: number; cheated: boolean } | undefined;
let posted: RankedEntry | undefined;
let topListFromRun = false;
let topListFromMenu = false;
let topListAction: 'back' | 'play' | 'menu' = 'back';
let topListRequest = 0;
let liveScoresTimer: number | undefined;
let topListOpener: HTMLElement | undefined;
let textTimer = 0;
const touch = document.querySelector<HTMLElement>('.touch-controls');
if (!touch) throw new Error('Missing touch controls.');
let scene: WeddingScene | undefined;
let slowModeEnabled = false;
let allSixesEnabled = false;
let sweetsClicks = 0;
element('sweets-cheat', HTMLButtonElement).addEventListener('click', () => {
  if (++sweetsClicks !== 5) return;
  allSixesEnabled = true;
  scene?.enableAllSixes();
  const status = element('sweets-cheat-status', HTMLElement);
  status.hidden = false;
  status.textContent = 'All-sixes cheat enabled. Remaining dice are now sixes; collected points stay unchanged. Cheat runs cannot be posted to the top list. Reload the page to turn it off.';
});
let invincibilityEnabled = false;
let invincibilityClicks = 0;
function enableInvincibility(): void {
  invincibilityEnabled = true;
  scene?.setDiscoMode(true);
  const status = element('invincibility-cheat-status', HTMLElement);
  status.hidden = false;
  status.textContent = 'Invincibility cheat enabled. Cheat runs cannot be posted to the top list. Reload the page to turn it off.';
}
for (const id of ['invincibility-cheat', 'invincible-cheat']) {
  element(id, HTMLButtonElement).addEventListener('click', () => {
    if (++invincibilityClicks === 5) enableInvincibility();
  });
}
let speedClicks = 0;
element('speed-cheat', HTMLButtonElement).addEventListener('click', () => {
  if (++speedClicks !== 5) return;
  slowModeEnabled = true;
  scene?.enableSlowMode();
  element('speed-instruction', HTMLElement).textContent = 'Sean runs slowly as ever.';
  const status = element('speed-cheat-status', HTMLElement);
  status.hidden = false;
  status.textContent = '75% speed cheat enabled. Cheat runs cannot be posted to the top list. Reload the page to turn it off.';
});
let lastReplay: Replay | undefined;
const rewatchButton = element('result-rewatch', HTMLButtonElement);
const replayViewer = createReplayViewer(key => {
  if (!scene) throw new Error('Game artwork is still loading. Close and try again shortly.');
  const image = scene.textures.get(key).getSourceImage();
  if (!(image instanceof HTMLCanvasElement) && !(image instanceof HTMLImageElement)) {
    throw new Error('Replay artwork is unavailable. Reload the page and try again.');
  }
  return image;
});
rewatchButton.addEventListener('click', () => {
  if (lastReplay) void replayViewer.show(lastReplay, 'Rewatch your run');
});
let started = false;
const analytics = createAnalytics('game');
analytics.observeScreens({
  menu: () => started ? 'pause' : 'menu',
  result: () => lastRun?.won ? 'result_won' : 'result_lost',
  'top-list': () => 'top-list',
  'full-results': () => 'full-results',
  'challenges-dialog': () => 'challenges-dialog',
  'share-modal': () => 'share-modal',
  'error-dialog': () => 'error-dialog',
  'play-instructions': () => 'instructions',
});
const audio = new GameAudio(message => { console.error(message); notice.textContent = message; });

function showMenu(): void {
  if (replayViewer.open || result.open || challengesDialog.open || errorDialog.open || topList.open || shareModal.open || scene?.celebrating) return;
  scene?.pause();
  setButtonText(play, started ? 'Back to Becky ↗' : "I'm coming! ↗");
  restart.hidden = !started;
  menuResults.hidden = !lastRun || (scene?.run.phase !== 'won' && scene?.run.phase !== 'late');
  if (!menu.open) menu.showModal();
  audio.startMenuMusic();
  if (!document.hidden && document.hasFocus()) audio.unlock();
}
function start(fresh = false): void {
  if (!scene) return;
  audio.unlock();
  audio.stopMenuMusic();
  if (fresh || scene.run.phase === 'won' || scene.run.phase === 'late') lastRun = undefined;
  menu.close(); result.close();
  window.clearTimeout(textTimer);
  beckyText.hidden = true;
  started = true;
  requestAnimationFrame(() => {
    if (!scene) return;
    analytics.start(fresh, scene.run.phase);
    scene.start(fresh);
  });
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
  textTimer = window.setTimeout(() => { beckyText.hidden = true; }, 4000);
}
function scoreRow(entry: ScoreEntry, rank: number, you?: ScoreEntry): HTMLTableRowElement {
  const row = document.createElement('tr');
  const name = entry.name;
  for (const value of [String(rank), name, String(entry.score), String(entry.squashed), '']) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.append(cell);
  }
  if (entry.hasReplay) {
    const watch = document.createElement('button');
    watch.type = 'button';
    watch.className = 'watch-replay';
    watch.textContent = 'Watch';
    watch.title = `Watch replay of ${entry.name}'s run`;
    watch.setAttribute('aria-label', `Watch replay of ${entry.name}'s run`);
    watch.setAttribute('aria-haspopup', 'dialog');
    watch.addEventListener('click', () => { void replayViewer.show(entry.id, `${entry.name}'s run · ${entry.score} points`); });
    row.cells[4].append(watch);
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
    gap.innerHTML = '<td colspan="5">⋯</td>';
    rows.push(gap, scoreRow(you, you.rank, you));
  }
  if (!rows.length) {
    const empty = document.createElement('tr');
    empty.innerHTML = '<td class="empty" colspan="5">No scores yet. Be the first!</td>';
    rows.push(empty);
  }
  body.replaceChildren(...rows);
}
async function fetchScores(you?: string, limit?: number): Promise<{ scores: ScoreEntry[]; you?: RankedEntry }> {
  const params = new URLSearchParams();
  if (you) params.set('you', you);
  if (limit !== undefined) params.set('limit', String(limit));
  if (hideDuplicateNames) params.set('unique', '1');
  const query = params.size ? `?${params}` : '';
  const response = await fetch(`/api/scores${query}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<{ scores: ScoreEntry[]; you?: RankedEntry }>;
}
type TopListData = { scores: ScoreEntry[]; you?: RankedEntry };
let hideDuplicateNames = false;
let refreshTopList: (() => Promise<void>) | undefined;
const uniqueSwitches = [
  element('top-list-unique', HTMLInputElement), element('full-results-unique', HTMLInputElement),
];
for (const input of uniqueSwitches) {
  input.addEventListener('change', () => {
    hideDuplicateNames = input.checked;
    for (const toggle of uniqueSwitches) toggle.checked = hideDuplicateNames;
    if (fullResults.open) void loadFullResults();
    if (topList.open) void refreshTopList?.();
  });
}
async function openTopList(
  id: string | null,
  options: { fromRun?: boolean; fromMenu?: boolean; live?: boolean; data?: TopListData } = {},
): Promise<void> {
  const request = ++topListRequest;
  topListOpener = options.live ? element('live-link', HTMLAnchorElement)
    : options.fromRun ? element('result-top-list', HTMLButtonElement)
    : element('menu-top-list', HTMLButtonElement);
  window.clearInterval(liveScoresTimer);
  topListAction = 'back';
  topListFromRun = Boolean(options.fromRun);
  topListFromMenu = Boolean(options.fromMenu);
  setButtonText(topListPlay, topListFromRun ? 'One more big day ↗'
    : topListFromMenu ? (started ? 'Back to Becky ↗' : "I'm coming! ↗")
    : 'Beat them! Play WeddingRush ↗');
  topListBack.hidden = !topListFromRun;
  element('top-list-title', HTMLElement).textContent = options.live ? 'Live scores' : 'Wedding guest top list';
  shareButton.hidden = true;
  shareStatus.textContent = '';
  if (!options.data) {
    topListIntro.textContent = 'Loading the top list…';
    topListRows.replaceChildren();
  }
  if (!topList.open) topList.showModal();
  if (options.live) {
    liveScoresTimer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15_000);
  }
  let refreshRequest = 0;
  let initialData = options.data;
  refreshTopList = refresh;
  async function refresh(): Promise<void> {
    const current = ++refreshRequest;
    const cached = initialData;
    initialData = undefined;
    try {
      const data = cached ?? await fetchScores(id && ENTRY_ID.test(id) ? id : undefined);
      if (!topList.open || request !== topListRequest || current !== refreshRequest) return;
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
        if (yours && !options.live && current === 1 && !fullResults.open) shareButton.focus();
      } else {
        topListIntro.textContent = id ? "We couldn't find that score, but here are the top wedding guests."
          : options.live ? 'The top wedding guests so far. Refreshes every 15 seconds.' : 'The top wedding guests so far.';
      }
    } catch (error) {
      if (!topList.open || request !== topListRequest || current !== refreshRequest) return;
      console.error('Could not load top list:', error);
      topListRows.replaceChildren();
      shareButton.hidden = true;
      topListIntro.textContent = 'The top list is offline right now. Try again soon.';
    }
  }
  await refresh();
}
function reportError(message: string): void {
  analytics.track('error', 'error-dialog');
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
    speed.textContent = `${Math.round(runnerSpeed(x, run.slowMode))}`;
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
    if (run.phase === 'playing') analytics.progress(route.value);
    arena.dataset.phase = run.phase;
    arena.dataset.collected = String(run.collected.size);
    arena.dataset.score = String(run.score);
    arena.dataset.bonus = String(run.bonusScore);
    arena.dataset.distractions = String(run.distractions);
    arena.dataset.cleared = String(run.cleared.size);
    arena.dataset.speed = String(runnerSpeed(x, run.slowMode));
  },
  end: run => {
    const won = run.phase === 'won';
    analytics.finish(won);
    window.clearTimeout(textTimer);
    beckyText.hidden = true;
    const best = readBest();
    const record = run.score > best;
    if (record) saveBest(run.score);
    const title = runTitle(run);
    lastRun = { score: run.score, squashed: run.squashed.size, won, title, lives: run.lives, rings: run.rings.size, cheated: run.cheated };
    lastReplay = scene?.recordedReplay();
    rewatchButton.disabled = !lastReplay;
    element('result-replay-status', HTMLElement).textContent = lastReplay ? ''
      : 'Replay unavailable: this run exceeded the three-minute recording limit. Start a fresh run to record again.';
    element('result-badge', HTMLElement).textContent = `🏅 ${title}`;
    element('result-best', HTMLElement).textContent = record
      ? `NEW RECORD! ${run.score} beats your old best of ${best}.`
      : `Your best: ${best} points.`;
    posted = undefined;
    submitScore.disabled = run.cheated;
    playerName.disabled = run.cheated;
    scoreStatus.textContent = run.cheated
      ? `${run.allSixes ? 'All-sixes' : scene?.isDiscoMode() ? 'Invincibility' : '75% speed'} cheat run: scores cannot be posted to the top list.` : '';
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
      ['🍬', `${run.sweetScore} / ${run.totalSweetScore} sweet points + ${run.bonusScore} squash bonus${run.comboScore ? ` + ${run.comboScore} combo` : ''}`],
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
    if (slowModeEnabled) scene.enableSlowMode();
    if (allSixesEnabled) scene.enableAllSixes();
    if (invincibilityEnabled) scene.setDiscoMode(true);
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
  if (lastRun.cheated) {
    showStatus('Cheat runs cannot be posted to the top list.', true);
    return undefined;
  }
  if (posted) return posted;
  if (submitScore.disabled) return undefined;
  if (!lastReplay) {
    showStatus('This run has no replay and cannot be posted. Start a fresh run to record again.', true);
    return undefined;
  }
  const run = lastRun;
  const name = cleanName(playerName.value);
  if (!name || isRude(name)) {
    analytics.track('score_invalid', 'submit-score');
    showStatus(!name ? `Add your name (1 to ${NAME_MAX} letters, numbers or spaces).` : "Keep it clean, it's a wedding! Try another name.", true);
    playerName.focus();
    return undefined;
  }
  submitScore.disabled = true;
  analytics.track('score_attempt', 'submit-score');
  showStatus('Posting…');
  try {
    const response = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name, score: lastRun.score, squashed: lastRun.squashed, won: lastRun.won, replay: lastReplay, analytics: analytics.scoreEvent() }),
    });
    const data = await response.json() as { error?: string; entry?: RankedEntry; scores?: ScoreEntry[] };
    if (lastRun !== run) return undefined;
    if (!response.ok || !data.entry || !data.scores) throw new Error(data.error ?? 'The top list is offline right now.');
    posted = data.entry;
    playerName.disabled = true;
    try { localStorage.setItem(NAME_KEY, name); } catch { /* storage unavailable */ }
    showStatus(`Posted! You're #${posted.rank} on the top list.`);
    audio.tada();
    return posted;
  } catch (error) {
    if (lastRun !== run) return undefined;
    analytics.track('score_failed', 'submit-score');
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
      analytics.track('share_success', 'native');
      showShareStatus(`Shared! You're #${entry.rank} on the top list.`);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        analytics.track('share_cancelled', 'native');
        return;
      }
      analytics.track('share_failed', 'native');
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    analytics.track('share_success', 'copy');
    showShareStatus('Link copied! Paste it in the wedding group chat.');
  } catch {
    analytics.track('share_failed', 'copy');
    showShareStatus(`Share this link: ${url}`);
  }
}
shareButton.addEventListener('click', () => { if (posted) void shareLink(posted); });
async function loadFullResults(): Promise<void> {
  const request = ++fullResultsRequest;
  fullResultsRows.replaceChildren();
  fullResultsStatus.textContent = `Loading the top ${FULL_RESULTS_SIZE}…`;
  try {
    const data = await fetchScores(undefined, FULL_RESULTS_SIZE);
    if (!fullResults.open || request !== fullResultsRequest) return;
    const highlighted = posted && data.scores.find(entry => hideDuplicateNames
      ? entry.name.toLowerCase() === posted?.name.toLowerCase() : entry.id === posted?.id);
    renderScores(fullResultsRows, data.scores, highlighted ? { ...highlighted, rank: data.scores.indexOf(highlighted) + 1 } : undefined);
    fullResultsStatus.textContent = `The top ${FULL_RESULTS_SIZE} wedding guests.`;
  } catch (error) {
    if (!fullResults.open || request !== fullResultsRequest) return;
    console.error('Could not load full results:', error);
    fullResultsRows.replaceChildren();
    fullResultsStatus.textContent = 'Full results are offline right now. Go back and try again.';
  }
}
fullResultsOpen.addEventListener('click', () => {
  fullResults.showModal();
  void loadFullResults();
});
element('full-results-back', HTMLButtonElement).addEventListener('click', () => fullResults.close());
fullResults.addEventListener('close', () => {
  ++fullResultsRequest;
  fullResultsOpen.focus();
});
scoreForm.addEventListener('submit', async event => {
  event.preventDefault();
  const run = lastRun;
  const entry = await postScore();
  if (!entry || !result.open) return;
  const scores = await fetchScores(entry.id).catch(() => undefined);
  if (!result.open || lastRun !== run) return;
  result.close();
  history.replaceState(null, '', topListUrl('', entry.id));
  void openTopList(entry.id, { fromRun: true, data: scores ?? { scores: [], you: entry } });
});
element('result-top-list', HTMLButtonElement).addEventListener('click', () => {
  result.close();
  void openTopList(posted?.id ?? null, { fromRun: true });
});
topList.addEventListener('close', () => {
  ++topListRequest;
  window.clearInterval(liveScoresTimer);
  history.replaceState(null, '', '/');
  const action = topListAction;
  topListAction = 'back';
  if (topListFromMenu) {
    topListFromMenu = false;
    if (action === 'play') { start(); return; }
  } else if (topListFromRun) {
    topListFromRun = false;
    if (action === 'play') { start(true); return; }
    if (action === 'back') {
      result.showModal();
      element('result-top-list', HTMLButtonElement).focus();
      return;
    }
    audio.stop();
    started = false;
  }
  showMenu();
  topListOpener?.focus();
});
topListPlay.addEventListener('click', () => { topListAction = 'play'; topList.close(); });
element('menu-top-list', HTMLButtonElement).addEventListener('click', () => {
  menu.close();
  void openTopList(null, { fromMenu: true });
});
topListMenu.addEventListener('click', () => { topListAction = 'menu'; topList.close(); });
topListBack.addEventListener('click', () => topList.close());
document.querySelectorAll<HTMLAnchorElement>('[data-live-scores]').forEach(link => {
  link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    showMenu();
    if (!menu.open) return;
    menu.close();
    void openTopList(null, { fromMenu: true, live: true });
  });
});
restart.addEventListener('click', () => start(true));
element('again', HTMLButtonElement).addEventListener('click', () => start(true));
element('result-menu', HTMLButtonElement).addEventListener('click', () => {
  audio.stop();
  result.close(); started = false; showMenu();
});
menuResults.addEventListener('click', () => {
  menu.close();
  result.showModal();
  element('result-menu', HTMLButtonElement).focus();
});
function returnFromAchievements(): void {
  challengesDialog.close();
  if (achievementsFromMenu) {
    showMenu();
    menuAchievements.focus();
    return;
  }
  result.showModal();
  resultChallengesButton.focus();
}
menuAchievements.addEventListener('click', () => {
  achievementsFromMenu = true;
  if (!lastRun) renderChallenges(scene?.run ?? new Run(), false);
  setButtonText(challengesBack, 'Back to menu');
  menu.close();
  challengesDialog.showModal();
});
resultChallengesButton.addEventListener('click', () => {
  achievementsFromMenu = false;
  setButtonText(challengesBack, 'Back to results');
  result.close();
  challengesDialog.showModal();
});
challengesBack.addEventListener('click', returnFromAchievements);
challengesDialog.addEventListener('cancel', event => {
  event.preventDefault();
  returnFromAchievements();
});
element('menu-button', HTMLButtonElement).addEventListener('click', showMenu);
const howToPlay = element('how-to-play', HTMLButtonElement);
const playInstructions = element('play-instructions', HTMLElement);
const perfectReplay = element('perfect-replay', HTMLButtonElement);
let friendClicks = 0;
let perfectReplayLoading = false;
perfectReplay.addEventListener('click', async () => {
  if (perfectReplayLoading || ++friendClicks < 5) return;
  friendClicks = 0;
  perfectReplayLoading = true;
  perfectReplay.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(perfectRunUrl, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Replay request failed (${response.status}).`);
    const recording: unknown = await response.json();
    if (!isReplay(recording)) throw new Error('The perfect-run recording is invalid or uses an unsupported game version.');
    if (menu.open && !playInstructions.hidden) {
      await replayViewer.show(recording, `A perfect run · ${recording.frames.at(-1)![3]} points`);
    }
  } catch (error) {
    console.error('Could not load the perfect run.', error);
    reportError('The perfect run could not be loaded. Close this message and click the sentence five times to try again.');
  } finally {
    perfectReplayLoading = false;
    perfectReplay.removeAttribute('aria-busy');
  }
});
howToPlay.addEventListener('click', () => {
  playInstructions.hidden = !playInstructions.hidden;
  howToPlay.setAttribute('aria-expanded', String(!playInstructions.hidden));
});
document.addEventListener('click', event => {
  if (event.target instanceof Element) {
    const control = event.target.closest('button, a');
    const target = TARGETS.find(target => target === control?.id);
    if (target) analytics.track('action', target);
  }
  if (event.target instanceof Element && event.target.closest('dialog button, #menu-button, #mobile-pause')) audio.click();
});
element('mobile-pause', HTMLButtonElement).addEventListener('click', showMenu);
function openShareModal(): void {
  if (scene?.celebrating) return;
  if (!menu.open && !result.open && !topList.open) showMenu();
  const url = `${location.origin}/?from=share`;
  shareModalLink.textContent = url;
  shareModalStatus.textContent = '';
  QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#302825', light: '#fffaf0' } })
    .then(svg => { shareModalQr.innerHTML = svg; })
    .catch(() => { shareModalQr.textContent = 'Scan QR code'; });
  if (!shareModal.open) shareModal.showModal();
}
shareModalCopy.addEventListener('click', async () => {
  const url = `${location.origin}/?from=share`;
  try {
    await navigator.clipboard.writeText(url);
    analytics.track('share_success', 'copy');
    shareModalStatus.textContent = 'Link copied! Send it to the wedding guests 🥂';
  } catch {
    analytics.track('share_failed', 'copy');
    shareModalStatus.textContent = `Copy: ${url}`;
  }
});
shareModalClose.addEventListener('click', () => shareModal.close());
element('header-share-button', HTMLButtonElement).addEventListener('click', openShareModal);
element('menu-share', HTMLButtonElement).addEventListener('click', () => {
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
    enableInvincibility();
  } else {
    heartTapTimer = window.setTimeout(() => { heartTapCount = 0; }, 2500);
  }
}
document.querySelectorAll('.wordmark i, #menu-title i').forEach(el => {
  el.addEventListener('click', onHeartTap as EventListener);
});

let musicMode: MusicMode = 'on';
const musicToggle = element('music-toggle', HTMLButtonElement);
function renderMusicToggle(): void {
  const label = musicMode === 'on' ? 'On' : 'Off';
  setButtonText(musicToggle, `Music: ${label}`);
  musicToggle.setAttribute('aria-pressed', String(musicMode === 'on'));
}
renderMusicToggle();
musicToggle.addEventListener('click', () => {
  musicMode = musicMode === 'on' ? 'off' : 'on';
  audio.setMusicMode(musicMode);
  renderMusicToggle();
  analytics.track('setting_changed', musicMode === 'on' ? 'music_on' : 'music_off');
});
menu.addEventListener('close', () => audio.stopMenuMusic());
function unlockMenuMusic(): void {
  if (menu.open && !document.hidden) {
    audio.startMenuMusic();
    audio.unlock();
  }
}
document.addEventListener('pointerdown', unlockMenuMusic);
document.addEventListener('keydown', unlockMenuMusic);
let effectsEnabled = true;
const effectsToggle = element('effects-toggle', HTMLButtonElement);
effectsToggle.addEventListener('click', () => {
  effectsEnabled = !effectsEnabled;
  audio.setEffectsEnabled(effectsEnabled);
  setButtonText(effectsToggle, `Sound effects: ${effectsEnabled ? 'On' : 'Off'}`);
  effectsToggle.setAttribute('aria-pressed', String(effectsEnabled));
  analytics.track('setting_changed', effectsEnabled ? 'effects_on' : 'effects_off');
});
menu.addEventListener('cancel', event => {
  event.preventDefault();
  if (started) start();
  else if (!menuResults.hidden) menuResults.click();
});
result.addEventListener('cancel', event => event.preventDefault());
errorDialog.addEventListener('close', showMenu);
window.addEventListener('keydown', event => {
  if (event.code === 'Escape' && !replayViewer.open && !menu.open && !result.open && !challengesDialog.open && !errorDialog.open && !topList.open && !shareModal.open) {
    event.preventDefault(); showMenu();
  }
});
document.querySelector<HTMLAnchorElement>('.wordmark')?.addEventListener('click', event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  showMenu();
});
const RETURN_REFRESH_DELAY = 5 * 60_000;
let awaySince: number | undefined = document.hidden ? Date.now() : undefined;
let returnRefreshPending = false;
let returnRefreshStarted = false;
function refreshReturnedMenu(): void {
  if (!returnRefreshPending || returnRefreshStarted || document.hidden || !navigator.onLine
    || !menu.open || started || (lastRun && !posted)
    || document.querySelector('dialog[open]:not(#menu)')) return;
  returnRefreshStarted = true;
  location.reload();
}
function markAway(): void {
  awaySince ??= Date.now();
}
function markReturned(): void {
  if (document.hidden) return;
  if (awaySince !== undefined) {
    returnRefreshPending ||= Date.now() - awaySince >= RETURN_REFRESH_DELAY;
    awaySince = undefined;
  }
  refreshReturnedMenu();
}
const returnRefreshObserver = new MutationObserver(refreshReturnedMenu);
document.querySelectorAll('dialog').forEach(dialog => {
  returnRefreshObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] });
});
window.addEventListener('blur', markAway);
window.addEventListener('pagehide', markAway);
window.addEventListener('focus', markReturned);
window.addEventListener('pageshow', markReturned);
window.addEventListener('online', refreshReturnedMenu);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) markAway();
  else markReturned();
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
  returnRefreshObserver.disconnect();
  confettiObserver.disconnect(); clearMenuConfetti();
  observer.disconnect(); audio.destroy(); game.destroy(true);
});
if (location.pathname === TOP_LIST_PATH) void openTopList(new URLSearchParams(location.search).get('you'));
else showMenu();
