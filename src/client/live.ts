import QRCode from 'qrcode';
import type { ScoreEntry } from '../shared/leaderboard';
import './live.css';

const REFRESH_MS = 15_000;
const rows = document.getElementById('live-rows') as HTMLTableSectionElement;
const status = document.getElementById('live-status') as HTMLElement;
const link = document.getElementById('live-url') as HTMLElement;
const qrContainer = document.getElementById('live-qr') as HTMLElement | null;
const params = new URLSearchParams(location.search);
const targetHost = params.get('url') || location.host;
link.textContent = targetHost;

const fullUrl = /^https?:\/\//i.test(targetHost) ? targetHost : `${location.protocol}//${targetHost}`;
if (qrContainer) {
  QRCode.toString(fullUrl, { type: 'svg', margin: 1, color: { dark: '#302825', light: '#fffaf0' } })
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

async function refresh(): Promise<void> {
  try {
    const response = await fetch('/api/scores', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json() as { scores: ScoreEntry[] };
    render(data.scores);
    status.textContent = `Updated ${time()}. Refreshes every ${REFRESH_MS / 1000} seconds.`;
    delete status.dataset.error;
  } catch {
    status.textContent = `Can't reach the top list right now (${time()}). Trying again shortly.`;
    status.dataset.error = '';
  }
}

void refresh();
window.setInterval(() => { if (!document.hidden) void refresh(); }, REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
