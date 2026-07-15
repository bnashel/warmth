# The welcome bake-off — two walkthroughs, one will live

*(2026-07-15. Ben asked for both versions built so he can pick. The
ember-vs-splat rule applies: the winner's key goes into `WELCOME_DEFAULT`
in `components/Welcome/script.ts`, the loser is deleted.)*

## What it is

The first-run walkthrough ("the welcome"): five steps that teach the
product's whole idea, ending with the user's own first feeling on the real
orb — the tutorial IS the first use. Both versions share the same script,
chrome (captions, progress dots, skip), sequencer, and ending; only the
staging differs.

- **slides** — a designed sequence in the ink void: the five hues become
  the signature ribbon, the axes figure draws where × what and grows when,
  the ghost hand plays a real orb, and the void dissolves into the live app.
- **film** — the real night map performs the whole time: a slow push-in,
  three demo feelings igniting live, the real crossfade into a glimpse
  journal (the time axis), the ghost hand at the real orb's spot, and the
  scrim breathing out for the handoff.

## How to judge

```
npm run dev -- -p 3005      # 3000/3001 belong to bookkeeper
```

- Version A: `http://localhost:3005/?wall=off&welcome=slides`
- Version B: `http://localhost:3005/?wall=off&welcome=film`
- `?welcome=reset` — forget this device was welcomed; `?welcome=off` — suppress.
- Params are dev-only (`devUnlocked()`), so judging previews with
  `NEXT_PUBLIC_WARMTH_JUDGE=1` can use them too.

Judge on a phone over LAN with `?wall=off` (same as the look bake-offs).

## The five steps (shared)

1. **warmth** — "a living map of how the city feels"
2. **where × what** — the public field, live ("every light is someone…")
3. **where × what × when** — the private map adds time
4. **the orb** — ghost demo: press, slide to a feeling, how strong
5. **yours** — "hold the orb to leave your first feeling" → the real
   commit dissolves the welcome

## Honesty choices already made (veto anytime)

- The film's step 3 shows the dev judging journal to a brand-new user for
  one beat, framed as "a glimpse — yours begins tonight", then sweeps it.
  An existing journal (≥3 entries) shows itself instead.
- The film's step 2 injects three `test:true` demo feelings (real arrival
  choreography, never anyone's journal); they're swept while the field is
  faded out in the private view.

## After the pick

Set `WELCOME_DEFAULT` in `components/Welcome/script.ts` to the winner —
that turns on auto-play for first visits (device flag `warmth-welcomed-v1`,
skippable, replayable from the account card's "watch the welcome again"),
and delete the losing shell. The stage contract (`components/Welcome/stage.ts`)
and the instruments (ghost hand, axes figure) stay — they serve whichever
version lives.
