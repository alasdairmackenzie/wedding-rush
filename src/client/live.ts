import QRCode from 'qrcode';
import type { ScoreEntry } from '../shared/leaderboard';
import type { ActiveUsers } from '../shared/presence';
import { createAnalytics } from './analytics';
import './live.css';

const REFRESH_MS = 15_000;
const analytics = createAnalytics('live');
analytics.track('screen_view', 'live');
const rows = document.getElementById('live-rows') as HTMLTableSectionElement;
const status = document.getElementById('live-status') as HTMLElement;
const activeCount = document.getElementById('live-active-count') as HTMLElement;
const activeStatus = document.getElementById('live-active-status') as HTMLElement;
const link = document.getElementById('live-url') as HTMLElement;
const qrContainer = document.getElementById('live-qr') as HTMLElement | null;
const params = new URLSearchParams(location.search);
const targetHost = params.get('url') || location.host;
link.textContent = targetHost;

const fullUrl = /^https?:\/\//i.test(targetHost) ? targetHost : `${location.protocol}//${targetHost}`;
if (qrContainer) {
  const joinUrl = new URL(fullUrl);
  joinUrl.searchParams.set('from', 'live');
  QRCode.toString(joinUrl.href, { type: 'svg', margin: 1, color: { dark: '#302825', light: '#fffaf0' } })
    .then(svg => { qrContainer.innerHTML = svg; })
    .catch(() => { /* QR generation fallback */ });
}

let seen: Set<string> | undefined;
const time = (): string => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function render(scores: ScoreEntry[]): void {
  const fresh = new Set<string>();
  const items = scores.map((entry, index) => {
    const row = document.createElement('tr');
    for (const value of [String(index + 1), `${entry.name}${entry.won ? ' 💍' : ''}`, String(entry.score), String(entry.squashed)]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    if (entry.hasReplay) {
      const watch = document.createElement('a');
      watch.href = `/top?you=${encodeURIComponent(entry.id)}`;
      watch.textContent = ' 🎞';
      watch.title = `View ${entry.name}'s score and replay`;
      watch.setAttribute('aria-label', `View ${entry.name}'s score and replay`);
      row.cells[1].append(watch);
    }
    if (seen && !seen.has(entry.id)) row.dataset.new = '';
    fresh.add(entry.id);
    return row;
  });
  if (!items.length) {
    const empty = document.createElement('tr');
    empty.innerHTML = '<td class="empty" colspan="4">No scores yet. Be the first!</td>';
    items.push(empty);
  }
  rows.replaceChildren(...items);
  seen = fresh;
}

async function refreshActiveUsers(): Promise<void> {
  try {
    const response = await fetch('/api/presence', {
      headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(String(response.status));
    const data: ActiveUsers = await response.json();
    if (!Number.isSafeInteger(data.activeUsers) || data.activeUsers < 0 || data.windowMinutes !== 15) {
      throw new Error('Invalid active-user count.');
    }
    activeCount.textContent = data.activeUsers.toLocaleString();
    activeStatus.textContent = 'Unique game browsers, not people.';
    activeStatus.parentElement?.removeAttribute('data-error');
  } catch (error) {
    console.warn('Active-user count could not be loaded.', error);
    activeCount.textContent = '—';
    activeStatus.textContent = 'Active count unavailable. Trying again shortly.';
    activeStatus.parentElement?.setAttribute('data-error', '');
  }
}
async function refreshScores(): Promise<void> {
  try {
    const response = await fetch('/api/scores', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json() as { scores: ScoreEntry[] };
    render(data.scores);
    status.textContent = `Updated ${time()}. Refreshes every ${REFRESH_MS / 1000} seconds.`;
    delete status.dataset.error;
  } catch {
    if (!status.hasAttribute('data-error')) analytics.track('error', 'live');
    status.textContent = `Can't reach the top list right now (${time()}). Trying again shortly.`;
    status.dataset.error = '';
  }
}

async function refresh(): Promise<void> {
  await Promise.all([refreshScores(), refreshActiveUsers()]);
}
void refresh();
window.setInterval(() => { if (!document.hidden) void refresh(); }, REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
