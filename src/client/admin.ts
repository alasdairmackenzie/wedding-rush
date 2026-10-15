import { FACE_KINDS, FACE_LABELS, type FaceKind } from '../shared/faces';
import { NAME_MAX, type ScoreEntry } from '../shared/leaderboard';
import type { AnalyticsCount, AnalyticsReport } from '../shared/analytics';
import brideHeadUrl from '../assets/art/bride-head.png';
import dealHeadUrl from '../assets/art/deal-head.png';
import pingpongHeadUrl from '../assets/art/pingpong-head.png';
import hatHeadUrl from '../assets/art/hat-head.png';
import karaokeHeadUrl from '../assets/art/karaoke-head.png';
import kebabHeadUrl from '../assets/art/kebab-head.png';
import pubHeadUrl from '../assets/art/pub-head.png';
import footballHeadUrl from '../assets/art/football-head.png';
import './style.css';
import './admin.css';

const KEY = 'wedding-rush-admin';
const FACE_HEIGHT = 160;
const defaultFaces: Partial<Record<FaceKind, string>> = {
  bride: brideHeadUrl, deal: dealHeadUrl, pingpong: pingpongHeadUrl, hat: hatHeadUrl,
  karaoke: karaokeHeadUrl,
  kebab: kebabHeadUrl,
  pub: pubHeadUrl,
  football: footballHeadUrl,
};
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const login = $<HTMLFormElement>('login');
const tokenInput = $<HTMLInputElement>('token');
const loginStatus = $('login-status');
const dashboard = $('dashboard');
const scoresBody = $<HTMLTableSectionElement>('scores');
const scoresStatus = $('scores-status');
const facesList = $<HTMLUListElement>('faces');
const page = location.pathname.replace(/\/+$/, '').split('/')[2] ?? 'stats';
if (location.pathname === '/admin' || location.pathname === '/admin/' || location.pathname === '/admin.html') {
  history.replaceState(null, '', `/admin/stats${location.search}${location.hash}`);
}
const pageLabels: Record<string, string> = { stats: 'Stats', photos: 'Photos', scores: 'Scores' };
document.title = `${pageLabels[page]} · WeddingRush admin`;
document.querySelectorAll<HTMLElement>('[data-admin-section]').forEach(section => {
  section.hidden = section.dataset.adminSection !== page;
});
document.querySelectorAll<HTMLAnchorElement>('[data-admin-page]').forEach(link => {
  if (link.dataset.adminPage === page) link.setAttribute('aria-current', 'page');
});
let token = sessionStorage.getItem(KEY) ?? '';

class AuthError extends Error {}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers, cache: 'no-store' });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (response.status === 401) throw new AuthError(data.error ?? 'Signed out.');
  if (!response.ok) throw new Error(data.error ?? `Something went wrong (${response.status}).`);
  return data;
}

function failed(error: unknown, target: HTMLElement): void {
  if (error instanceof AuthError) return signOut(error.message);
  target.textContent = error instanceof Error ? error.message : 'Something went wrong.';
  target.dataset.error = '';
}

function say(target: HTMLElement, message: string): void {
  target.textContent = message;
  delete target.dataset.error;
}

function signOut(message = ''): void {
  token = '';
  sessionStorage.removeItem(KEY);
  dashboard.hidden = true;
  login.hidden = false;
  loginStatus.textContent = message;
  if (message) loginStatus.dataset.error = '';
  tokenInput.focus();
}

async function signIn(candidate: string): Promise<void> {
  token = candidate;
  try {
    await api('/api/admin/check');
  } catch (error) {
    return failed(error, loginStatus);
  }
  sessionStorage.setItem(KEY, token);
  login.hidden = true;
  dashboard.hidden = false;
  say(loginStatus, '');
  if (page === 'scores') await loadScores();
  else if (page === 'photos') await loadFaces();
  else await loadAnalytics();
}

