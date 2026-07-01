# Warmth — Project Guide for Claude Code
*Read this at the start of every session.*

## Right now
**Phase 0 → 1: get the app scaffolded and deployed, then make the empty map beautiful.**
Update this line as we move through phases (full plan in /docs). Whatever this line says is your top priority.

## What we're building
An ambient, beautiful live map of how a city feels. Emotion is rendered as glowing, pulsing fields of color. Users drop an emotion + intensity at their location on a signature slider; it joins the glow in real time. **Beauty and feel are the whole point** — people open Warmth because it's gorgeous.

## Non-negotiables (the taste bar — never violate)
1. **60fps, always.** If a change risks jank, flag it and propose a lighter approach.
2. **Dark-first.** Near-black base (#0A0B0F). Color comes only from the emotional glow and small accents.
3. **Spring physics on all motion** (Framer Motion). Nothing linear or instant that the user sees move.
4. **Never generic.** No default dashboards or stock component dumps. Every screen looks intentional and premium. Unsure of the design intent? Ask — don't guess.
5. **The slider is sacred.** The emotion/intensity slider is the signature. Give it extra care and a design-reviewer pass on any change.

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
```
/app         Next.js routes
/components  UI by feature: Map/, Slider/, Trail/
/lib         theme.ts (tokens), supabase.ts, map.ts, audio.ts
/supabase    migrations (via Supabase CLI — never hand-edit applied files)
/docs        build plan, design system, later.md (parked ideas)
```

## Commands
*(Fill in right after scaffolding — ask me to add the real ones.)*
- Dev server: TBD
- Run tests: TBD
- Deploy: push to main → auto-deploys on Vercel

## Workflow
- **Plan first** for anything touching more than one file: propose a plan, wait for my approval.
- **Small steps.** One component or endpoint at a time.
- **Tests for logic** (data/API/geo). UI is checked visually via design-reviewer (Playwright).
- **Commit** after each working step with a clear message.
- Migrations only via `supabase migration new ...`.

## Design tokens (source of truth: /lib/theme.ts once built)
Emotion hues: Joy #FFC24B · Energy #FF7A29 · Love #FF6FB5 · Awe #7B6CF6 · Calm #35D0BA · Reflective #3E8EF7.
Motion: snappy = spring(stiffness 400, damping 32); settle = spring(stiffness 140, damping 22); glow pulse ≈ 2.5s ease-in-out loop.
Map: hue = emotion, brightness = intensity, pulse = density.

## Definition of done
- **UI task:** matches tokens, holds 60fps on a mid-range phone, works at mobile width, passed design-reviewer.
- **Logic task:** passing tests, RLS respected (never expose raw individual locations), passed code-reviewer.

## Review agents
- `design-reviewer` — after any UI change (feel, tokens, 60fps, non-generic bar).
- `code-reviewer` — before committing logic (correctness, security/RLS, performance, tests).
