# Warmth — Build Plan

The phased plan. CLAUDE.md's "Right now" line always points at the current phase.

## Phase 0 — Scaffold & deploy ✅
Next.js (App Router) + TS + Tailwind, the full stack installed (Framer Motion,
Mapbox GL JS + react-map-gl, deck.gl, Supabase JS), folder structure, review
agents, `.mcp.json`, first commit pushed, live on Vercel.

## Phase 1 — The beautiful empty map (next)
A dark, full-bleed Mapbox base with the deck.gl glow layer wired up (no real
data yet). Holds 60fps, dark-first, feels premium the moment it loads.

## Phase 2 — The slider (the signature)
The emotion + intensity slider. Spring physics, extra design-reviewer care.

## Phase 3 — Data & realtime
Supabase Postgres + PostGIS schema, RLS (never expose raw individual
locations), anonymous auth, realtime glow updates.

## Phase 4 — Trail, sound, polish
Personal trail, Web Audio ambient layer, motion polish.

_Fill in detail as each phase starts. Parked ideas live in `later.md`._
