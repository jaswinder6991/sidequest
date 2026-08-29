import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Readable } from 'node:stream';
import helmet from 'helmet';
import { fal } from '@fal-ai/client';

const app = express();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Only these origins are ever loaded by the browser. Every provider key stays
// server-side, so the page itself never talks to Cala, Fal, ElevenLabs or the
// routers directly and none of them belong in connect-src.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      // React sets element style attributes and Leaflet positions its panes inline.
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', 'https://*.fal.media'],
      'media-src': ["'self'", 'blob:'],
      'connect-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  // Tiles and fonts are cross-origin; requiring CORP on them would block both.
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'no-referrer' },
}));

// Every endpoint here takes a small JSON object; nothing needs the 100kb default.
app.use(express.json({ limit: '32kb' }));

app.post('/api/discover', async (request, response) => {
  const { discovery, intent = 'Surprise me' } = request.body ?? {};
  if (!discovery?.title || !process.env.CALA_API_KEY) return response.status(503).json({ error: 'Cala is not configured' });
  const input = `Write one vivid, accurate, 55-word maximum story for a curious visitor at ${discovery.location}, Barcelona. Their mood is ${intent}. Focus on the surprising connection behind “${discovery.title}”. Do not use a heading or markdown.`;
  try {
    const calaBaseUrl = (process.env.CALA_API_BASE_URL || 'https://api.cala.ai/v1').replace(/\/$/, '');
    const cala = await fetch(`${calaBaseUrl}/knowledge/search`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': process.env.CALA_API_KEY }, body: JSON.stringify({ input, explainability: true, return_entities: true }) });
    if (!cala.ok) return response.status(502).json({ error: 'Cala request failed' });
    const result = await cala.json(); response.json({ story: result.content, sources: result.explainability ?? [] });
  } catch { response.status(502).json({ error: 'Cala is unreachable' }); }
});

// Routes the whole itinerary in one call and returns each leg separately, so the
// map can style them independently. openrouteservice when a key is present,
// otherwise the public OSRM foot service, which needs no key at all.
app.post('/api/route', async (request, response) => {
  const points = Array.isArray(request.body?.coordinates) ? request.body.coordinates
    : [request.body?.from, request.body?.to].filter(Array.isArray);
  if (points.length < 2 || points.some(point => point.length !== 2)) return response.status(400).json({ error: 'Need at least two [lat, lng] points' });
  const asLngLat = points.map(([lat, lng]) => [lng, lat]);
  try {
    if (process.env.OPENROUTESERVICE_API_KEY) {
      const ors = await fetch('https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson', {
        method: 'POST', headers: { Authorization: process.env.OPENROUTESERVICE_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates: asLngLat }) });
      if (ors.ok) {
        const feature = (await ors.json()).features?.[0];
        const line = feature?.geometry?.coordinates ?? [];
        const marks = feature?.properties?.way_points ?? [];
        const legs = (feature?.properties?.segments ?? []).map((segment, index) => ({
          coordinates: line.slice(marks[index] ?? 0, (marks[index + 1] ?? line.length - 1) + 1).map(([lng, lat]) => [lat, lng]),
          distance: segment.distance, duration: segment.duration, instruction: segment.steps?.[0]?.instruction }));
        if (legs.length) return response.json({ provider: 'openrouteservice', legs });
      }
    }
    const osrm = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${asLngLat.map(pair => pair.join(',')).join(';')}?overview=full&geometries=geojson&steps=true`);
    if (!osrm.ok) return response.status(502).json({ error: 'Routing request failed' });
    const result = await osrm.json();
    if (result.code !== 'Ok' || !result.routes?.length) return response.status(502).json({ error: `Routing failed: ${result.code}` });
    const legs = result.routes[0].legs.map(leg => ({
      coordinates: leg.steps.flatMap(step => step.geometry.coordinates).map(([lng, lat]) => [lat, lng]),
      distance: leg.distance, duration: leg.duration, instruction: leg.steps?.[0]?.name || undefined }));
    response.json({ provider: 'osrm-foot', legs });
  } catch { response.status(502).json({ error: 'Routing is unreachable' }); }
});

app.post('/api/narrate', async (request, response) => {
  const { text } = request.body ?? {};
  if (!text || !process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) return response.status(503).json({ error: 'ElevenLabs is not configured' });
  try {
    const eleven = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}/stream?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: .38, similarity_boost: .78, style: .12, use_speaker_boost: true } }),
    });
    if (!eleven.ok || !eleven.body) return response.status(502).json({ error: 'ElevenLabs request failed' });
    response.setHeader('Content-Type', eleven.headers.get('content-type') ?? 'audio/mpeg');
    Readable.fromWeb(eleven.body).pipe(response);
  } catch { response.status(502).json({ error: 'ElevenLabs is unreachable' }); }
});

app.post('/api/visual', async (request, response) => {
  const { prompt } = request.body ?? {};
  if (!prompt || !process.env.FAL_KEY) return response.status(503).json({ error: 'Fal is not configured' });
  try {
    const result = await fal.subscribe('fal-ai/flux/schnell', { input: { prompt, image_size: 'portrait_16_9', num_images: 1 } });
    response.json({ imageUrl: result.data.images?.[0]?.url, requestId: result.requestId });
  } catch { response.status(502).json({ error: 'Fal request failed' }); }
});

app.use(express.static(path.join(root, 'dist')));
app.get('/{*splat}', (_request, response) => response.sendFile(path.join(root, 'dist', 'index.html')));
app.listen(process.env.PORT ?? 8787, () => console.log('SideQuest API listening on port 8787'));
