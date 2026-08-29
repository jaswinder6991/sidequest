import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Coordinates, Discovery } from './data';

export function TourMap({ origin, from, to, route, stops = [], candidates = [], activeIndex = 0, onSelectCandidate, bottomInset = 0, compact = false, full = false }: { origin: Coordinates; from: Coordinates; to: Coordinates; route?: Coordinates[]; stops?: Discovery[]; candidates?: Discovery[]; activeIndex?: number; onSelectCandidate?: (discovery: Discovery) => void; bottomInset?: number; compact?: boolean; full?: boolean }) {
  const element = useRef<HTMLDivElement | null>(null); const mapRef = useRef<L.Map | null>(null); const group = useRef<L.LayerGroup | null>(null);
  const selectRef = useRef(onSelectCandidate); selectRef.current = onSelectCandidate;
  useEffect(() => { if (!element.current || mapRef.current) return; const map = L.map(element.current, { zoomControl: false, attributionControl: true, dragging: !compact, scrollWheelZoom: !compact }).setView(from, 16); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map); L.control.zoom({ position: 'bottomright' }).addTo(map); mapRef.current = map; return () => { map.remove(); mapRef.current = null; }; }, [compact]);
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    group.current?.remove(); const layers = L.layerGroup().addTo(map); group.current = layers;

    // The whole walk, drawn as one thread: where you have been, where you are
    // going next, and the shape of everything after that.
    const chain: Coordinates[] = [origin, ...stops.map(stop => stop.coordinates)];
    for (let i = 0; i < activeIndex && i + 1 < chain.length; i++) L.polyline([chain[i], chain[i + 1]], { color: '#7d8a80', weight: 3, opacity: .5, dashArray: '2 7' }).addTo(layers);
    const activePoints = route?.length ? route : [from, to];
    L.polyline(activePoints, { color: '#ee6941', weight: 5, opacity: .96 }).addTo(layers);
    for (let i = activeIndex + 1; i + 1 < chain.length; i++) L.polyline([chain[i], chain[i + 1]], { color: '#ee6941', weight: 3.5, opacity: .58, dashArray: '7 9' }).addTo(layers);

    const dot = (color: string, size: number, label?: string, extra = '') => L.divIcon({ className: 'map-dot-wrap', html: `<span class="map-dot ${extra}" style="--dot:${color};--size:${size}px">${label ?? ''}</span>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    if (stops.length) stops.forEach((stop, index) => {
      const done = index < activeIndex; const current = index === activeIndex;
      L.marker(stop.coordinates, { icon: dot(done ? '#c9c3b6' : current ? '#ee6941' : '#f8f2e8', current ? 30 : 24, done ? '✓' : String(index + 1), done ? 'numbered done' : 'numbered'), title: stop.location, riseOnHover: true }).addTo(layers).on('click', () => selectRef.current?.(stop));
    });
    else L.marker(to, { icon: dot('#ee6941', 24) }).addTo(layers);
    candidates.forEach(candidate => L.marker(candidate.coordinates, { icon: dot('#1d3a2e', 22, '✦', 'ghost'), title: candidate.location, riseOnHover: true }).addTo(layers).on('click', () => selectRef.current?.(candidate)));
    // "You are here" goes on top of everything else.
    L.marker(from, { icon: L.divIcon({ className: 'map-dot-wrap', html: '<span class="map-here"><i></i><b></b></span>', iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 1000, title: 'You are here' }).addTo(layers);

    const inset = Math.round((element.current?.clientHeight ?? 0) * bottomInset);
    const bounds = L.latLngBounds([...activePoints, ...chain, ...candidates.map(candidate => candidate.coordinates)]);
    const pad = compact ? 25 : 45;
    map.fitBounds(bounds, { paddingTopLeft: [pad, pad + 40], paddingBottomRight: [pad, pad + inset], maxZoom: 17 });
  }, [origin, from, to, route, stops, candidates, activeIndex, bottomInset, compact]);
  return <div className={compact ? 'tour-map compact-map' : full ? 'tour-map full-map' : 'tour-map'} ref={element} />;
}
