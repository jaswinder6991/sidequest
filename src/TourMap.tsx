import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Coordinates, Discovery } from './data';

export function TourMap({ from, to, route, stops = [], candidates = [], activeIndex = 0, onSelectCandidate, bottomInset = 0, compact = false, full = false }: { from: Coordinates; to: Coordinates; route?: Coordinates[]; stops?: Discovery[]; candidates?: Discovery[]; activeIndex?: number; onSelectCandidate?: (discovery: Discovery) => void; bottomInset?: number; compact?: boolean; full?: boolean }) {
  const element = useRef<HTMLDivElement | null>(null); const mapRef = useRef<L.Map | null>(null); const group = useRef<L.LayerGroup | null>(null);
  // Held in a ref so re-rendering the parent never forces the layers to rebuild.
  const selectRef = useRef(onSelectCandidate); selectRef.current = onSelectCandidate;
  useEffect(() => { if (!element.current || mapRef.current) return; const map = L.map(element.current, { zoomControl: false, attributionControl: true, dragging: !compact, scrollWheelZoom: !compact }).setView(from, 16); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map); L.control.zoom({ position: 'bottomright' }).addTo(map); mapRef.current = map; return () => { map.remove(); mapRef.current = null; }; }, [compact]);
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    group.current?.remove(); const layers = L.layerGroup().addTo(map); group.current = layers;
    const points = route?.length ? route : [from, to];
    L.polyline(points, { color: '#ee6941', weight: 5, opacity: .96, dashArray: route ? undefined : '8 7' }).addTo(layers);
    const dot = (color: string, size: number, label?: string, extra = '') => L.divIcon({ className: 'map-dot-wrap', html: `<span class="map-dot ${extra}" style="--dot:${color};--size:${size}px">${label ?? ''}</span>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    L.marker(from, { icon: dot('#11251d', 16) }).addTo(layers);
    if (stops.length) stops.forEach((stop, index) => L.marker(stop.coordinates, { icon: dot(index === activeIndex ? '#ee6941' : '#f8f2e8', index === activeIndex ? 30 : 24, String(index + 1), 'numbered'), title: stop.location, riseOnHover: true }).addTo(layers).on('click', () => selectRef.current?.(stop)));
    else L.marker(to, { icon: dot('#ee6941', 24) }).addTo(layers);
    // Everything the visitor could still wander off to, tappable straight from the map.
    candidates.forEach(candidate => L.marker(candidate.coordinates, { icon: dot('#1d3a2e', 22, '✦', 'ghost'), title: candidate.location, riseOnHover: true }).addTo(layers).on('click', () => selectRef.current?.(candidate)));
    // A sheet covers the lower part of the map, so keep the pins out from under it.
    const inset = Math.round((element.current?.clientHeight ?? 0) * bottomInset);
    const bounds = L.latLngBounds([...points, ...stops.map(stop => stop.coordinates), ...candidates.map(candidate => candidate.coordinates)]);
    const pad = compact ? 25 : 45;
    map.fitBounds(bounds, { paddingTopLeft: [pad, pad + 40], paddingBottomRight: [pad, pad + inset], maxZoom: 17 });
  }, [from, to, route, stops, candidates, activeIndex, bottomInset, compact]);
  return <div className={compact ? 'tour-map compact-map' : full ? 'tour-map full-map' : 'tour-map'} ref={element} />;
}
