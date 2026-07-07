-- Warmth: the privacy boundary (Eli's call, 2026-07-07).
--
-- TWO PHYSICALLY SEPARATE TABLES. public_moments has NO user column at all —
-- anonymity is structural, not a filter that can regress. journal_entries is
-- the full-fidelity private record, owner-only via RLS. One commit in the app
-- writes to both; nothing ever joins them.
--
-- NOT YET APPLIED: waiting on the Supabase access token (see .env.local).
-- Written by hand in CLI format because the supabase CLI isn't installed;
-- apply with `npx supabase db push` (or the dashboard) once linked.

create extension if not exists postgis;

-- ---------------------------------------------------------------------
-- PUBLIC: anonymous contributions to the shared field. No identity, ever.
-- ---------------------------------------------------------------------
create table public.public_moments (
  id uuid primary key default gen_random_uuid(),
  emotion text not null check (emotion in ('joy','energy','love','gratitude','calm')),
  intensity smallint not null check (intensity between 1 and 10),
  location geometry(Point, 4326) not null,
  created_at timestamptz not null default now()
);

-- The tap-card aggregation and field queries are spatial + recency-bound.
create index public_moments_location_gist on public.public_moments using gist (location);
create index public_moments_created_at on public.public_moments (created_at desc);

alter table public.public_moments enable row level security;

-- Anyone (anon or signed in) may contribute a feeling…
create policy "anyone can add a public moment"
  on public.public_moments for insert
  to anon, authenticated
  with check (true);

-- …but nobody reads raw rows from the client: the public surface serves
-- AGGREGATES ONLY (via security-definer RPCs, e.g. the neighborhood card).
-- Raw individual locations must never be exposed (CLAUDE.md).

-- ---------------------------------------------------------------------
-- PRIVATE: the journal. Full fidelity, owner-only, forever.
-- ---------------------------------------------------------------------
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  emotion text not null check (emotion in ('joy','energy','love','gratitude','calm')),
  intensity smallint not null check (intensity between 1 and 10),
  location geometry(Point, 4326) not null,
  created_at timestamptz not null default now(),
  -- The memory (all optional; editable any time after the log):
  description text check (char_length(description) <= 2000),
  photo_path text, -- Supabase Storage object path in the private "memories" bucket
  song_title text check (char_length(song_title) <= 200),
  song_artist text check (char_length(song_artist) <= 200),
  updated_at timestamptz not null default now()
);

create index journal_entries_owner on public.journal_entries (user_id, created_at desc);
create index journal_entries_owner_calendar
  on public.journal_entries (user_id, ((created_at at time zone 'utc')::date)); -- "on this day"

alter table public.journal_entries enable row level security;

create policy "owner reads own journal"
  on public.journal_entries for select
  to authenticated using (auth.uid() = user_id);
create policy "owner writes own journal"
  on public.journal_entries for insert
  to authenticated with check (auth.uid() = user_id);
create policy "owner edits own journal"
  on public.journal_entries for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner deletes own journal"
  on public.journal_entries for delete
  to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- STORAGE: private photo bucket (owner-only by path prefix = user id).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('memories', 'memories', false);

create policy "owner manages own memory photos"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'memories' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'memories' and (storage.foldername(name))[1] = auth.uid()::text);
