import type { Coordinates, Discovery, Intent } from '../data';

export type TourMemory = { seenIds: string[]; coveredThemes: string[]; acceptedDetours: number; declinedDetours: number };
export type RankedDiscovery = { discovery: Discovery; total: number; signals: { relevance: number; novelty: number; proximity: number; visual: number }; explanation: string };

const intentThemes: Record<string, string[]> = {
  'Discover something new': ['hidden histories', 'weird stories'],
  'Go deeper on history': ['civil war', 'medieval barcelona', 'jewish heritage'],
  'Art & culture': ['art', 'culture', 'modernism'],
  'Weird stories': ['weird stories', 'hidden histories'],
  'Local life': ['local life'],
  'Surprise me': ['hidden histories', 'weird stories', 'architecture'],
};

// The visitor's stated intent must beat raw proximity. A five-minute walk
// toward an art story is better than a two-minute detour to unrelated trivia.
export const weights = { relevance: .55, novelty: .20, proximity: .10, visual: .15 } as const;

export const emptyMemory = (): TourMemory => ({ seenIds: [], coveredThemes: [], acceptedDetours: 0, declinedDetours: 0 });

export function metersBetween([latA, lngA]: Coordinates, [latB, lngB]: Coordinates) {
  const rad = Math.PI / 180; const dLat = (latB - latA) * rad; const dLng = (lngB - lngA) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function rankDiscoveries(candidates: Discovery[], position: Coordinates, intent: Intent, memory: TourMemory): RankedDiscovery[] {
  const desired = intentThemes[intent] ?? intentThemes['Surprise me'];
  return candidates.filter(candidate => !memory.seenIds.includes(candidate.id)).map(discovery => {
    const themeMatch = discovery.themes.some(theme => desired.includes(theme));
    const repeatCount = discovery.themes.filter(theme => memory.coveredThemes.includes(theme)).length;
    const distance = metersBetween(position, discovery.coordinates);
    const relevance = discovery.intentAffinity[intent] ?? Math.round(discovery.score.relevance * (themeMatch ? 1 : .68));
    const novelty = Math.max(0, discovery.score.novelty - repeatCount * 32);
    const proximity = Math.max(15, Math.round(100 - distance / 5));
    const visual = discovery.score.visual;
    const total = Math.round(relevance * weights.relevance + novelty * weights.novelty + proximity * weights.proximity + visual * weights.visual);
    const explanation = `${Math.round(distance)}m away · ${themeMatch ? 'matches your mood' : 'a useful contrast'} · ${repeatCount ? 'avoids repeating the last theme' : 'opens a new thread'}`;
    return { discovery, total, signals: { relevance, novelty, proximity, visual }, explanation };
  }).sort((a, b) => b.total - a.total);
}

// Scoring decides WHICH stories are worth the walk; geography decides the ORDER.
// Without this second pass a high-scoring far stop drags the route back and forth.
export function orderByProximity(items: RankedDiscovery[], origin: Coordinates) {
  const remaining = [...items]; const ordered: RankedDiscovery[] = []; let cursor = origin;
  while (remaining.length) {
    let best = 0;
    remaining.forEach((item, index) => { if (metersBetween(cursor, item.discovery.coordinates) < metersBetween(cursor, remaining[best].discovery.coordinates)) best = index; });
    const [next] = remaining.splice(best, 1); ordered.push(next); cursor = next.discovery.coordinates;
  }
  return ordered;
}

export const stopsForDuration = (minutes: number) => minutes >= 90 ? 7 : minutes >= 60 ? 5 : 3;

export function estimateMinutes(stops: Discovery[], origin: Coordinates) {
  let walking = 0; let cursor = origin;
  for (const stop of stops) { walking += metersBetween(cursor, stop.coordinates); cursor = stop.coordinates; }
  return Math.round(stops.reduce((total, stop) => total + stop.minutes, 0) + walking / 78);
}

// Re-rank and re-order whatever is still ahead, from wherever the visitor
// actually is now. Wandering off the plan rewrites the plan instead of breaking it.
export function replanFrom(candidates: Discovery[], position: Coordinates, intent: Intent, memory: TourMemory, count: number) {
  if (count <= 0) return [];
  return orderByProximity(rankDiscoveries(candidates, position, intent, memory).slice(0, count), position);
}

export function createTourPlan(candidates: Discovery[], position: Coordinates, intent: Intent, memory: TourMemory, minutes = 30) {
  return { plan: replanFrom(candidates, position, intent, memory, stopsForDuration(minutes)), ranked: rankDiscoveries(candidates, position, intent, memory) };
}

export function remember(memory: TourMemory, discovery: Discovery, detour: 'accepted' | 'declined' | 'none' = 'none'): TourMemory {
  return { seenIds: [...memory.seenIds, discovery.id], coveredThemes: [...new Set([...memory.coveredThemes, ...discovery.themes])], acceptedDetours: memory.acceptedDetours + Number(detour === 'accepted'), declinedDetours: memory.declinedDetours + Number(detour === 'declined') };
}
