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
    runs.set(key, names);
  }
  const started = [...runs.values()].filter(names => names.has('game_start'));
  const funnel = {
    started: started.length,
    won: started.filter(names => names.has('game_won')).length,
    lost: started.filter(names => names.has('game_lost')).length,
    submitted: started.filter(names => names.has('score_saved')).length,
    wonSubmitted: started.filter(names => names.has('game_won') && names.has('score_saved')).length,
    lostSubmitted: started.filter(names => names.has('game_lost') && names.has('score_saved')).length,
    unfinished: started.filter(names => !names.has('game_won') && !names.has('game_lost')).length,
  };
  return {
    days, since, storage: 'memory', totals: count('All activity', events), events: breakdown,
    daily: groups(e => e.at.slice(0, 10)).sort((a, b) => a.label.localeCompare(b.label)),
    devices: groups(e => e.device), sources: groups(e => e.source), funnel,
  };
}
