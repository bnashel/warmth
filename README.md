# Warmth

An ambient, beautiful live map of how a city feels. Emotion is rendered as
glowing, pulsing fields of color. Users drop an emotion + intensity at their
location on a signature slider; it joins the glow in real time.

**Beauty and feel are the whole point.** See [CLAUDE.md](./CLAUDE.md) for the
taste bar and [docs/](./docs) for the build plan and design system.

## Stack
Next.js (App Router) · TypeScript · Tailwind · Framer Motion ·
Mapbox GL JS + react-map-gl · deck.gl · Supabase (Postgres + PostGIS, Auth,
Realtime) · Vercel.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run lint
```

Copy `.env.example` to `.env.local` and fill in the keys when wiring up the map
and Supabase. Deploys: push to `main` → auto-deploys on Vercel.
