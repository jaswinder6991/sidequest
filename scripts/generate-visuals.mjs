// Pre-generates one cinematic reconstruction per discovery into public/discoveries.
// Pre-generating matters: the visitor judges a place by looking at it, and a
// twelve-second wait at the decision point is not a decision, it is a loading screen.
//   FAL_KEY=... node scripts/generate-visuals.mjs [--force] [id ...]
import { writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fal } from '@fal-ai/client';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'discoveries');

if (!process.env.FAL_KEY) { console.error('FAL_KEY is not set. Add it to .env, then: node --env-file-if-exists=.env scripts/generate-visuals.mjs'); process.exit(1); }

const source = await readFileText(path.join(root, 'src', 'data.ts'));
const prompts = await readFileText(path.join(root, 'src', 'lib', 'creative.ts'));
const wrapper = prompts.match(/return `([\s\S]*?)`;/)?.[1] ?? '';
const entries = [...source.matchAll(/\{ id: '([^']+)'[\s\S]*?visualDirection: '((?:[^'\\]|\\.)*)'/g)].map(m => ({ id: m[1], direction: m[2].replace(/\\'/g, "'") }));

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter(a => !a.startsWith('--'));
const targets = only.length ? entries.filter(e => only.includes(e.id)) : entries;
if (!targets.length) { console.error('No matching discovery ids. Known:', entries.map(e => e.id).join(', ')); process.exit(1); }

let made = 0;
for (const entry of targets) {
  const file = path.join(outDir, `${entry.id}.jpg`);
  if (!force && await exists(file)) { console.log(`· ${entry.id} already exists, skipping (use --force to replace)`); continue; }
  const prompt = wrapper.replace('${discovery.visualDirection}', entry.direction);
  process.stdout.write(`… ${entry.id} `);
  try {
    const result = await fal.subscribe('fal-ai/flux/schnell', { input: { prompt, image_size: 'portrait_16_9', num_images: 1 } });
    const url = result.data.images?.[0]?.url;
    if (!url) throw new Error('no image returned');
    const image = await fetch(url);
    if (!image.ok) throw new Error(`download failed: ${image.status}`);
    await writeFile(file, Buffer.from(await image.arrayBuffer()));
    made += 1; console.log('✓');
  } catch (error) { console.log('✗', error.message); }
}
console.log(`\n${made} of ${targets.length} written to public/discoveries/`);

async function exists(file) { try { await access(file); return true; } catch { return false; } }
async function readFileText(file) { const { readFile } = await import('node:fs/promises'); return readFile(file, 'utf8'); }
