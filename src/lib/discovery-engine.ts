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

export const emptyMemory = (): TourMemory => ({ seenIds: [], coveredThemes: [], acceptedDetours: 0, declinedDetours: 0 });

function metersBetween([latA, lngA]: Coordinates, [latB, lngB]: Coordinates) {
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
    // The visitor's stated intent must beat raw proximity. A five-minute walk
    // toward an art story is better than a two-minute detour to unrelated trivia.
    const total = Math.round(relevance * .55 + novelty * .20 + proximity * .10 + visual * .15);
    const explanation = `${Math.round(distance)}m away · ${themeMatch ? 'matches your mood' : 'a useful contrast'} · ${repeatCount ? 'avoids repeating the last theme' : 'opens a new thread'}`;
    return { discovery, total, signals: { relevance, novelty, proximity, visual }, explanation };
  }).sort((a, b) => b.total - a.total);
}

export function createTourPlan(candidates: Discovery[], position: Coordinates, intent: Intent, memory: TourMemory) {
  const ranked = rankDiscoveries(candidates, position, intent, memory);
  return ranked.slice(0, 3);
}

export function remember(memory: TourMemory, discovery: Discovery, detour: 'accepted' | 'declined' | 'none' = 'none'): TourMemory {
  return { seenIds: [...memory.seenIds, discovery.id], coveredThemes: [...new Set([...memory.coveredThemes, ...discovery.themes])], acceptedDetours: memory.acceptedDetours + Number(detour === 'accepted'), declinedDetours: memory.declinedDetours + Number(detour === 'declined') };
}
