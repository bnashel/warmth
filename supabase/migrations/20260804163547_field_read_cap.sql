-- Warmth: bound the field read, and close the future-date hole (Ben, 2026-08-04).
--
-- public_field_recent() had no ordering and no cap: a busy 24 hours could
-- return an unbounded payload. The client keeps at most 500 POINTS total
-- (RECENCY.maxPoints, tune.ts) and stacks up to 6 per cell, so as few as ~84
-- cells can fill its budget — rows beyond ~550 can never influence a pixel.
--
-- Bounding the read this way created a NEW attack, so this migration closes
-- it in the same breath (found by adversarial review, reproduced on
-- scripts/backend-proof before shipping):
--
--   created_at is client-supplied (lib/sync.ts sends it so offline commits
--   keep their real time). The 24h window had no UPPER bound, so a row dated
--   years ahead stays "inside the last 24 hours" for years — and once the
--   read is ordered by recency and capped, ~550 such rows evict the entire
--   real city from the snapshot, for years, until a service-role cleanup.
--   Each one also fires the broadcast trigger, spraying fabricated blooms.
--
-- Two independent guards, either of which alone stops it:
--   1. the read ignores anything not yet in the past  (below)
--   2. the write refuses a future timestamp outright  (policy, below)
--
-- Eli's grid law is UNCHANGED (same 0.004°×0.003° cells, same centres, same
-- 15-min buckets — the harness asserts SQL↔client agreement). Ordering is by
-- the QUANTIZED bucket, not by max(created_at): ordering on the raw timestamp
-- would have leaked sub-bucket recency between two cells sharing a bucket,
-- which is exactly the signal the 15-minute quantization exists to destroy.
--
-- Additive by design: 20260707120000 and 20260708120000 are never edited
-- (CLAUDE.md) — this supersedes their objects via create-or-replace / a
-- named policy swap.

create or replace function public.public_field_recent()
returns table (
  cell_id text,
  lng double precision,
  lat double precision,
  emotion text,
  n integer,
  avg_intensity real,
  bucket timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with celled as (
    select
      floor(st_x(location) / 0.004) as cx,
      floor(st_y(location) / 0.003) as cy,
      emotion,
      intensity,
      created_at
    from public.public_moments
    where created_at > now() - interval '24 hours'
      and created_at <= now()   -- GUARD 1: the future is not "recent"
  )
  select
    md5(cx::text || ',' || cy::text || ',' || emotion) as cell_id,
    cx * 0.004 + 0.002                                  as lng,   -- cell CENTRE
    cy * 0.003 + 0.0015                                 as lat,   --   never a raw point
    emotion,
    count(*)::int                                       as n,
    avg(intensity)::real                                as avg_intensity,
    to_timestamp(floor(extract(epoch from max(created_at)) / 900) * 900) as bucket
  from celled
  group by cx, cy, emotion
  -- Freshest buckets first, then a deterministic (time-free) tie-break.
  -- `bucket` is already 15-min quantized, so the ORDER carries no finer
  -- signal than the payload itself. md5 cell_id is stable — random() would
  -- be illegal here anyway (the function is declared stable).
  order by bucket desc, cell_id
  limit 550;
$$;

-- Same lock as the original: no public grant, only the two client roles.
revoke all on function public.public_field_recent() from public;
grant execute on function public.public_field_recent() to anon, authenticated;

-- ---------------------------------------------------------------------
-- GUARD 2 (defense in depth): a public moment may not be dated in the
-- future. This also stops the fabricated LIVE blooms, which the read-side
-- guard alone cannot — the broadcast trigger fires on INSERT, before any
-- read. Backdating stays allowed (offline replay is a real case); only
-- forward-dating beyond a little clock slack is refused.
--
-- Replaces the policy of the same name from 20260707120000 (that file is
-- left untouched); anonymity is unchanged — anyone may still contribute.
-- ---------------------------------------------------------------------
drop policy if exists "anyone can add a public moment" on public.public_moments;

create policy "anyone can add a public moment"
  on public.public_moments for insert
  to anon, authenticated
  with check (created_at <= now() + interval '5 minutes');
