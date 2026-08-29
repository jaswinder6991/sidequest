# SideQuest

> Your city, unexpectedly.

SideQuest is a UI-first, hackathon prototype for an adaptive AI city walk. It
starts with a deliberately narrow promise: give a visitor a remarkable
30-minute walk through Barcelona's Gothic Quarter.

Instead of following a fixed audio tour, the visitor chooses a mood and the
guide selects the next discovery based on relevance, novelty, proximity, visual
potential, and what the visitor has already seen. The result is an experience
that feels more like wandering with an unusually perceptive local friend.

## Experience

- Mood and duration selection
- A real interactive Leaflet/OpenStreetMap route
- Cala-powered story enrichment with safe fallback copy
- Explainable discovery scoring and tour memory
- An adaptive, interrupt-worthy detour
- “Why this?” recommendation transparency
- Browser speech fallback, with an ElevenLabs streaming endpoint ready
- On-demand Fal historical reconstructions: a cinematic “Reveal the past” moment, generated only when a guest taps it

## Stack

- React + TypeScript + Vite
- Express API adapter
- Leaflet + OpenStreetMap for map rendering
- openrouteservice for pedestrian routes
- Cala for verified knowledge and story context
- Fal for visual story moments
- ElevenLabs for future guide narration

## Run locally

```sh
npm install
cp .env.example .env
npm run server # terminal 1: API adapters on :8787
npm run dev    # terminal 2: app on :5173
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The complete demo flow is
available even without keys; configured providers enrich it progressively.

## Configuration

Create `.env` from `.env.example`. It is ignored by Git.

```env
CALA_API_KEY=
CALA_API_BASE_URL=https://api.cala.ai/v1
OPENROUTESERVICE_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
FAL_KEY=
```

All keys are used only by the Express server—never by React code in the
browser.

## API adapters

- `POST /api/discover` — Cala: enriches a discovery with an accurate, concise story.
- `POST /api/route` — openrouteservice: returns a walkable route and ETA.
- `POST /api/narrate` — ElevenLabs: streams MP3 narration for a selected guide voice.
- `POST /api/visual` — Fal: generates a vertical story visual from a curated prompt.

## Project structure

```text
src/
  App.tsx                    # Tour flow and interaction state
  TourMap.tsx                # Leaflet map and route rendering
  data.ts                    # Initial Gothic Quarter discovery registry
  lib/discovery-engine.ts    # Ranking, tour memory, explainable scoring
  lib/creative.ts            # Fal visual and ElevenLabs narration prompts
server/index.mjs             # Provider-safe server adapters
```

## Current scope

The Gothic Quarter discovery registry is intentionally small. This makes the
demo dependable while retaining a genuine Cala → ranking → route → story loop.
The next product expansion is dynamic candidate ingestion, live location
updates, and generation/caching of the three key visual beats.
