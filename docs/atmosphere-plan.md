# The Living Atmosphere — Plan

*Proposed 2026-07-05 (Ben's direction); Ben approved same day (rain sound
pulled forward). Status: Phases A–D + rain sound + the dev weather preview
are BUILT (see lib/atmosphere.ts); Phases E (art pass) and F (feel pass)
are next. Eli still needs the heads-up that the Look panel is gone.*

## The idea in one paragraph

The map is not an app with themes. It is a window: whatever the world outside
is doing — the height of the sun, the clouds, the rain, the wind, the fog —
the map is quietly doing too. Nobody chooses it, nobody switches it, nothing
ever "changes modes." It updates itself continuously and eases so slowly that
you never catch it moving; you just notice, the way you notice the afternoon
has gone gray. Emotion stays the only vivid color. The weather is the paper
it's painted on.

## What this replaces (and keeps)

- **Removed:** the Look panel entirely (`components/Screen/LookPanel.tsx`,
  `lib/prefs.ts`), and with it the shape dials and the three solar modes.
  One beautiful default. No settings UI on the one screen.
  ⚠️ This deletes UI Eli built this week — Ben talks to Eli before we land it.
- **Kept and promoted:** Eli's solar machinery (`lib/sun.ts`,
  `components/Map/solar.ts`) becomes the *light* half of the atmosphere.
  Ink night ↔ ember twilight ↔ paper day, driven by the real sun, stays —
  it is no longer a "mode," it is the floor the weather stands on.
- **Kept:** watercolor as the one shape identity (glow at night, pigment by
  day — already how the field and trail behave). The other shapes (bloom,
  ink, aurora) go to `later.md`, not to the trash: aurora in particular may
  return as a *clear-cold-night* weather expression.
- The current daytime/weather bugs Ben is seeing live mostly in the
  mode-switching plumbing (prefs × 3 modes × paper ramps). Deleting the
  modes deletes most of the bug surface; Phase A is also a stabilization.

## The atmosphere state (one vector, never a mode)

A single module (`lib/atmosphere.ts`) owns a continuously-eased state:

```
light   0..1   sun elevation curve (from sun.ts — exists)
ember   0..1   twilight warmth (exists)
cloud   0..1   cloud cover
wet     0..1   precipitation intensity   kind: rain | snow
fog     0..1   1 − visibility
wind    0..1   speed + a direction vector
clear   derived: glowy golden-hour / crisp-night factor
```

- **Weather source: Open-Meteo** (recommended — free, no API key, no new
  dependency, plain `fetch`). Refetch every 15 minutes and on tab-return;
  NYC coordinates, same convention as solar (the map *is* NYC).
  Alternatives if we outgrow it: OpenWeatherMap or WeatherKit (both need
  keys; note for later, not now).
- **Easing:** every value moves through a minutes-long exponential ease.
  A cloud bank arriving reads like a cloud bank arriving, not a theme swap.
- **Offline / API failure:** degrade to clear sky; the sun half keeps
  living (it needs no network). The map is never wrong-dark or frozen.
- **Dev harness:** URL overrides in the spirit of `?solarHour=`:
  `?cloud=0.8&wet=0.6&kind=snow&fog=0.3&wind=0.7` so every state is
  screenshotable and design-reviewable without waiting for real weather.

## How weather looks (all uniforms on existing passes — no new render cost)

Every mapping is *subtle*; the test is "you notice the vibe, never the trick."

| World | Map (night: ink + glow) | Map (day: paper + pigment) |
| --- | --- | --- |
| Clear | deepest black, crisp hairlines, glow slightly sharper | brightest paper, warmest whites |
| Golden hour | fuller ember; warm spill on west-facing water | pigment warms; long-shadow warmth in the paper tone |
| Overcast | a breath of haze; glow softens/diffuses (wider, dimmer); streetlight dims | paper cools and grays; contrast flattens; pigment edges soften |
| Rain | streets glisten (streetlight gain up); pigment bleeds further (wet paper); water darkens; faint streak grain in the field noise | same wet-paper bleed; cooler, darker paper |
| Snow | hush: drift slows, sparkle dither, edges soften | paper brightens cold; marks feather |
| Fog | distance veil: labels fade in earlier, vignette lightens to mist | milk-glass horizon; far detail washes |
| Wind | the field's existing drift/warp axis follows real wind direction; speed scales drift | same |

