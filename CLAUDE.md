# Warmth — Project Guide for Claude Code
*Read this at the start of every session.*

## Right now
**The Aesthetic Pass (branch `night-pass`): six phases — constitution, night+sky, base city, public field, lights, orb — proof required per phase.**
Update this line as we move through phases (full plan in /docs). Whatever this line says is your top priority.

## What we're building
An ambient, beautiful live map of how a city feels. Emotion is rendered as glowing, pulsing fields of color. Users drop an emotion + intensity at their location on a signature slider; it joins the glow in real time. **Beauty and feel are the whole point** — people open Warmth because it's gorgeous.

## Non-negotiables (the taste bar — never violate)
1. **60fps, always.** If a change risks jank, flag it and propose a lighter approach.
2. **Warmth is always night** (Eli's call, 2026-07-06, superseding the 2026-07-02 day-mode default). The paper-day look is PARKED, not deleted — it lives behind a dev toggle (see docs/later.md) and must keep compiling, but the product never shows it. Color comes only from emotion and small accents.
3. **Spring physics on all motion** (Framer Motion). Nothing linear or instant that the user sees move.
4. **Never generic.** No default dashboards or stock component dumps. Every screen looks intentional and premium. Unsure of the design intent? Ask — don't guess.
5. **The slider is sacred.** The emotion/intensity slider is the signature. Give it extra care and a design-reviewer pass on any change.

## UNBREAKABLE VISUAL RULES
1. **Warmth is always night.** There is no light mode in the product. Time of day changes the night, never replaces it. (The old paper-day style is parked behind a dev toggle — docs/later.md.)
2. **Color belongs to feeling.** The base city is near-monochrome ink. The five emotion hues are the only saturated color on screen. Weather and time modulate the base map only and may never dim or desaturate the emotion layer.
3. **Brightness hierarchy.** Nothing on the base map outshines the dimmest feeling, and nothing pure white ever blooms on the map.
4. **Nothing pops.** Every appearance, disappearance, and state change is a fade, ramp, or eased dissolve.
5. **One glow recipe everywhere:** tight luminous core, exponential falloff, zoom-aware radius. Any glow that renders as a structureless blur is a bug.
6. **60fps always.** Animate transform and opacity only. A style choice that costs frames loses.

## Never do this
- Don't add libraries or dependencies without asking me first.
- Don't refactor or "clean up" code I didn't ask you to touch.
- Don't simplify the hard parts (the map, the glow, the slider) to save effort — the hard parts *are* the product.
- Don't invent data beyond clearly-labeled seed data.
- Don't hard-code or commit secrets/keys.
- Don't edit an already-applied database migration — make a new one.

## How to talk to me (I direct; I don't write code)
- After each change, tell me in **one plain-English sentence** what you did and why.
- When there's a real decision, give me **2–3 options in plain terms** — don't silently pick.
- **Flag anything risky or hard to undo before doing it.**
- Skip jargon unless you explain it. If I need to do something (click, paste, grab a key), give exact steps.

## Tech stack
- Next.js (App Router) + React + TypeScript
- Supabase: Postgres + PostGIS, Auth (anonymous + optional email), Realtime
- Mapbox GL JS (base map) + deck.gl (glow layers)
- Framer Motion (motion), Web Audio (sound)
- Hosting: Vercel. Repo: GitHub.

## Project structure
(Full codebase map with ownership in README.md — keep the two in sync.)
```
/app         page.tsx = the product (one screen); lab/ + maplab/ = dev-only workshops
/components  Screen/ (composition + public/private tabs) · Map/ (city + public field, tune.ts)
             · Orb/ (the slider, feel.ts) · Trail/ (private diary dots) · Lab/ (workshop harnesses)
/lib         theme.ts (tokens), momentsStore.ts (live data), map.ts, location.ts, sound.ts, supabase.ts
/supabase    migrations (via Supabase CLI — never hand-edit applied files)
/docs        build plan, design system, later.md (parked ideas), map-candidates (style history)
```
Ownership: Ben drives Orb/, Eli drives Map/; Screen/, Trail/, lib/ are shared.
Commit prefixes by area: orb: · map: · field: · screen: · trail: · store: · docs:

## Commands
- Dev server: `npm run dev` (labs at /lab and /maplab are dev-only)
- Lint: `npm run lint` · Build: `npm run build`
- Run tests: none yet (no framework installed — ask Ben before adding one)
- Deploy: `npx vercel@latest` for now (Git auto-deploy not connected yet)

## Workflow
- **Plan first** for anything touching more than one file: propose a plan, wait for my approval.
- **Small steps.** One component or endpoint at a time.
- **Tests for logic** (data/API/geo). UI is checked visually via design-reviewer (Playwright).
- **Commit** after each working step with a clear message.
- Migrations only via `supabase migration new ...`.

## Design tokens (source of truth: /lib/theme.ts once built)
Emotion hues (final five; glow-perfection pass 2026-07-07): Joy #F6C049 (radiant gold) · Energy #EE8961 (vermilion coral) · Love #F282AC (rose) · Gratitude #AD97EE (lavender) · Calm #3ED0B0 (aqua).
Motion: snappy = spring(stiffness 400, damping 32); settle = spring(stiffness 140, damping 22); glow pulse ≈ 2.5s ease-in-out loop.
Map: hue = emotion, brightness = intensity, pulse = density.

## Definition of done
- **UI task:** matches tokens, holds 60fps on a mid-range phone, works at mobile width, passed design-reviewer.
- **Logic task:** passing tests, RLS respected (never expose raw individual locations), passed code-reviewer.

## Review agents
- `design-reviewer` — after any UI change (feel, tokens, 60fps, non-generic bar).
- `code-reviewer` — before committing logic (correctness, security/RLS, performance, tests).
