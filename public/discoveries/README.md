Drop one image per discovery here, named `<id>.jpg` (see `id` values in `src/data.ts`).

- `npm run visuals` generates all of them with Fal (needs `FAL_KEY` in `.env`).
- Or add your own photographs with the same filenames.
- Or set `image: 'https://…'` on a discovery in `src/data.ts` to point elsewhere.

Missing files fall back to a styled gradient card, so the app never looks broken.
