import { FACE_KINDS, FACE_LABELS, type FaceKind } from '../shared/faces';
import { NAME_MAX, type ScoreEntry } from '../shared/leaderboard';
import { MAX_HOURLY_PAGE, type AnalyticsCount, type AnalyticsReport } from '../shared/analytics';
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
let hourlyPage = 0;
let hourlyRows: AnalyticsReport['hourlyPlayers'] | undefined;
const hourlyMetric = $<HTMLSelectElement>('analytics-hourly-metric');
const hourlyPrevious = $<HTMLButtonElement>('analytics-hourly-previous');
const hourlyNext = $<HTMLButtonElement>('analytics-hourly-next');
const hourlyLatest = $<HTMLButtonElement>('analytics-hourly-latest');
function updateHourlyControls(loading = false): void {
  hourlyMetric.disabled = loading || !hourlyRows;
  hourlyPrevious.disabled = loading || hourlyPage >= MAX_HOURLY_PAGE;
  hourlyNext.disabled = hourlyLatest.disabled = loading || hourlyPage === 0;
}
function renderHourlyCounts(rows: AnalyticsReport['hourlyPlayers']): void {
  const plays = hourlyMetric.value === 'plays';
  renderActivityChart(rows.map(row => ({ label: row.hour, count: plays ? row.plays : row.devices })), true);
  $('analytics-hourly-title').textContent = `${plays ? 'Plays' : 'Devices playing'} by hour — ${hourlyPage === 0 ? 'last' : 'earlier'} 12 hours (UTC)`;
  $('analytics-hourly-column').textContent = plays ? 'Plays / game starts' : 'Devices / browsers';
  const firstHour = rows[0].hour;
  const endHour = new Date(Date.parse(rows.at(-1)!.hour) + 3600_000).toISOString();
  const hourLabel = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
  $('analytics-hourly-range').textContent = `${hourLabel(firstHour)} – ${hourLabel(endHour)} UTC`
    + (hourlyPage === 0 ? ' · Current hour incomplete.' : '');
  analyticsTable('analytics-hourly-table', rows.map(row => [
    hourLabel(row.hour), plays ? row.plays : row.devices,
  ]), 2);
}
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
const SVG_NS = 'http://www.w3.org/2000/svg';
const svgElement = (name: string): SVGElement => document.createElementNS(SVG_NS, name);
function chartText(svg: SVGSVGElement, text: string, x: number, y: number, anchor = 'start'): void {
  const element = svgElement('text');
  element.textContent = text;
  element.setAttribute('x', String(x));
  element.setAttribute('y', String(y));
  element.setAttribute('text-anchor', anchor);
  element.setAttribute('dominant-baseline', 'middle');
  element.setAttribute('font-family', 'system-ui, sans-serif');
  element.setAttribute('font-size', '12');
  element.setAttribute('fill', '#302825');
  svg.append(element);
}
function chartSvg(id: string, title: string, description: string, width: number, height: number): SVGSVGElement {
  const svg = svgElement('svg') as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-labelledby', `${id}-title ${id}-description`);
  const titleElement = svgElement('title');
  titleElement.id = `${id}-title`;
  titleElement.textContent = title;
  const descriptionElement = svgElement('desc');
  descriptionElement.id = `${id}-description`;
  descriptionElement.textContent = description;
  svg.append(titleElement, descriptionElement);
  return svg;
}
interface ChartRow { label: string; value: number; display: string }
function renderHorizontalChart(id: string, title: string, description: string, rows: ChartRow[], maxValue: number): void {
  const root = $(id);
  const width = 520;
  const rowHeight = 34;
  const height = Math.max(72, rows.length * rowHeight + 12);
  const svg = chartSvg(id, title, description, width, height);
  if (!rows.length) {
    chartText(svg, 'No activity recorded for this period.', width / 2, height / 2, 'middle');
  } else {
    const maxBarWidth = 310;
    const max = maxValue > 0 ? maxValue : Math.max(...rows.map(row => row.value), 1);
    rows.forEach((row, index) => {
      const y = 18 + index * rowHeight;
      chartText(svg, row.label, 0, y + 8);
      const track = svgElement('rect');
      track.setAttribute('x', '132');
      track.setAttribute('y', String(y));
      track.setAttribute('width', String(maxBarWidth));
      track.setAttribute('height', '16');
      track.setAttribute('rx', '3');
      track.setAttribute('fill', '#e5d7c2');
      const bar = svgElement('rect');
      bar.dataset.chartBar = '';
      bar.setAttribute('x', '132');
      bar.setAttribute('y', String(y));
      bar.setAttribute('width', String(Math.max(0, maxBarWidth * Math.min(1, row.value / max))));
      bar.setAttribute('height', '16');
      bar.setAttribute('rx', '3');
      bar.setAttribute('fill', '#d89a21');
      const tooltip = svgElement('title');
      tooltip.textContent = `${row.label}: ${row.display}`;
      bar.append(tooltip);
      svg.append(track, bar);
      chartText(svg, row.display, 454, y + 8);
    });
  }
  root.replaceChildren(svg);
}
function renderActivityChart(rows: { label: string; count: number }[], hourly = false): void {
  const id = hourly ? 'analytics-hourly-chart' : 'analytics-daily-chart';
  const plays = hourlyMetric.value === 'plays';
  const unit = hourly ? (plays ? 'plays' : 'browsers') : 'events';
  const title = hourly ? `${plays ? 'Plays' : 'Devices playing'} by hour (UTC)` : 'Daily activity (UTC)';
  const description = hourly
    ? (plays ? 'Every game started in each displayed hourly bucket, including repeat plays. '
      : 'Unique browsers starting a game in each displayed hourly bucket. ')
      + rows.map(row => `${row.label}: ${row.count} ${unit}.`).join(' ')
    : 'Number of analytics events recorded each day in the selected period.';
  const width = 720;
  const height = 220;
  const left = 42;
  const right = 12;
  const top = 12;
  const bottom = 36;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const svg = chartSvg(id, title, description, width, height);
  if (!rows.length) {
    chartText(svg, 'No activity recorded for this period.', width / 2, height / 2, 'middle');
  } else {
    const step = Math.max(1, Math.ceil(Math.max(...rows.map(row => row.count), 1) / 4));
    const max = step * 4;
    for (let i = 0; i <= 4; i++) {
      const value = max * i / 4;
      const y = top + plotHeight - plotHeight * i / 4;
      const grid = svgElement('line');
      grid.setAttribute('x1', String(left));
      grid.setAttribute('x2', String(width - right));
      grid.setAttribute('y1', String(y));
      grid.setAttribute('y2', String(y));
      grid.setAttribute('stroke', '#ded2bf');
      grid.setAttribute('stroke-width', '1');
      svg.append(grid);
      chartText(svg, Math.round(value).toLocaleString(), left - 7, y, 'end');
    }
    const slot = plotWidth / rows.length;
    const barWidth = Math.max(1, Math.min(hourly ? 32 : 16, slot * 0.72));
    rows.forEach((row, index) => {
      const barHeight = plotHeight * row.count / max;
      const bar = svgElement('rect');
      bar.dataset.chartBar = '';
      bar.setAttribute('x', String(left + index * slot + (slot - barWidth) / 2));
      bar.setAttribute('y', String(top + plotHeight - barHeight));
      bar.setAttribute('width', String(barWidth));
      bar.setAttribute('height', String(barHeight));
      bar.setAttribute('fill', '#d89a21');
      const tooltip = svgElement('title');
      tooltip.textContent = `${row.label}: ${row.count.toLocaleString()} ${unit}`;
      bar.append(tooltip);
      svg.append(bar);
      if (hourly) chartText(svg, row.count.toLocaleString(), left + index * slot + slot / 2, top + plotHeight - barHeight - 8, 'middle');
    });
    const labelIndexes = hourly ? rows.map((_, index) => index)
      : [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])];
    for (const index of labelIndexes) {
      const date = hourly ? rows[index].label.slice(11, 16) : new Date(`${rows[index].label}T00:00:00Z`).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', timeZone: 'UTC',
      });
      const anchor = index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'middle';
      chartText(svg, date, left + index * slot + slot / 2, height - 14, anchor);
    }
  }
  $(id).replaceChildren(svg);
}
function renderFlowChart(report: AnalyticsReport): void {
  const { flow, funnel } = report;
  const percent = (count: number, total: number) => total ? `${(100 * count / total).toFixed(1)}%` : '—';
  const nodes = [
    { id: 'open', label: 'Open game', count: flow.openedSessions, detail: 'tab sessions', x: 20, y: 20, color: '#f8efe3' },
    { id: 'play', label: 'Press play', count: flow.playedSessions, detail: `${percent(flow.playedSessions, flow.openedSessions)} of opens`, x: 260, y: 20, color: '#ffd465' },
    { id: 'runs', label: 'Games started', count: funnel.started, detail: 'runs, including replays', x: 260, y: 160, color: '#ffd465' },
    { id: 'menu', label: 'Menu / pause', count: flow.menuRuns, detail: `${percent(flow.menuRuns, funnel.started)} of runs`, x: 20, y: 300, color: '#e9dfcc' },
    { id: 'resume', label: 'Resume play', count: flow.resumedRuns, detail: `${percent(flow.resumedRuns, flow.menuRuns)} of menu runs`, x: 20, y: 440, color: '#e9dfcc' },
    { id: 'lose', label: 'Lose', count: funnel.lost, detail: `${percent(funnel.lost, funnel.started)} of runs`, x: 260, y: 300, color: '#f6d4dc' },
    { id: 'win', label: 'Win / reach Becky', count: funnel.won, detail: `${percent(funnel.won, funnel.started)} of runs`, x: 500, y: 300, color: '#dcebcf' },
    { id: 'unfinished', label: 'Unfinished', count: funnel.unfinished, detail: 'no win or loss recorded', x: 740, y: 300, color: '#e9dfcc' },
    { id: 'lost-post', label: 'Post score after loss', count: funnel.lostSubmitted, detail: `${percent(funnel.lostSubmitted, funnel.lost)} of lost runs`, x: 260, y: 440, color: '#f6d4dc' },
    { id: 'won-post', label: 'Post score after win', count: funnel.wonSubmitted, detail: `${percent(funnel.wonSubmitted, funnel.won)} of won runs`, x: 500, y: 440, color: '#dcebcf' },
  ];
  const svg = chartSvg('analytics-flow-chart', 'Player journey',
    nodes.map(node => `${node.label}: ${node.count.toLocaleString()}, ${node.detail}.`).join(' ')
      + ` Score posting was attempted in ${flow.attemptedRuns} runs and confirmed saved in ${funnel.submitted} runs. Menu branches overlap outcomes.`,
    960, 550);
  const defs = svgElement('defs');
  const marker = svgElement('marker');
  marker.id = 'journey-arrow';
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '7');
  marker.setAttribute('markerHeight', '7');
  marker.setAttribute('orient', 'auto');
  const tip = svgElement('path');
  tip.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
  tip.setAttribute('fill', '#756553');
  marker.append(tip);
  defs.append(marker);
  svg.append(defs);
  const links = [
    'M 220 62 H 260', 'M 360 104 V 160',
    'M 360 244 V 272 H 120 V 300', 'M 360 244 V 300',
    'M 360 244 V 272 H 600 V 300', 'M 360 244 V 272 H 840 V 300',
    'M 120 384 V 440', 'M 360 384 V 440', 'M 600 384 V 440',
  ];
  for (const d of links) {
    const path = svgElement('path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#756553');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('marker-end', 'url(#journey-arrow)');
    svg.append(path);
  }
  for (const node of nodes) {
    const box = svgElement('rect');
    box.dataset.flowNode = node.id;
    box.setAttribute('x', String(node.x));
    box.setAttribute('y', String(node.y));
    box.setAttribute('width', '200');
    box.setAttribute('height', '84');
    box.setAttribute('rx', '6');
    box.setAttribute('fill', node.color);
    box.setAttribute('stroke', '#302825');
    box.setAttribute('stroke-width', '2');
    svg.append(box);
    chartText(svg, node.label, node.x + 100, node.y + 18, 'middle');
    chartText(svg, node.count.toLocaleString(), node.x + 100, node.y + 42, 'middle');
    chartText(svg, node.detail, node.x + 100, node.y + 66, 'middle');
  }
  $('analytics-flow-chart').replaceChildren(svg);
  analyticsTable('analytics-flow-table', [
    ['Open game', flow.openedSessions, 'Tab sessions with a game page view'],
    ['Press play', flow.playedSessions, 'Opened tab sessions with a game start'],
    ['Games started', funnel.started, 'Distinct runs, including restarts and replays'],
    ['Menu / pause', flow.menuRuns, 'Started runs with a pause/menu impression'],
    ['Resume play', flow.resumedRuns, 'Menu runs with a resume'],
    ['Lose', funnel.lost, 'Started runs with a loss'],
    ['Win / reach Becky', funnel.won, 'Started runs with a win'],
    ['Unfinished', funnel.unfinished, 'Started runs without a win or loss'],
    ['Attempt to post score', flow.attemptedRuns, 'Started runs with a score attempt'],
    ['Post score after loss', funnel.lostSubmitted, 'Lost runs with a server-confirmed saved score'],
    ['Post score after win', funnel.wonSubmitted, 'Won runs with a server-confirmed saved score'],
    ['All scores posted', funnel.submitted, 'Started runs with a server-confirmed saved score'],
  ], 3);
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
  renderFlowChart(report);
  renderActivityChart(report.daily);
  hourlyRows = report.hourlyPlayers;
  renderHourlyCounts(hourlyRows);
  const outcomes: [string, number][] = [
    ['Started', report.funnel.started], ['Reached Becky', report.funnel.won],
    ['Lost', report.funnel.lost], ['Score saved', report.funnel.submitted],
    ['Unfinished', report.funnel.unfinished],
  ];
  renderHorizontalChart(
    'analytics-outcomes-chart',
    'Run outcomes',
    'Each bar is the percentage of started runs with this outcome. Outcomes can overlap.',
    outcomes.map(([label, count]) => {
      const percent = report.funnel.started ? 100 * count / report.funnel.started : 0;
      return { label, value: percent, display: `${percent.toFixed(1)}%` };
    }),
    100,
  );
  renderHorizontalChart(
    'analytics-devices-chart',
    'Average games per gamer browser by input type',
    'Distinct game starts divided by unique anonymous browsers that started a game, grouped by touch or desktop input.',
    report.devices.map(device => ({
      label: label(device.label), value: device.averageGamesPerGamer, display: device.averageGamesPerGamer.toFixed(2),
    })),
    0,
  );
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
  analyticsTable('analytics-devices', report.devices.map(device => [
    label(device.label), device.count, device.visitors, device.sessions, device.games, device.gamers,
    device.averageGamesPerGamer.toFixed(2),
  ]), 7);
  breakdown('analytics-sources', report.sources);
  say(analyticsStatus, `Updated ${new Date().toLocaleTimeString()}. Since ${new Date(report.since).toLocaleString()}. `
    + (report.storage === 'memory' ? 'LOCAL MEMORY ONLY: analytics reset when this server restarts.' : 'Stored in PostgreSQL; events retained for 90 days.'));
}
async function loadAnalytics(): Promise<void> {
  const request = ++analyticsRequest;
  updateHourlyControls(true);
  $('analytics-hourly-chart').setAttribute('aria-busy', 'true');
  $('analytics-hourly-range').textContent = 'Loading hourly counts…';
  say(analyticsStatus, 'Loading analytics…');
  try {
    const report = await api<AnalyticsReport>(`/api/admin/analytics?days=${analyticsDays.value}&hourlyPage=${hourlyPage}`);
    if (request === analyticsRequest && token) renderAnalytics(report);
  } catch (error) {
    if (request !== analyticsRequest) return;
    hourlyRows = undefined;
    $('analytics-metrics').replaceChildren();
    for (const id of ['funnel', 'screens', 'actions', 'daily', 'devices', 'sources', 'daily-chart', 'outcomes-chart', 'devices-chart', 'flow-chart', 'flow-table', 'hourly-chart', 'hourly-table']) {
      $(`analytics-${id}`).replaceChildren();
    }
    $('analytics-hourly-range').textContent = 'Hourly counts unavailable. Refresh to try again or choose another window.';
    failed(error, analyticsStatus);
  } finally {
    if (request === analyticsRequest) {
      updateHourlyControls();
      $('analytics-hourly-chart').removeAttribute('aria-busy');
    }
  }
}
hourlyPrevious.addEventListener('click', () => { hourlyPage = Math.min(MAX_HOURLY_PAGE, hourlyPage + 1); void loadAnalytics(); });
hourlyNext.addEventListener('click', () => { hourlyPage = Math.max(0, hourlyPage - 1); void loadAnalytics(); });
hourlyLatest.addEventListener('click', () => { hourlyPage = 0; void loadAnalytics(); });
hourlyMetric.addEventListener('change', () => { if (hourlyRows) renderHourlyCounts(hourlyRows); });
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
