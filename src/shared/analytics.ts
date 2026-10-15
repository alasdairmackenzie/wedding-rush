export const ANALYTICS_RETENTION_DAYS = 90;
export const ANALYTICS_BATCH_SIZE = 25;
export const ANALYTICS_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const EVENT_NAMES = [
  'page_view', 'screen_view', 'action', 'game_start', 'game_resume', 'game_restart', 'game_replay',
  'game_won', 'game_lost', 'game_progress', 'run_discarded', 'score_attempt', 'score_saved',
  'score_failed', 'score_invalid', 'share_success', 'share_failed', 'share_cancelled', 'setting_changed', 'error',
] as const;
export type EventName = typeof EVENT_NAMES[number];
export const TARGETS = [
  'game', 'live', 'menu', 'pause', 'result_won', 'result_lost', 'top-list', 'full-results', 'full-results-open', 'full-results-back', 'challenges-dialog',
  'share-modal', 'error-dialog', 'instructions', '25', '50', '75', '100',
  'play', 'restart', 'again', 'result-menu', 'result-top-list', 'result-challenges-button',
  'challenges-back', 'menu-top-list', 'menu-achievements', 'top-list-play', 'top-list-menu', 'menu-button', 'mobile-pause',
  'how-to-play', 'header-share-button', 'menu-share', 'share-modal-copy', 'share-modal-close',
  'share', 'submit-score', 'music-toggle', 'effects-toggle', 'native', 'copy',
  'music_on', 'music_off', 'effects_on', 'effects_off', 'live-link',
] as const;
export type AnalyticsTarget = typeof TARGETS[number];
export interface AnalyticsContext {
  visitor: string;
  session: string;
  run?: string;
  page: 'game' | 'live';
  device: 'touch' | 'desktop';
  source: 'direct' | 'shared_score' | 'live_qr' | 'shared_link' | 'external';
}
export interface AnalyticsEvent extends AnalyticsContext {
  id: string;
  name: EventName;
  target: AnalyticsTarget;
}
export interface StoredEvent extends AnalyticsEvent { at: string }
export interface AnalyticsCount { label: string; count: number; visitors: number; sessions: number }
export interface AnalyticsEventCount extends AnalyticsCount { name: EventName; target: AnalyticsTarget; runs: number }
export interface AnalyticsReport {
  days: number;
  since: string;
  storage: 'memory' | 'postgres';
  totals: AnalyticsCount;
  events: AnalyticsEventCount[];
  daily: AnalyticsCount[];
  devices: AnalyticsCount[];
  sources: AnalyticsCount[];
  funnel: { started: number; won: number; lost: number; submitted: number; wonSubmitted: number; lostSubmitted: number; unfinished: number };
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export function isAnalyticsContext(value: unknown): value is AnalyticsContext {
  if (!isRecord(value)) return false;
  return typeof value.visitor === 'string' && ANALYTICS_ID.test(value.visitor)
    && typeof value.session === 'string' && ANALYTICS_ID.test(value.session)
    && (value.run === undefined || (typeof value.run === 'string' && ANALYTICS_ID.test(value.run)))
    && ['game', 'live'].includes(String(value.page))
    && ['touch', 'desktop'].includes(String(value.device))
    && ['direct', 'shared_score', 'live_qr', 'shared_link', 'external'].includes(String(value.source));
}
export function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  if (!isRecord(value) || !isAnalyticsContext(value)) return false;
  return Object.keys(value).every(key => ['id', 'name', 'target', 'visitor', 'session', 'run', 'page', 'device', 'source'].includes(key))
    && typeof value.id === 'string' && ANALYTICS_ID.test(value.id)
    && EVENT_NAMES.some(name => name === value.name)
    && TARGETS.some(target => target === value.target)
    && (!String(value.name).startsWith('game_') && !String(value.name).startsWith('score_') && value.name !== 'run_discarded' || Boolean(value.run));
}
export function analyticsBatch(value: unknown): AnalyticsEvent[] | undefined {
  if (!isRecord(value) || Object.keys(value).length !== 1 || !Array.isArray(value.events)
    || value.events.length < 1 || value.events.length > ANALYTICS_BATCH_SIZE
    || !value.events.every(isAnalyticsEvent) || value.events.some(event => event.name === 'score_saved')) return undefined;
  return value.events;
}
