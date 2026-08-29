import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fal } from '@fal-ai/client';

const app = express();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
app.use(express.json());

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

app.post('/api/route', async (request, response) => {
  const { from, to } = request.body ?? {};
  if (!Array.isArray(from) || !Array.isArray(to) || !process.env.OPENROUTESERVICE_API_KEY) return response.status(503).json({ error: 'Routing is not configured' });
  const [fromLat, fromLng] = from; const [toLat, toLng] = to;
  const url = 'https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson';
  try {
    const ors = await fetch(url, { method: 'POST', headers: { Authorization: process.env.OPENROUTESERVICE_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ coordinates: [[fromLng, fromLat], [toLng, toLat]] }) });
    if (!ors.ok) return response.status(502).json({ error: 'Routing request failed' });
    const result = await ors.json(); const feature = result.features?.[0]; const firstStep = feature?.properties?.segments?.[0]?.steps?.[0];
    response.json({ coordinates: feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]), duration: feature.properties.summary.duration, distance: feature.properties.summary.distance, instruction: firstStep?.instruction });
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
