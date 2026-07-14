# The Worlds of Warmth — the map of every look
*Written 2026-07-14 (the one-world organization pass). If you add a look, add a row here.*

Warmth has one product (the night city) and a gallery of every visual world
we've ever built, all alive behind a dev-only switcher. **Nothing gets thrown
away** — every iteration is a selectable entry in one registry:
`components/Map/looks.ts`. This file is the plain-English map of that gallery,
so nothing gets lost while onboarding is built on top.

Audit status (2026-07-14): all 14 looks verified — each is registered,
selectable from the dropdown, reachable by deep link, and renders with zero
console errors, including live night ↔ paper switches.

---

## Every world, at a glance

URLs below are for the dev server (`http://localhost:3005`). On a deployed
judging preview, use the same query string on that URL. Tip for judging:
add `&wall=off&field=seed` (dev/judge builds only) to skip sign-in and see
the richly seeded city.

### Eli's nine (the night-pass gallery — "gallery" engine)

| # | id | name | date | character | journal |
|---|----|------|------|-----------|---------|
| 1 | `first-bloom` | first bloom | 07-05 | soft circular blooms; no tiers, no weave (reconstruction) | thread |
| 2 | `watercolor-night` | watercolor night | 07-06 | blotted seeping edges, barely-moving weather (reconstruction) | thread |
| 3 | `woven-wash` | woven wash | 07-08 | the silk+pigment merge: tiers, weave, shimmer, ungated | thread |
| 4 | `eighth-mile` | eighth mile | 07-08 | tight entries over an under-wash; color flows only at true overlap | thread |
| 5 | `adult-pass` | adult pass | 07-09 | silk silhouettes, exhale breath, tone ceiling | thread |
| 6 | `felt-emotions` | felt emotions | 07-09 | every emotion gets its own form and motion, not just a hue | thread |
| 7 | `night-air` | night air | 07-10 | from scratch: unbounded ambient light through night air (the veil) | thread |
| 8 | `the-garden` | the garden | 07-10 | night air public side + a journal that blooms with age | garden |
| 9 | `night-weather` | night weather | 07-10 | **THE PRODUCT DEFAULT** — un-metronomed breathing, feelings interpenetrate | garden |

Open any of them: `http://localhost:3005/?look=<id>` — e.g.
`http://localhost:3005/?look=felt-emotions`

### Ben's four pond looks (the bake-off — "pond" engine)

| # | id | name | date | character | journal |
|---|----|------|------|-----------|---------|
| 10 | `ben-still-water` | still water · ben | 07-11 | Ben's bake-off pick: geographic flow, pools breathing solo by where they are | ember |
| 11 | `ben-living-water` | living water · ben | 07-11 | still water + THE POND: arrivals ripple outward through the field | ember |
| 12 | `ben-ink` | ink · ben | 07-11 | wide slow undulations — ink settling in water | ember |
| 13 | `ben-aurora` | aurora · ben | 07-11 | streaked curtains riding the wind axis | ember |

Open them: `http://localhost:3005/?look=ben-still-water` etc. Ben's original
short bake-off links still work too: `?look=still-water`, `?look=living-water`,
`?look=ink`, `?look=aurora`.

### The Paper World (Ben, from scratch — "pond" engine on the paper base)

