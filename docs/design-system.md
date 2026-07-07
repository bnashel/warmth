# Warmth — Design System

Source of truth for tokens is [`lib/theme.ts`](../lib/theme.ts). This mirrors it
in prose. If they disagree, `lib/theme.ts` wins.

## Foundations
- **Base:** `#0A0B0F` (near-black). Dark-first, always.
- **Color** comes only from the emotional glow and small accents.
- **60fps, always.** If a change risks jank, flag it and propose a lighter approach.

## Emotion hues
The final five (2026-07-02: awe removed; reflective became gratitude;
palette softened away from neon the same day).
| Emotion | Hue |
| --- | --- |
| Joy | `#FACB66` dawn gold |
| Energy | `#F79A6E` peach coral |
| Love | `#F695BC` petal rose |
| Gratitude | `#BCA8F5` lilac veil |
| Calm | `#63D6BE` mint aqua |

## Motion (Framer Motion)
Nothing the user sees move is linear or instant — always spring.
- **snappy** — `spring(stiffness 400, damping 32)` — controls, taps, slider thumb.
- **settle** — `spring(stiffness 140, damping 22)` — larger elements coming to rest.
- **glow pulse** — ~2.5s ease-in-out, mirrored loop.

## Map encoding
- **hue** = emotion
- **brightness** = intensity
- **pulse** = density

## The slider is sacred
The emotion/intensity slider is the signature. Extra care, and a
design-reviewer pass on any change.