const analyticsDays = $<HTMLSelectElement>('analytics-days');
const analyticsStatus = $('analytics-status');
let analyticsRequest = 0;
const label = (text: string): string => text.replaceAll('_', ' ').replaceAll('-', ' ');
function analyticsTable(id: string, rows: (string | number)[][], columns: number): void {
  const body = $(id);
  body.replaceChildren(...rows.map(values => {
    const row = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = typeof value === 'number' ? value.toLocaleString() : value;
      row.append(cell);
    }
    return row;
  }));
  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = columns;
    cell.textContent = 'No activity recorded in this period yet.';
    row.append(cell);
    body.append(row);
  }
}
function renderAnalytics(report: AnalyticsReport): void {
  const total = (name: string) => report.events.filter(e => e.name === name).reduce((sum, e) => sum + e.count, 0);
  const metrics: [string, number][] = [
    ['Unique browsers', report.totals.visitors], ['Tab sessions', report.totals.sessions],
    ['Games played', report.funnel.started], ['Fresh restarts', total('game_restart')],
    ['Play again', total('game_replay')], ['Resumes', total('game_resume')],
    ['Reached Becky', total('game_won')], ['Lost games', total('game_lost')],
    ['Scores saved', total('score_saved')], ['Share successes', total('share_success')],
    ['Live page visits', report.events.find(e => e.name === 'page_view' && e.target === 'live')?.count ?? 0],
    ['Score attempts', total('score_attempt')],
  ];
  $('analytics-metrics').replaceChildren(...metrics.map(([title, count]) => {
    const box = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = title;
    const dd = document.createElement('dd');
    dd.textContent = count.toLocaleString();
    box.append(dt, dd);
    return box;
  }));
  const funnel: [string, number][] = [
    ['Started', report.funnel.started], ['Reached Becky', report.funnel.won],
    ['Lost', report.funnel.lost], ['Saved a score (any outcome)', report.funnel.submitted],
    ['Reached Becky and saved', report.funnel.wonSubmitted],
    ['Lost and saved', report.funnel.lostSubmitted], ['Unfinished / no recorded result', report.funnel.unfinished],
  ];
  analyticsTable('analytics-funnel', funnel.map(([name, count]) => [
    name, count, report.funnel.started ? `${(100 * count / report.funnel.started).toFixed(1)}%` : '—',
  ]), 3);
  analyticsTable('analytics-screens', report.events.filter(e => e.name === 'screen_view')
    .sort((a, b) => b.count - a.count).map(e => [label(e.target), e.count, e.visitors, e.sessions]), 4);
  analyticsTable('analytics-actions', report.events.filter(e => e.name !== 'screen_view')
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map(e => [label(e.name), label(e.target), e.count, e.visitors, e.runs]), 5);
  const breakdown = (id: string, rows: AnalyticsCount[]) => analyticsTable(id, rows.map(e => [label(e.label), e.count, e.visitors, e.sessions]), 4);
  breakdown('analytics-daily', report.daily);
  breakdown('analytics-devices', report.devices);
  breakdown('analytics-sources', report.sources);
  say(analyticsStatus, `Updated ${new Date().toLocaleTimeString()}. Since ${new Date(report.since).toLocaleString()}. `
    + (report.storage === 'memory' ? 'LOCAL MEMORY ONLY: analytics reset when this server restarts.' : 'Stored in PostgreSQL; events retained for 90 days.'));
}
async function loadAnalytics(): Promise<void> {
  const request = ++analyticsRequest;
  say(analyticsStatus, 'Loading analytics…');
  try {
    const report = await api<AnalyticsReport>(`/api/admin/analytics?days=${analyticsDays.value}`);
    if (request === analyticsRequest && token) renderAnalytics(report);
  } catch (error) {
    if (request !== analyticsRequest) return;
    $('analytics-metrics').replaceChildren();
    for (const id of ['funnel', 'screens', 'actions', 'daily', 'devices', 'sources']) $(`analytics-${id}`).replaceChildren();
    failed(error, analyticsStatus);
  }
}
analyticsDays.addEventListener('change', () => { void loadAnalytics(); });
$('analytics-refresh').addEventListener('click', () => { void loadAnalytics(); });