| # | id | name | date | character | journal |
|---|----|------|------|-----------|---------|
| 14 | `paper-world` | PAPER WORLD · ben | 07-12 | the bone sheet: a sky-graded paper city; feelings soak in as granulated pigment; a commit blooms as a spreading ink drop; joy is true sun-yellow (#F2C010) on paper | ember |

Open it: `http://localhost:3005/?world=paper` (Ben's original link) or
`http://localhost:3005/?look=paper-world` — both land on the same world.

### The three journal pairings (the private view)

Each look declares which private-journal rendering it pairs with
(`config.journal` in looks.ts); the trail renderer reads it live:

- **thread** — Eli's aurora curtains: one smoothed line through the places
  you've felt, with tappable connections that whisper the time between
  memories.
- **garden** — Eli's growing blooms: entries mature with age; opening the
  journal after a month looks like something you've grown.
- **ember** — Ben's forever-ember: each mark keeps a seeded silhouette that
  never changes (and reads as a pigment stain on paper).

---

## How switching works (the contract)

- **The registry** is `components/Map/looks.ts` (`LOOKS`). One entry per
  look: dial snapshot + which engine renders it + which base world it stands
  on + its journal pairing. Adding a look = adding an entry. **Never edit or
  delete an old entry** — history is the point.
- **The live selection** is `components/Map/lookState.ts` — a tiny store.
  `currentLook()` is read by both field engines, the trail, and the moments
  store every frame; `setLook(id)` switches instantly; `onLookChange`
  notifies MapStage, which performs the dissolve (breathe down ~180ms, swap
  at the trough, breathe back ~220ms — nothing pops). If a switch crosses
  worlds (night ↔ paper), MapStage rebuilds the base style live and re-inks
  the standing journal marks (`momentsStore.retint()`).
- **The look owns its world.** At page load, lookState resolves the initial
  look (URL param → starred favorite → default) and seeds the world from
  that look (fixed 07-14: previously `?look=paper-world` mounted the pigment
  engine over the night base). **The night gate** (review fix, 07-14): on a
  real production build (`devUnlocked()` false), load-time resolution never
  lands on a paper look — `?world=paper`, `?look=paper-world`, and a starred
  paper favorite all fall through to the night default, and the world is
  seeded to night. Dev and judging previews resolve paper exactly as before.
- **The switcher UI** is `components/Lab/LookGallery.tsx` — the "looks ·"
  chip, bottom-right. It just lists the registry; it holds no look logic.
- **The star (favorite)** makes a look this device's default (localStorage,
  key `warmth-look-favorite`). Only the gallery sets it — but the gallery is
  reachable on ANY build via `?looks=1`, so a production user CAN star a
  look. A starred night look persists as their default; a starred PAPER look
  does not survive a plain-URL reload in production (the night gate skips it
  at load), so night remains the product default no matter what was starred.
- **Deep links** (the phone bake-off): `?look=<id>` · `?world=paper` ·
  Ben's pond aliases (`?look=still-water` etc.). Precedence at load:
  `?world=paper` beats `?look=`, which beats the starred favorite, which
  beats the default (`night-weather`). Night looks deep-link on any build;
  the PAPER links resolve only where `devUnlocked()` is true (local dev +
  judging previews) — in production they land on the night default.

## Who sees what (dev gating)

- **Real users** get the night product, `night-weather` look, sign-in wall,
  real data. No switcher, no dev chips.
- **`devUnlocked()`** (`lib/dev.ts`) is true in local dev and on judging
  previews deployed with `NEXT_PUBLIC_WARMTH_JUDGE=1`. It gates: the looks
  switcher chip, the weather preview chip, `?wall=off` (skip sign-in),
  `?field=seed` (force the rich seeded city), `?journal=test` (the
  synthetic judging journal — gated 07-14; synthetic moments must never
  render for a real user), and landing on the PAPER world at load
  (the night gate, 07-14 — constitution rule 1).
- **`?looks=1`** additionally shows the switcher on any build — the one
  intentional escape hatch for sharing a build without the judge flag.
- **Night deep links are ungated** on purpose: a production user who types
  `?look=first-bloom` gets that look. The product never *surfaces* the
  option; the URL is the contract. The one exception is the light PAPER
  world (see the night gate above): in production its links resolve to the
  night default. Note the `?looks=1` switcher can still flip to paper LIVE
  for that session — a deliberate judging hatch — but it can't become the
  default: the next plain-URL load opens on night.
- The labs (`/lab`, `/maplab`) 404 in production unless
  `NEXT_PUBLIC_LABS=1`. The parked paper-day preview is `?daylight=1`
  (see docs/later.md).

---

## The two-trunk seam (read before touching field or tune files)

The one-world merge (07-13) folded two whole trunks together. **Both field
engines live whole; MapStage mounts exactly one per look.** They are NOT
unified, on purpose — unifying them is a real project, not a cleanup.

**Which component renders when:**

- Looks 1–9 (Eli's) → `GalleryFieldLayer.ts` ("gallery" engine).
- Looks 10–14 (Ben's, incl. paper) → `FieldLayer.ts` ("pond" engine).
- The private journal: `Trail/glow.ts` always builds the trail; when the
  active look pairs with thread/garden it delegates to `Trail/galleryGlow.ts`
  (+ `AuroraLayer.ts`); ember renders in glow.ts itself.

**Which tune book feeds which:**

| constants | night product + pond engine | gallery engine (Eli's nine) |
|---|---|---|
| FIELD, WOVEN | `tune.ts` | `galleryTune.ts` (frozen snapshot) |
| TRAIL | `tune.ts` (ember journal) | `galleryTune.ts` (thread + garden) |
| SHAPES, FELT | — | `galleryTune.ts` |
| pond presets (`LOOKS`), PIGMENT, PAPER/INK base | `tune.ts` | — |
| CAMERA, WEATHER, PERF, LAMP, GLOW, CHOREO, SOLAR, LABELS | `tune.ts` — **shared by both engines** | ← same |

**What could silently diverge (the watch-list):**

1. `galleryTune.ts` is a **frozen snapshot** of the values Eli's nine looks
   were tuned against. That's the mechanism that protects them from Ben's
   later retunes. Corollary: a deliberate product retune in `tune.ts`
   (e.g. the darkness budget) will NOT reach the gallery looks — that's
   correct, but remember it when comparing side by side.
2. Anything in the **shared row** (CAMERA, WEATHER, PERF, LAMP, GLOW…)
   moves BOTH engines at once. Tuning wind or bloom for the night product
   also changes how every preserved look breathes.
3. `FIELD` names two different objects in the two books. When editing,
   check the import line first — the wrong FIELD compiles fine.
4. `momentsStore` weights points with `currentLook().config.dials.washGain`
   (per-look) but `tune.FIELD.seedGain` (global) — seed brightness is shared
   across all looks; wash brightness is per-look.
5. The five brand hues (`lib/theme.ts`) are the one palette both trunks
   share — never edited. World-aware color goes through ONE gate:
   `solar.emotionHue()` (paper swaps in `PIGMENT.hues` — joy only).

---

## Where onboarding mounts

Onboarding is a layer over the product, not a new world. The seam it builds
on:

- **It may read** `currentLook()` and subscribe via `onLookChange` (both in
  `components/Map/lookState.ts`) if it needs to know what the city looks
  like behind it.
- **It may set the look** — `setLook(id)` from lookState — if a step ever
  wants to present a specific world. The dissolve choreography comes free;
  never swap styles or layers directly.
- **It mounts in** `components/Screen/OneScreen.tsx`, as a sibling of the
  view pills / whispers (the z-index 10–12 band), above the map, below
  nothing sacred. The orb island and the hold-scrim are load-bearing —
  compose around them, don't reparent them.
- **It must never touch**: entries in `looks.ts` (history), any dial in
  `tune.ts` / `galleryTune.ts`, renderer internals (`FieldLayer`,
  `GalleryFieldLayer`, `Trail/*`), the world functions in `solar.ts`, or
  `lib/theme.ts` hues. If onboarding needs a visual the product doesn't
  have, that's a new conversation, not a quiet edit.

---

## Parked and pending (documented so nothing is lost)

- **ember vs splat** (Ben + Eli, undecided): the private journal has a
  second renderer variant, reachable via `?trail=splat` (any build;
  default is ember via `tune.TRAIL.renderer`). No LOOKS entry selects it —
  it's a pending pick, not a world. Loser gets deleted only when the pick
  is made.
- **The parked paper day** (`?daylight=1`, `SOLAR.dayMode`): the old
  2026-07-02 daylight look — still compiles, per constitution. Note the
  gallery engine's watercolor pass (`GalleryFieldLayer` uMode 2) is only
  reachable through this preview; the shipping paper world renders through
  the pond engine's pigment path instead.
- **docs/later.md stale pointer**: later.md says the retired bloom/ink/
  aurora shape knobs live in "SHAPES in tune.ts" — they moved to
  `galleryTune.ts` in the merge.
- **`components/Lab/MapLab.tsx` + `labSeed.ts`**: the old map workshop
  harness (`/maplab`) predates the version gallery; it still compiles and
  is lab-gated. Not a world — leave it be.
