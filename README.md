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

## The app, in one sentence
One screen: the city breathing full-bleed (**public** = everyone's feeling as
a thin layer of colored water; **private** = your own moments as dots, only on
your device), with the **orb** — the signature emotion + intensity slider —
floating above it.

## Codebase map — what's what

```
/app
  page.tsx            THE product: renders the one screen. Nothing else ships.
  lab/                orb workshop   (dev-only; hidden in prod unless NEXT_PUBLIC_LABS=1)
  maplab/             map workshop   (dev-only; same flag)

/components
  Screen/   the one screen — composes map + orb + public/private tabs
  Map/      the city & THE FIELD (public view): base style, two field
            engines (FieldLayer = Ben's pond/paper, GalleryFieldLayer =
            Eli's gallery), looks.ts + lookState.ts (THE VERSION GALLERY:
            every look from both trunks, live-switchable), neighborhoods,
            ambient seed, and the dial books — tune.ts (live knobs) +
            galleryTune.ts (frozen snapshot for the preserved looks)
  Orb/      THE SLIDER (the signature): orb, gesture flow, burst,
            and feel.ts (every orb feel-knob)
  Trail/    THE DIARY (private view): your commits as glowing marks —
            ember, thread, or garden (the active look picks the pairing)
  Lab/      dev-gated harnesses (look gallery, weather preview, labs) &
            test seed data — never visible to real users

/lib        shared plumbing: theme.ts (tokens — source of truth),
            momentsStore.ts (the live data both views render),
            map.ts, location.ts, sound.ts, supabase.ts

/supabase   migrations (via Supabase CLI only)
/docs       build plan, design system, parked ideas, map style history,
            worlds.md (the map of every look/world + the switcher contract)
```

Rule of thumb: **look-and-feel knobs live in `Map/tune.ts` and `Orb/feel.ts`**
— tweak there first; machinery lives next to them.

## Working agreements
- **Ownership:** Ben drives the orb/slider (`components/Orb`), Eli drives the
  map (`components/Map`). `Screen/`, `Trail/`, and `lib/` are shared — mention
  changes there in your PR/commit.
- **Branches:** `<name>/<thing>` (e.g. `ben/one-screen`). `main` is always the
  real product.
- **Commits:** prefix with the area so history reads like a log of the product:
  `orb:`, `map:`, `field:`, `screen:`, `trail:`, `store:`, `docs:`.
- Superseded ideas aren't deleted from memory — they're parked in
  [docs/later.md](./docs/later.md).

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run lint
```

Copy `.env.example` to `.env.local` and fill in the keys when wiring up the map
and Supabase. Deploys: push to `main` → auto-deploys on Vercel.
