import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Coordinates, Discovery } from './data';

type Pin = { at: Coordinates; icon: L.DivIcon; title: string; onClick?: () => void; z?: number };

export function TourMap({ origin, from, here, to, legs = [], stops = [], candidates = [], activeIndex = 0, onSelectCandidate, bottomInset = 0, compact = false, full = false }: { origin: Coordinates; from: Coordinates; here?: Coordinates; to: Coordinates; legs?: { coordinates: Coordinates[]; distance: number }[]; stops?: Discovery[]; candidates?: Discovery[]; activeIndex?: number; onSelectCandidate?: (discovery: Discovery) => void; bottomInset?: number; compact?: boolean; full?: boolean }) {
  const element = useRef<HTMLDivElement | null>(null); const mapRef = useRef<L.Map | null>(null); const group = useRef<L.LayerGroup | null>(null);
  const selectRef = useRef(onSelectCandidate); selectRef.current = onSelectCandidate;
  const drawRef = useRef<() => void>(() => {}); const fitRef = useRef<() => void>(() => {});

  useEffect(() => { if (!element.current || mapRef.current) return; const map = L.map(element.current, { zoomControl: false, attributionControl: true, dragging: !compact, scrollWheelZoom: !compact }).setView(from, 16); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map); L.control.zoom({ position: 'bottomright' }).addTo(map); mapRef.current = map; return () => { map.remove(); mapRef.current = null; }; }, [compact]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const metres = (a: Coordinates, b: Coordinates) => map.distance(a, b);
    const chain: Coordinates[] = [origin, ...stops.map(stop => stop.coordinates)];
    // Each leg gets its real street geometry when routing supplied one.
    const legLine = (index: number): Coordinates[] => legs[index]?.coordinates?.length ? legs[index].coordinates : [chain[index], chain[index + 1]];
    const activePoints = legs[activeIndex]?.coordinates?.length ? legs[activeIndex].coordinates : [from, to];
    const youAreHere = here ?? from;

    const draw = () => {
      group.current?.remove(); const layers = L.layerGroup().addTo(map); group.current = layers;

      const dot = (color: string, size: number, label?: string, extra = '') => L.divIcon({ className: 'map-dot-wrap', html: `<span class="map-dot ${extra}" style="--dot:${color};--size:${size}px">${label ?? ''}</span>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
      const pins: Pin[] = [];
      if (stops.length) stops.forEach((stop, index) => {
        const done = index < activeIndex; const current = index === activeIndex;
        pins.push({ at: stop.coordinates, title: stop.location, z: current ? 400 : 200, onClick: () => selectRef.current?.(stop), icon: dot(done ? '#c9c3b6' : current ? '#ee6941' : '#f8f2e8', current ? 30 : 24, done ? '✓' : String(index + 1), done ? 'numbered done' : 'numbered') });
      });
      else pins.push({ at: to, title: '', icon: dot('#ee6941', 24) });
      candidates.forEach(candidate => pins.push({ at: candidate.coordinates, title: candidate.location, z: 100, onClick: () => selectRef.current?.(candidate), icon: dot('#1d3a2e', 22, '✦', 'ghost') }));

      // The Gothic Quarter packs these places within metres of each other, so at the
      // zoom that shows the whole walk their pins collide. Fan a colliding group out
      // around its centre and tether each one back to where it really is. Resolve this
      // before anything else is drawn, so labels can avoid where pins actually land.
      const truePoints = pins.map(pin => map.latLngToLayerPoint(pin.at));
      const placed: { pin: Pin; point: L.Point; tethered: boolean }[] = [];
      const taken = pins.map(() => false);
      pins.forEach((_, i) => {
        if (taken[i]) return;
        const cluster = [i]; taken[i] = true;
        pins.forEach((__, j) => { if (j > i && !taken[j] && truePoints[i].distanceTo(truePoints[j]) < 32) { cluster.push(j); taken[j] = true; } });
        if (cluster.length === 1) { placed.push({ pin: pins[i], point: truePoints[i], tethered: false }); return; }
        const centre = cluster.reduce((sum, k) => sum.add(truePoints[k]), L.point(0, 0)).divideBy(cluster.length);
        const radius = 20 + cluster.length * 5;
        cluster.forEach((k, order) => {
          const angle = (order / cluster.length) * Math.PI * 2 - Math.PI / 2;
          placed.push({ pin: pins[k], point: L.point(centre.x + Math.cos(angle) * radius, centre.y + Math.sin(angle) * radius), tethered: true });
        });
      });

      for (let i = 0; i < activeIndex && i + 1 < chain.length; i++) L.polyline(legLine(i), { color: '#7d8a80', weight: 3, opacity: .5, dashArray: '2 7' }).addTo(layers);
      L.polyline(activePoints, { color: '#ee6941', weight: 5, opacity: .96 }).addTo(layers);
      for (let i = activeIndex + 1; i + 1 < chain.length; i++) L.polyline(legLine(i), { color: '#ee6941', weight: 3.5, opacity: .58, dashArray: '7 9' }).addTo(layers);

      // How far each leg actually is, so the cost of the walk is legible up front.
      const clearance = (at: L.Point) => Math.min(...placed.map(entry => entry.point.distanceTo(at)), Infinity);
      if (!compact) for (let i = activeIndex; i + 1 < chain.length; i++) {
        const distance = Math.round(legs[i]?.distance ?? metres(chain[i], chain[i + 1])); if (distance < 60) continue;
        const line = legLine(i); const mid0 = line[Math.floor(line.length / 2)] ?? chain[i];
        const a = map.latLngToLayerPoint(line[Math.max(0, Math.floor(line.length / 2) - 1)] ?? chain[i]); const b = map.latLngToLayerPoint(mid0);
        const span = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const mid = map.latLngToLayerPoint(mid0);
        const off = L.point(-(b.y - a.y) / span * 16, (b.x - a.x) / span * 16);
        // Try either side of the leg, and drop the label rather than stack it on a pin.
        const options = [mid.add(off), mid.subtract(off)].sort((x, y) => clearance(y) - clearance(x));
        if (clearance(options[0]) < 38) continue;
        L.marker(map.layerPointToLatLng(options[0]), { icon: L.divIcon({ className: 'leg-label-wrap', html: `<span class="leg-label${i === activeIndex ? ' now' : ''}">${distance}m</span>`, iconSize: [0, 0] }), interactive: false }).addTo(layers);
      }

      placed.forEach(({ pin, point, tethered }) => {
        const at = map.layerPointToLatLng(point);
        if (tethered) L.polyline([pin.at, [at.lat, at.lng]], { color: '#11251d', weight: 1, opacity: .28, interactive: false }).addTo(layers);
        L.marker(at, { icon: pin.icon, title: pin.title, riseOnHover: true, zIndexOffset: pin.z ?? 0 }).addTo(layers).on('click', () => pin.onClick?.());
      });

      L.marker(youAreHere, { icon: L.divIcon({ className: 'map-dot-wrap', html: '<span class="map-here"><i></i><b></b></span>', iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 1000, title: 'You are here' }).addTo(layers);
    };

    const fit = () => {
      const inset = Math.round((element.current?.clientHeight ?? 0) * bottomInset);
      const pad = compact ? 25 : 45;
      map.fitBounds(L.latLngBounds([...activePoints, ...chain, ...candidates.map(candidate => candidate.coordinates)]), { paddingTopLeft: [pad, pad + 40], paddingBottomRight: [pad, pad + inset], maxZoom: 17 });
    };
    drawRef.current = draw; fitRef.current = fit;
    draw(); fit();
    // Pixel collisions change with zoom, so the fan has to be recomputed.
    map.on('zoomend', draw);
    return () => { map.off('zoomend', draw); };
  }, [origin, from, here, to, legs, stops, candidates, activeIndex, bottomInset, compact]);

  return <div className={compact ? 'tour-map compact-map' : full ? 'tour-map full-map' : 'tour-map'} ref={element}>
    {!compact && <button type="button" className="map-recenter" aria-label="Recentre the map" onClick={event => { event.stopPropagation(); fitRef.current(); }}>◎</button>}
  </div>;
}
