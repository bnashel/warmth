# Map style candidates — pick on your iPhone

Live: open the Vercel preview at `/maplab`. Switch candidates with the quiet **1 2 3** at the top. The glow test data is always on — that's the honest way to judge.

**`v2/` is current** (after your feedback round). `before/` is the first pass, same nine viewports, for comparison. Zooms: `city` (at-rest wide shot) / `nbhd` (Williamsburg) / `street` (East Village).

## What changed in v2 (your fix list, in your order)

1. **Glow is now real light.** Custom shader: hot core that whitens like a filament, long soft falloff, additive blending — same-hue neighbors pool into one field, different hues bleed at the edges. Size and peak brightness scale with intensity. A slow breathing pulse (~3.4s), each point on its own phase. Compare any `before/` vs `v2/` shot.
2. **Street rhythm.** Four waves instead of uniform wireframe: highways → avenues → side streets → alleys, each with its own weight. See `v2/c1-nbhd.png`.
3. **Neighborhood contours.** Half the smoothing tolerance, one corner-cut pass instead of two — shapes keep their real character, corners still soft.
4. **Atmosphere.** Gentle vignette + colorless static grain. Composited once; costs no frames.

Also from your notes: **rotation is on** (two-finger turn; a quiet "N" chip appears only while rotated and eases you back), **no neighborhood names at the wide view** — just the five boroughs whispering, names arrive as you zoom in. And the lag work: one shared GL canvas instead of two, one glow draw call instead of six heatmap layers, labels cached, at-rest animation throttled.

## The experiment (Ink & Glow only)

**Feeling lights up the streets around it.** A second glow pass that only lands on bright pixels — street hairlines near a glow catch its color and fade with distance. Compare `v2/exp-streetlight-on.png` vs `v2/exp-streetlight-off.png`. My verdict: magical, not gimmicky — it makes the light feel *in* the city instead of on top of it. Judge on your phone; killing it is one number in `tune.ts` (`GLOW.streetlight.gain: 0`).

## What to look for on your phone

- Do two same-color glows near each other read as one pool of feeling?
- Watch a glow for ten seconds — does the breathing feel alive?
- Pan hard, then zoom slowly city → street. Rhythm in the grid?
- Rotate it. Does it come back north with dignity?

## Honest ranking (unchanged from round 1)

1. **Carved Graphite** — the glow looks most *meaningful*; you can see the city that's feeling it.
2. **Ink & Glow** — the glow looks most *luminous*, and the streetlight experiment only exists here. If the experiment wins your heart, this candidate rises to #1.
3. **Fog & Void** — boldest single image, but its black voids still compete with the glow.
