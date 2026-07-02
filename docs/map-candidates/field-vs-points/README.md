# Dot-world vs field-world — same viewports, same data

Ben's pivot: the public map renders emotion as a **standing heat field** (weather
over the city), never individual points. `points-*.png` = the old rendering;
`field-*.png` = the field, identical cameras (city 10.8 / nbhd 13.1 / street 15.3),
same seeded test feelings.

What to look at:
- **field-nbhd.png** — the mud rule at work: Williamsburg is *instantly orange*,
  Greenpoint *instantly teal*, and the front between them blends like weather —
  hue rotates through the boundary but never washes to gray (chroma floor).
  Streets inside each field catch its color (the streetlight signature).
- **field-city.png** — the whole city as a living tide. Note: seeded test data is
  intentionally dense; day-one real data will be far sparser and calmer.
- **lonely-commit.png** — one single commit in empty Staten Island: a soft
  neighborhood-scale bloom. Never a pin, no rim, no address.

Knobs (all in `components/Map/tune.ts` FIELD): `exposure` (overall brightness),
`dominance` (front width), `chromaFloor` (front saturation), `radiusM`/`minRadiusPx`
(bloom size), `streetlightGain`, `breath`. Every note you have is one number away.

The point rendering lives on as the private Trail's seed (`components/Trail/`) —
your own precise constellation, P4.
