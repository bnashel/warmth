-- Warmth: the public READ + LIVE paths, privacy-first (Eli, 2026-07-08).
--
-- The applied migration (20260707120000) created public_moments with an
-- INSERT policy and NO select path — on purpose. Raw individual locations
-- must NEVER reach a client (CLAUDE.md). This migration adds the only two
-- ways the public field is ever read, and BOTH coarsen location to a
-- ~330 m privacy grid before anything leaves the database:
--   • public_field_recent()  — the initial-load aggregate (security definer)
--   • a broadcast trigger     — the live path (emits the snapped centre only)
-- public_moments is never added to the realtime publication, so a future
-- "enable realtime on this table" click cannot leak raw coordinates.
--
-- Plus: an updated_at touch trigger, and journal_mine (an owner-scoped view
-- exposing lng/lat so the client needn't parse WKB).
--
-- Depends on 20260707120000 being applied first.
-- Apply with `npx supabase db push` (or the dashboard) once linked.

-- The privacy grid: ~0.004° lng × 0.003° lat ≈ 337 m × 333 m at NYC latitude.
-- Snapping to this grid and returning the CELL CENTRE (+ half a cell) means
-- no output coordinate is ever a real drop point. Keep these numbers in sync
-- with the client self-dedupe (lib/publicField.ts).

-- ---------------------------------------------------------------------
-- PUBLIC READ: the recent field as coarsened, aggregated cells. No id,
-- no user, no raw coordinate — density survives as a per-cell count.
-- ---------------------------------------------------------------------
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
      -- floor to the grid, in coordinate space (deterministic grouping keys)
      floor(st_x(location) / 0.004) as cx,
      floor(st_y(location) / 0.003) as cy,
      emotion,
      intensity,
      created_at
    from public.public_moments
    where created_at > now() - interval '24 hours'
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
  group by cx, cy, emotion;
$$;

-- Security-definer reads the raw table on the caller's behalf; clients still
-- cannot (no SELECT policy). Lock the grant to the two real roles.
revoke all on function public.public_field_recent() from public;
grant execute on function public.public_field_recent() to anon, authenticated;

-- ---------------------------------------------------------------------
-- LIVE: broadcast each new public moment to authed subscribers, coarsened.
-- This trigger is the ONLY code that reads NEW.location on the live path,
-- and it emits solely the snapped cell centre.
-- ---------------------------------------------------------------------
create or replace function public.broadcast_public_moment()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cx bigint;
  cy bigint;
begin
  -- Same grid as public_field_recent(): floor to the cell, emit the centre.
  cx := floor(st_x(new.location) / 0.004);
  cy := floor(st_y(new.location) / 0.003);
  perform realtime.send(
    jsonb_build_object(
      'eid', gen_random_uuid(),                     -- event id (not identity/location)
      'cell_id', md5(cx::text || ',' || cy::text || ',' || new.emotion),
      'lng', cx * 0.004 + 0.002,
      'lat', cy * 0.003 + 0.0015,
      'emotion', new.emotion,
      'intensity', new.intensity,
      'bucket', to_timestamp(floor(extract(epoch from new.created_at) / 900) * 900)
    ),
    'moment',        -- event
    'public_field',  -- topic
    true             -- private → only authorized (authenticated) subscribers
  );
  return null;
end;
$$;

create trigger public_moment_broadcast
  after insert on public.public_moments
  for each row execute function public.broadcast_public_moment();

-- Authorize authenticated clients to RECEIVE the public_field broadcast.
-- (The send above runs as definer inside the trigger and is not gated by
-- this; only the client's subscribe/receive is.)
create policy "authenticated read public_field broadcast"
  on realtime.messages for select
  to authenticated
  using (
    (select realtime.topic()) = 'public_field'
    and realtime.messages.extension = 'broadcast'
  );

-- ---------------------------------------------------------------------
-- journal_entries.updated_at: keep it honest on every edit.
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger journal_entries_touch_updated_at
  before update on public.journal_entries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- OWNER READ: a view that hands the client lng/lat (not WKB). RLS on the
-- base table still applies because security_invoker runs it as the caller —
-- WITHOUT that flag this view would leak every user's journal.
-- ---------------------------------------------------------------------
create view public.journal_mine
  with (security_invoker = true)
as
  select
    id,
    emotion,
    intensity,
    st_x(location) as lng,
    st_y(location) as lat,
    created_at,
    description,
    photo_path,
    song_title,
    song_artist,
    updated_at
  from public.journal_entries;

grant select on public.journal_mine to authenticated;
