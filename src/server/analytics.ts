import type { AnalyticsCount, AnalyticsEventCount, AnalyticsReport, StoredEvent } from '../shared/analytics.ts';

function count(label: string, events: StoredEvent[]): AnalyticsCount {
  return { label, count: events.length, visitors: new Set(events.map(e => e.visitor)).size, sessions: new Set(events.map(e => e.session)).size };
}
export function summarize(events: StoredEvent[], days: number, since: string): AnalyticsReport {
  const groups = (key: (event: StoredEvent) => string): AnalyticsCount[] => {
    const grouped = new Map<string, StoredEvent[]>();
    for (const event of events) {
      const label = key(event);
      const group = grouped.get(label) ?? [];
      group.push(event);
      grouped.set(label, group);
    }
    return [...grouped].map(([label, items]) => count(label, items)).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };
  const eventGroups = new Map<string, StoredEvent[]>();
  for (const event of events) {
    const key = `${event.name}:${event.target}`;
    const items = eventGroups.get(key) ?? [];
    items.push(event);
    eventGroups.set(key, items);
  }
  const breakdown: AnalyticsEventCount[] = [...eventGroups.values()].map(items => ({
    ...count(items[0].target, items), name: items[0].name, target: items[0].target,
    runs: new Set(items.flatMap(e => e.run ? [`${e.visitor}:${e.run}`] : [])).size,
  }));
  const runs = new Map<string, Set<string>>();
  for (const event of events) {
    if (!event.run) continue;
    const key = `${event.visitor}:${event.run}`;
    const names = runs.get(key) ?? new Set<string>();
    names.add(event.name);
    if (event.name === 'screen_view' && event.target === 'pause') names.add('menu');
    runs.set(key, names);
  }
  const sessions = new Map<string, Set<string>>();
  for (const event of events) {
    const key = `${event.visitor}:${event.session}`;
    const names = sessions.get(key) ?? new Set<string>();
    if (event.name === 'page_view' && event.page === 'game' && event.target === 'game') names.add('opened');
    if (event.name === 'game_start') names.add('played');
    sessions.set(key, names);
  }
  const started = [...runs.values()].filter(names => names.has('game_start'));
  const opened = [...sessions.values()].filter(names => names.has('opened'));
  const flow = {
    openedSessions: opened.length,
    playedSessions: opened.filter(names => names.has('played')).length,
    menuRuns: started.filter(names => names.has('menu')).length,
    resumedRuns: started.filter(names => names.has('menu') && names.has('game_resume')).length,
    attemptedRuns: started.filter(names => names.has('score_attempt')).length,
  };
  const funnel = {
    started: started.length,
    won: started.filter(names => names.has('game_won')).length,
    lost: started.filter(names => names.has('game_lost')).length,
    submitted: started.filter(names => names.has('score_saved')).length,
    wonSubmitted: started.filter(names => names.has('game_won') && names.has('score_saved')).length,
    lostSubmitted: started.filter(names => names.has('game_lost') && names.has('score_saved')).length,
    unfinished: started.filter(names => !names.has('game_won') && !names.has('game_lost')).length,
  };
  const deviceGames = new Map<string, { runs: Set<string>; gamers: Set<string> }>();
  for (const event of events) {
    if (event.name !== 'game_start' || !event.run) continue;
    const stats = deviceGames.get(event.device) ?? { runs: new Set<string>(), gamers: new Set<string>() };
    stats.runs.add(`${event.visitor}:${event.run}`);
    stats.gamers.add(event.visitor);
    deviceGames.set(event.device, stats);
  }
  const currentHour = Math.floor(Date.now() / 3600_000) * 3600_000;
  const hourlyPlayers = Array.from({ length: 12 }, (_, index) => {
    const start = currentHour - (11 - index) * 3600_000;
    const visitors = new Set(events.filter(event => event.name === 'game_start' && event.page === 'game'
      && Date.parse(event.at) >= start && Date.parse(event.at) < start + 3600_000).map(event => event.visitor));
    return { hour: new Date(start).toISOString(), devices: visitors.size };
  });
  return {
    days, since, storage: 'memory', totals: count('All activity', events), events: breakdown,
    daily: groups(e => e.at.slice(0, 10)).sort((a, b) => a.label.localeCompare(b.label)),
    devices: groups(e => e.device).map(device => {
      const stats = deviceGames.get(device.label);
      const games = stats?.runs.size ?? 0;
      const gamers = stats?.gamers.size ?? 0;
      return { ...device, games, gamers, averageGamesPerGamer: gamers ? games / gamers : 0 };
    }),
    sources: groups(e => e.source), hourlyPlayers, flow, funnel,
  };
}
