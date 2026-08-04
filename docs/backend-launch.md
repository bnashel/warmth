# Backend launch — where we are, and the two human steps left

*(Ben's backend pass, 2026-08-04. Delete this file once the two-device test passes.)*

## Done

- **The schema is proven.** `scripts/backend-proof` runs Eli's migrations on a
  real Postgres and attacks every privacy promise — 28 tests, green. A found
  critical (future-dated spam evicting the whole field) is fixed and pinned.
- **The Supabase project is linked.** `bnashel's Project`
  (`eafonmtjgojesudwazom`, org "Warmth") — restored from pause, repo linked.
- **Keys are everywhere they belong.** `.env.local` (this machine) and
  Vercel env vars (production + preview + development) carry
  `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **The wall is live.** With real keys, the sign-in card appears and the city
  breathes behind it. With an unapplied schema the field RPC fails softly →
  ambient seed. Nothing crashes; this is the degradation working as designed.
- **Photo sync is complete** (sweep at sign-in, delete-means-gone, no orphan
  on replace).

## Step 1 — DONE (2026-08-04)

All three migrations are applied and verified end-to-end against the live
database: the client's EWKT insert parses on real PostGIS; the RPC returns
the coarsened cell centre (grid math matches the client to 1e-9); raw rows
and the journal are sealed to anon; a future-dated insert is refused while
backdating (offline replay) still works; the capped field query is live.
The table was left empty — every probe row was deleted after the check.

## Step 2 — the two-device test (the phase's definition of done)

1. Open the app on two devices (laptop + phone; the Vercel preview works).
2. Sign in on both — email sign-in link (enabled by default; Google/Apple
   buttons need provider setup in the dashboard first, skip them).
   Heads-up: without custom SMTP, Supabase's built-in email sender allows
   ~2 sign-in emails per hour — enough for exactly this test, but if the
   second email stalls, that limit is why. Use the same email on both
   devices; the paste-a-code path works when the link opens elsewhere.
3. Hold the orb on one device, commit a feeling.
4. Watch the other: the coarsened bloom should land within ~a second.
5. Flip to "just me" on the committing device — exact-location ember there,
   cell-centre-only everywhere else. That asymmetry is the whole privacy
   design, visible.

## Afterwards

- CLAUDE.md's "Right now" line advances to Phase 4 (trail, sound, polish).
- The `warmth-three.vercel.app` production still runs the July 2 build; when
  you and Eli are ready: merge to `main`, then `npx vercel deploy --prod`.