const posted = (at: string): string => new Date(at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function scoreRow(entry: ScoreEntry, index: number): HTMLTableRowElement {
  const row = document.createElement('tr');
  const cells = [String(index + 1), '', String(entry.score), String(entry.squashed), posted(entry.at), ''].map(text => {
    const cell = document.createElement('td');
    cell.textContent = text;
    row.append(cell);
    return cell;
  });
  for (const [index, label] of [[2, 'Points'], [3, 'Squashed'], [4, 'Posted']] as const) {
    cells[index].dataset.label = label;
  }
  const name = document.createElement('input');
  name.value = entry.name;
  name.maxLength = NAME_MAX;
  name.setAttribute('aria-label', `Name for ${entry.name}`);
  cells[1].append(name, entry.won ? ' 💍' : '');
  const rename = document.createElement('button');
  rename.type = 'button';
  rename.textContent = 'Rename';
  rename.setAttribute('aria-label', `Rename ${entry.name}`);
  rename.addEventListener('click', async () => {
    try {
      const result = await api<{ name: string }>(`/api/admin/scores/${entry.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.value }),
      });
      say(scoresStatus, `Renamed “${entry.name}” to “${result.name}”.`);
      await loadScores();
    } catch (error) {
      failed(error, scoresStatus);
    }
  });
  name.addEventListener('keydown', event => { if (event.key === 'Enter') rename.click(); });
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger';
  remove.textContent = 'Delete';
  remove.setAttribute('aria-label', `Delete ${entry.name}`);
  remove.addEventListener('click', async () => {
    if (!confirm(`Delete ${entry.name}'s score of ${entry.score}?`)) return;
    try {
      await api(`/api/admin/scores/${entry.id}`, { method: 'DELETE' });
      say(scoresStatus, `Deleted ${entry.name}'s score.`);
      await loadScores();
    } catch (error) {
      failed(error, scoresStatus);
    }
  });
  cells[5].className = 'actions';
  cells[5].append(rename, remove);
  return row;
}

async function loadScores(): Promise<void> {
  try {
    const { scores } = await api<{ scores: ScoreEntry[] }>('/api/admin/scores');
    if (!scores.length) {
      const row = document.createElement('tr');
      row.innerHTML = '<td class="empty" colspan="6">No scores yet.</td>';
      scoresBody.replaceChildren(row);
    } else {
      scoresBody.replaceChildren(...scores.map(scoreRow));
    }
  } catch (error) {
    failed(error, scoresStatus);
  }
}

/** Scales the picture down to a face-sized PNG, optionally removing the background and cropping to a circle. */
async function prepareFace(file: File, options: { circle: boolean; removeBg: boolean; onProgress?: (msg: string) => void }): Promise<Blob> {
  let source: Blob | File = file;
  if (options.removeBg) {
    options.onProgress?.('Removing background (downloading AI model on first use)…');
    try {
      const { removeBackground } = await import('@imgly/background-removal');
      source = await removeBackground(file, {
        model: 'isnet_quint8',
        progress: (_key: string, current: number, total: number) => {
          if (total > 0) {
            const pct = Math.round((current / total) * 100);
            options.onProgress?.(`Removing background (${pct}%)…`);
          } else {
            options.onProgress?.('Processing image…');
          }
        },
      });
    } catch (err) {
      console.error('Background removal failed; falling back to original image', err);
      options.onProgress?.('Background removal failed, uploading original…');
    }
  }
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, FACE_HEIGHT / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  if (options.circle) {
    context.beginPath();
    context.ellipse(canvas.width / 2, canvas.height / 2, canvas.width / 2, canvas.height / 2, 0, 0, Math.PI * 2);
    context.clip();
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('That picture could not be read.')), 'image/png'));
}

function faceCard(kind: FaceKind, version?: number): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'face';
  const title = document.createElement('h3');
  title.textContent = FACE_LABELS[kind];
  const preview = document.createElement('div');
  preview.className = 'preview';
  const previewUrl = version ? `/api/faces/${kind}?v=${version}` : defaultFaces[kind];
  if (previewUrl) {
    const image = document.createElement('img');
    image.src = previewUrl;
    image.alt = `${version ? 'Uploaded' : 'Default'} face for ${FACE_LABELS[kind]}`;
    preview.append(image);
  } else {
    preview.textContent = 'Default';
  }
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/png,image/jpeg,image/webp';
  file.setAttribute('aria-label', `Upload a face for ${FACE_LABELS[kind]}`);
  const bgLabel = document.createElement('label');
  const bg = document.createElement('input');
  bg.type = 'checkbox';
  bgLabel.append(bg, ' Auto-remove background');
  const circleLabel = document.createElement('label');
  const circle = document.createElement('input');
  circle.type = 'checkbox';
  circleLabel.append(circle, ' Crop to a circle');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    say(status, 'Preparing…');
    try {
      const body = await prepareFace(chosen, {
        circle: circle.checked,
        removeBg: bg.checked,
        onProgress: msg => say(status, msg),
      });
      say(status, 'Uploading…');
      await api(`/api/admin/faces/${kind}`, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body });
      await loadFaces();
    } catch (error) {
      failed(error, status);
    }
  });
  item.append(title, preview, file, bgLabel, circleLabel);
  if (version) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'link';
    reset.textContent = 'Use the default';
    reset.setAttribute('aria-label', `Use the default face for ${FACE_LABELS[kind]}`);
    reset.addEventListener('click', async () => {
      try {
        await api(`/api/admin/faces/${kind}`, { method: 'DELETE' });
        await loadFaces();
      } catch (error) {
        failed(error, status);
      }
    });
    item.append(reset);
  }
  item.append(status);
  return item;
}

async function loadFaces(): Promise<void> {
  try {
    const { faces } = await api<{ faces: Partial<Record<FaceKind, number>> }>('/api/faces');
    facesList.replaceChildren(...FACE_KINDS.map(kind => faceCard(kind, faces[kind])));
  } catch (error) {
    failed(error, facesList);
  }
}

login.addEventListener('submit', event => {
  event.preventDefault();
  void signIn(tokenInput.value.trim());
});
$('logout').addEventListener('click', () => signOut());
if (token) void signIn(token);
else tokenInput.focus();