Implementation notes:
- The field's resolve shader already has the knobs (warp, drift, streak,
  band from the SHAPES work) — weather becomes the thing that *drives* them
  instead of a preference. Cloud/fog add ~3 uniforms; rain adds a streak
  term to the existing fbm. No new passes except possibly one half-res fog
  veil, budgeted and design-reviewed before it stays.
- Base map weather (paper tone, water darkening, glisten) rides
  `setPaintProperty` with slow transitions — exactly how solar ink works
  today. Zero frame cost.
- **Perf guardrails (non-negotiable):** no particles in v1, no new
  per-frame allocations, rest-throttle and DPR cap untouched, 60 fps on a
  mid-range phone is the definition of done for every phase.

## The art pass — the map as an object you want to touch

Bigger revisions, each small and shippable, in taste order:

1. **Water alive.** Rivers and harbor get a slow noise sheen keyed to sun
   angle; at night, emotion glow bleeds faint reflections along shorelines.
   Rain pocks it. This is the single highest-beauty-per-cost upgrade.
2. **One heartbeat.** Field breath, orb breath, and pulse cadence share one
   global clock that eases with the atmosphere — calm clear night beats
   slower than a windy noon. Coherence you feel but can't point at.
3. **Arrival choreography.** Zooming into a neighborhood gets a settle —
   labels breathe in, the local field swells a touch, then rests.
4. **Gesture juice.** The heavy-glass pan is right; rotation and zoom get
   the same spring weight; releasing a drag should feel like silk settling.
5. *(later.md, unchanged)* field scintillation, own-commit ember — they
   compose with all of the above.
6. *(later, with sound phase)* rain patter and wind in the Web Audio layer,
   gated behind the existing unlock gesture.

"Addicting" comes from 1–4 + the living atmosphere: the map is never twice
the same, and touching it always feels good. No streaks under fingers, no
gimmicks — color stays emotion-only.

## Phases (small steps; review agents every phase)

- **A — One default light (stabilize by deleting).** Remove LookPanel +
  prefs + solar modes; keep the single sun-driven ink↔ember↔paper cycle;
  sweep `?solarHour` 0–24 for the daytime bugs Ben saw. *Done when: no
  settings UI, every hour renders right, design-review pass.*
- **B — Atmosphere state.** `lib/atmosphere.ts`: Open-Meteo fetch, eased
  vector, URL overrides, offline fallback. No visuals yet. *Done when:
  state logs correctly against real weather + overrides; unit tests on the
  easing/fallback logic (our first logic tests — Ben must okay adding a
  test framework).*
- **C — Sky weight: cloud, fog, wind.** Base-paint + field uniforms.
  *Done when: 6 forced states screenshot beautifully, 60 fps holds.*
- **D — Water from the sky: rain, snow.** Wet bleed, glisten, hush.
- **E — The art pass: golden hour, crisp night, living water.**
- **F — Feel: one heartbeat, arrival choreography, gesture juice.*

Each phase lands as its own commit(s) with lab screenshots, design-reviewer
on every visual, code-reviewer on the state/fetch logic.

## Open questions for Ben

1. Green-light Phase A knowing it removes Eli's Look panel? (The solar
   engine survives and becomes load-bearing — but Eli should hear it from
   you first.)
2. Okay to add a minimal test framework (Vitest) when Phase B lands, per
   the "tests for logic" rule?
3. Sound in the atmosphere (rain patter) — park it in later.md until the
   sound phase, or pull it forward?
