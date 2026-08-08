# Warmth — Build Plan

The phased plan. CLAUDE.md's "Right now" line always points at the current phase.

## Phase 0 — Scaffold & deploy ✅
Next.js (App Router) + TS + Tailwind, the full stack installed (Framer Motion,
Mapbox GL JS + react-map-gl, deck.gl, Supabase JS), folder structure, review
agents, `.mcp.json`, first commit pushed, live on Vercel.

## Phase 1 — The beautiful empty map ✅
A dark, full-bleed Mapbox base with the glow layer wired up. Became far more
than the brief: hand-authored map styles, the custom glow shader (`FieldLayer`),
neighborhoods, the ambient seed city, weather and solar atmosphere. Style
history in `map-candidates/`.

## Phase 2 — The slider (the signature) ✅
The emotion + intensity orb: radial wheel, hold-to-morph arc, continuous
range, detent sound, commit burst. Knobs in `components/Orb/feel.ts`.

## Phase 3 — Data & realtime ✅ (2026-08-04)
Postgres + PostGIS, RLS, and the privacy boundary: two physically separate
tables, a ~330 m grid, aggregate-only reads, a private broadcast channel.
Email sign-in (code-based). The public field is live; the journal is
owner-only; photos sync to private Storage.

**Proven, not assumed:** `scripts/backend-proof/` executes the real migrations
on a real Postgres and attacks every privacy promise (28 tests). Verified
again end-to-end against the live project. **Definition of done met:** the
two-device test passed — a feeling committed on one account's phone bloomed
on another account's screen, coarsened.

## Phase 4 — undecided (Ben + Eli)
The original line here read "trail, sound, polish" — the `private-mode` work
delivered most of it (the journal trail, memories, the time scrubber, the
emotion lens, the ambient sound layer). So Phase 4 needs *defining*, not
just executing.

Candidates, in rough order of how much they gate real people using this:

- **Launch hardening.** Custom SMTP so sign-in emails send at any volume
  (in progress); the welcome bake-off verdict (`WELCOME_DEFAULT` is still
  null, so a new user currently gets *no* intro at all); production
  promotion; Git-connected auto-deploy.
- **The empty-city question.** With a real backend and few users, newcomers
  see the ambient seed city — beautiful, but not real feeling. Decide what a
  sparse-but-honest city looks like before strangers arrive.
- **Account depth.** Export / change email / delete are in. Beyond that:
  anonymous→named upgrade without stranding entries, multi-city support.
- **The next feeling.** Whatever you two actually want to build.

_Parked ideas live in `later.md`._
