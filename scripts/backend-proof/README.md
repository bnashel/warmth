# backend-proof — the migrations, executed and attacked

The SQL in `supabase/migrations/` guards everything CLAUDE.md holds sacred
(*never expose raw individual locations*), but until 2026-08-04 it had never
been **run** anywhere — no Supabase project is linked yet. This harness runs
it for real, with no Docker and no cloud:

- **pglite** boots a genuine PostgreSQL (18.x, WASM) inside Node.
- `shim.sql` recreates the Supabase runtime surface the migrations assume:
  the `anon` / `authenticated` / `service_role` roles, `auth.uid()`,
  `realtime.send()` + `realtime.messages` + `realtime.topic()`, and
  `storage.buckets` / `storage.objects` / `storage.foldername()`.
- The real migrations then apply **in order**, with two textual mutations and
  no others: pglite has no PostGIS, so `geometry(Point, 4326)` becomes the
  native `point` type (`st_x`/`st_y` are shimmed, `x`=lng, `y`=lat) and the
  `create extension postgis` line is stripped. All grid math, RLS, triggers,
  policies, and grants execute untouched.
- The tests execute **as those roles** (`set role` plus both claim GUCs —
  the `request.jwt.claims` JSON PostgREST sets and the legacy per-claim form
  Supabase's own `auth.uid()` still honors), so row-level security genuinely
  enforces rather than being simulated.

## What the 27 tests prove

- **Structural anonymity** — `public_moments` has no identity column; the
  table is in no realtime publication; raw rows are unreadable by anon *and*
  authenticated (including via `INSERT … RETURNING`).
- **The privacy grid** — `public_field_recent()` and the broadcast trigger
  emit only ~330 m cell centres, computed here and compared against a
  transcription of `lib/publicField.ts`'s `publicCellKey` math (negative
  longitudes included); the source's constants *and* its floor-based key
  shape are asserted against the file text, so a `floor`→`round` drift
  fails the suite. No payload ever contains a raw coordinate.
- **No future-dating** — a forward-dated moment is refused at insert and
  ignored by the read, so it can never outrank or evict the real city.
  (This was a live critical: recency ordering plus a cap turned client-set
  timestamps into a total-eviction attack. Both guards are pinned here.)
- **The journal** — owner-only select/insert/update/delete; forging another
  `user_id` is refused; `journal_mine` stays owner-scoped through
  `security_invoker`; `updated_at` touches on edit.
- **The live path** — one insert → exactly one broadcast on the private
  `public_field` topic; receive is authenticated-only; clients cannot
  *publish* onto the topic (only the DB trigger may); and the broadcast
  `cell_id` matches the snapshot `cell_id` (the stable snapshot-point
  identity — self-echo dedupe itself keys on `publicCellKey`, not `cell_id`).
- **The emotion contract** — SQL accepts exactly the client's five emotions
  from `lib/theme.ts` and refuses legacy names.
- **The wire format** — `lib/sync.ts` still sends `SRID=4326;POINT(lng lat)`
  with the SRID prefix and the axes in that order (asserted against the
  source: the harness inserts via `point()`, so an axis swap would otherwise
  stay green here and mis-locate every moment on real PostGIS).
- **Storage** — the `memories` bucket is private and owner-prefix-scoped.

## What it does *not* prove

PostGIS itself. The EWKT string above is checked as text, never executed
against a real `geometry(Point,4326)` column, and the spatial index is built
over `point`. A SRID or geometry-parsing failure would surface only on the
linked project — so the two-device test remains the real gate.

## Run it

```bash
cd scripts/backend-proof
npm install   # installs pglite only, in this folder — not an app dependency
npm test
```

Runs in ~11 s. Green here means the SQL is safe to `npx supabase db push`
the day the project is linked — modulo the PostGIS caveat above.
