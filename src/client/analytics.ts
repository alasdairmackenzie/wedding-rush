import { ANALYTICS_BATCH_SIZE, ANALYTICS_ID, type AnalyticsContext, type AnalyticsEvent, type AnalyticsTarget, type EventName } from '../shared/analytics';
import { TOP_LIST_PATH } from '../shared/leaderboard';
import { PRESENCE_INTERVAL_MS } from '../shared/presence';

const VISITOR_KEY = 'wedding-rush-visitor';
const SESSION_KEY = 'wedding-rush-session';
const OPT_OUT_KEY = 'wedding-rush-analytics-off';
const newId = () => crypto.randomUUID();
function savedId(storage: Storage, key: string): string {
  const previous = storage.getItem(key);
  if (previous && ANALYTICS_ID.test(previous)) return previous;
  const id = newId();
  storage.setItem(key, id);
  return id;
}
export function createAnalytics(page: AnalyticsContext['page']) {
  const privacySignal = navigator.doNotTrack === '1' || ('globalPrivacyControl' in navigator && navigator.globalPrivacyControl === true);
  let optedOut = false;
  let visitor: string = newId();
  let session: string = newId();
  const preference = new URLSearchParams(location.search).get('analytics');
  if (preference === 'off') optedOut = true;
  try {
    if (preference === 'off' || preference === 'on') {
      optedOut = preference === 'off';
      localStorage.setItem(OPT_OUT_KEY, optedOut ? '1' : '0');
      if (optedOut) {
        localStorage.removeItem(VISITOR_KEY);
        sessionStorage.removeItem(SESSION_KEY);
      }
    } else optedOut = localStorage.getItem(OPT_OUT_KEY) === '1';
    if (!optedOut && !privacySignal) {
      visitor = savedId(localStorage, VISITOR_KEY);
      session = savedId(sessionStorage, SESSION_KEY);
    }
  } catch (error) {
    console.warn('Analytics storage unavailable; using IDs for this page only.', error);
  }
  const from = new URLSearchParams(location.search).get('from');
  const source: AnalyticsContext['source'] = location.pathname === TOP_LIST_PATH && new URLSearchParams(location.search).has('you') ? 'shared_score'
    : from === 'live' ? 'live_qr' : from === 'share' ? 'shared_link'
    : document.referrer && new URL(document.referrer).origin !== location.origin ? 'external' : 'direct';
  const context: AnalyticsContext = { visitor, session, page, source, device: matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop' };
  let queue: AnalyticsEvent[] = [];
  let pending = false;
  let failures = 0;
  let nextAttempt = 0;
  let runFinished = false;
  let progress = 0;
  const enabled = () => !privacySignal && !optedOut;
  let presencePending = false;
  async function heartbeat(): Promise<void> {
    if (page !== 'game' || document.hidden || !enabled() || presencePending) return;
    presencePending = true;
    try {
      const response = await fetch('/api/presence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor }), signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Presence delivery failed (${response.status}).`);
    } catch (error) {
      console.warn('Active-user presence could not be delivered.', error);
    } finally {
      presencePending = false;
    }
  }
  const presenceTimer = page === 'game' ? window.setInterval(() => { void heartbeat(); }, PRESENCE_INTERVAL_MS) : undefined;
  if (page === 'game') {
    void heartbeat();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void heartbeat(); });
    window.addEventListener('pageshow', event => { if (event.persisted) void heartbeat(); });
    window.addEventListener('pagehide', event => { if (!event.persisted) clearInterval(presenceTimer); });
  }
  function event(name: EventName, target: AnalyticsTarget): AnalyticsEvent | undefined {
    return enabled() ? { ...context, id: newId(), name, target } : undefined;
  }
  function track(name: EventName, target: AnalyticsTarget): void {
    const item = event(name, target);
    if (!item) return;
    if (queue.length >= 250) {
      console.warn('Analytics queue full; dropping oldest undelivered event.');
      queue.shift();
    }
    queue.push(item);
  }
  async function flush(): Promise<void> {
    if (!enabled() || pending || !queue.length || Date.now() < nextAttempt) return;
    const batch = queue.splice(0, ANALYTICS_BATCH_SIZE);
    pending = true;
    try {
      const response = await fetch('/api/analytics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }), keepalive: true,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Analytics delivery failed (${response.status}).`);
      failures = 0;
      nextAttempt = 0;
    } catch (error) {
      console.warn('Analytics could not be delivered.', error);
      failures++;
      if (enabled() && failures <= 3) queue.unshift(...batch);
      nextAttempt = Date.now() + Math.min(60_000, 5000 * 2 ** failures);
    } finally {
      pending = false;
    }
  }
  const timer = window.setInterval(() => { void flush(); }, 2000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) void flush(); });
  window.addEventListener('pagehide', () => { void flush(); });
  window.addEventListener('storage', e => {
    if (e.key === OPT_OUT_KEY) {
      optedOut = e.newValue === '1';
      if (optedOut) queue = [];
    }
  });
  track('page_view', page);
  return {
    track, flush, enabled,
    scoreEvent: () => event('score_saved', 'submit-score'),
    start(fresh: boolean, phase: string): void {
      const newRun = fresh || ['ready', 'won', 'late'].includes(phase);
      if (!newRun) { if (phase === 'paused') track('game_resume', 'play'); return; }
      if (context.run && !runFinished) track('run_discarded', 'restart');
      const replay = ['won', 'late'].includes(phase);
      context.run = newId();
      progress = 0;
      runFinished = false;
      track('game_start', 'game');
      if (replay) track('game_replay', 'again');
      else if (fresh) track('game_restart', 'restart');
    },
    finish(won: boolean): void {
      if (runFinished || !context.run) return;
      runFinished = true;
      track(won ? 'game_won' : 'game_lost', won ? 'result_won' : 'result_lost');
    },
    progress(percent: number): void {
      if (!context.run || runFinished) return;
      const targets = ['25', '50', '75', '100'] as const;
      while (progress < targets.length && percent >= Number(targets[progress])) {
        track('game_progress', targets[progress]);
        progress++;
      }
    },
    observeScreens(targets: Record<string, () => AnalyticsTarget>): void {
      const visible = new Set<string>();
      const check = () => {
        if (document.hidden) return;
        for (const [id, target] of Object.entries(targets)) {
          const el = document.getElementById(id);
          const open = el && (el instanceof HTMLDialogElement ? el.open : !el.hidden && (el.id !== 'play-instructions' || document.getElementById('menu')?.hasAttribute('open')));
          if (open && !visible.has(id)) track('screen_view', target());
          if (open) visible.add(id); else visible.delete(id);
        }
      };
      const observer = new MutationObserver(check);
      observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open', 'hidden'] });
      document.addEventListener('visibilitychange', check);
      check();
      window.addEventListener('pagehide', e => { if (!e.persisted) { observer.disconnect(); clearInterval(timer); } });
    },
  };
}
