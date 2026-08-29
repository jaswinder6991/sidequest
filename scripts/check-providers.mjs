// Answers one question: which providers are actually working right now?
//   npm run check
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rows = [];
const add = (name, state, detail) => rows.push({ name, state, detail });

// 1. Cala — the story rewriting
if (!process.env.CALA_API_KEY) add('Cala (stories)', 'off', 'CALA_API_KEY not set — app uses its own written stories');
else try {
  const base = (process.env.CALA_API_BASE_URL || 'https://api.cala.ai/v1').replace(/\/$/, '');
  const r = await fetch(`${base}/knowledge/search`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': process.env.CALA_API_KEY }, body: JSON.stringify({ input: 'One sentence about Plaça de Sant Felip Neri, Barcelona.', explainability: true }) });
  const body = await r.text();
  add('Cala (stories)', r.ok ? 'ok' : 'fail', r.ok ? `${body.length} bytes back` : `HTTP ${r.status} — ${body.slice(0, 90)}`);
} catch (e) { add('Cala (stories)', 'fail', e.message); }

// 2. Walking routes — a key is optional now, there is a keyless fallback
try {
  const probe = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/2.1768,41.3831;2.1773,41.3837?overview=false';
  if (process.env.OPENROUTESERVICE_API_KEY) {
    const r = await fetch('https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson', { method: 'POST', headers: { Authorization: process.env.OPENROUTESERVICE_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ coordinates: [[2.1768, 41.3831], [2.1773, 41.3837]] }) });
    add('Routing (real streets)', r.ok ? 'ok' : 'fail', r.ok ? 'openrouteservice key works' : `openrouteservice HTTP ${r.status} — will fall back to OSRM`);
  } else {
    const r = await fetch(probe);
    const body = await r.json().catch(() => ({}));
    add('Routing (real streets)', r.ok && body.code === 'Ok' ? 'ok' : 'fail', r.ok && body.code === 'Ok' ? 'public OSRM foot service (no key needed)' : 'OSRM unreachable — map falls back to straight lines');
  }
} catch (e) { add('Routing (real streets)', 'fail', e.message); }

// 3. ElevenLabs — the guide's voice
if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) add('ElevenLabs (voice)', 'off', 'ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID not set — browser speech is used');
else try {
  const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY } });
  const body = await r.json().catch(() => ({}));
  const known = body?.voices?.some(v => v.voice_id === process.env.ELEVENLABS_VOICE_ID);
  add('ElevenLabs (voice)', r.ok ? (known ? 'ok' : 'warn') : 'fail', !r.ok ? `HTTP ${r.status}` : known ? 'key and voice id both valid' : 'key works, but that VOICE_ID is not in your account');
} catch (e) { add('ElevenLabs (voice)', 'fail', e.message); }

// 4. Fal — the historical images (pre-generated, so check the files)
const dir = path.join(root, 'public', 'discoveries');
const files = await readdir(dir).catch(() => []);
const images = files.filter(f => f.endsWith('.jpg'));
if (images.length >= 7) add('Fal (images)', 'ok', `${images.length} images ready in public/discoveries/`);
else if (process.env.FAL_KEY) add('Fal (images)', 'warn', `only ${images.length} of 7 images — run: npm run visuals`);
else add('Fal (images)', 'off', 'FAL_KEY not set and no images — cards show a gradient');

const mark = { ok: '  WORKING', warn: '  CHECK  ', fail: '  BROKEN ', off: '  OFF    ' };
console.log('\n  SideQuest provider check\n  ' + '-'.repeat(62));
for (const r of rows) console.log(`${mark[r.state]}  ${r.name.padEnd(24)} ${r.detail}`);
console.log('  ' + '-'.repeat(62));
console.log('  OFF is safe: the app falls back and the demo still runs end to end.\n');
