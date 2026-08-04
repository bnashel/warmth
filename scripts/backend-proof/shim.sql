-- ============================================================================
-- supabase-lite shim for pglite: recreate the Supabase runtime surface that
-- Warmth's migrations assume, faithfully enough that RLS + triggers + RPCs
-- execute for real. PostGIS is unavailable in pglite; the harness substitutes
-- geometry(Point,4326) -> native `point` and shims st_x/st_y. Everything else
-- (roles, RLS enforcement, security definer, publications) is REAL Postgres.
-- ============================================================================

-- ---- roles (Supabase's three client-facing roles) --------------------------
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

-- ---- auth schema (GoTrue's SQL surface) ------------------------------------
create schema auth;

create table auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);

-- auth.uid(): Supabase's real shipped definition — the legacy per-claim GUC
-- first, falling back to the request.jwt.claims JSON that PostgREST sets.
create function auth.uid() returns uuid
language sql stable as
$fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$fn$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- ---- realtime schema (broadcast surface used by migration 2) ---------------
create schema realtime;

create table realtime.messages (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  extension text not null,
  event text,
  payload jsonb,
  private boolean not null default false,
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;

-- realtime.send(payload, event, topic, private) — same signature as Supabase.
create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void
language plpgsql
security definer
as $fn$
begin
  insert into realtime.messages (topic, extension, event, payload, private)
  values (topic, 'broadcast', event, payload, private);
end;
$fn$;

-- realtime.topic() — the topic of the message being authorized; Supabase sets
-- this per-connection. Tests set the GUC to simulate a subscriber.
create function realtime.topic() returns text
language sql stable as
$fn$ select nullif(current_setting('realtime.topic', true), '') $fn$;

grant usage on schema realtime to anon, authenticated, service_role;
-- Mirror Supabase's grant model: clients hold table privileges and RLS is
-- the only gate. Granting INSERT here is what makes the "clients cannot
-- publish" test meaningful — it proves default-deny RLS refuses the write,
-- not merely a missing grant.
grant select, insert on realtime.messages to anon, authenticated, service_role;
grant execute on function realtime.topic() to anon, authenticated, service_role;

-- ---- storage schema (bucket + object surface used by migration 1) ----------
create schema storage;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;

-- storage.foldername(name): Supabase's path-split helper (all but last part).
create function storage.foldername(name text) returns text[]
language sql immutable as
$fn$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$fn$;

grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

-- ---- extensions schema (search_path target in Eli's functions) -------------
create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- ---- PostGIS stand-ins over native `point` ---------------------------------
-- geometry(Point,4326) is substituted to `point` by the harness loader; these
-- give the migrations' st_x/st_y calls the same meaning (x=lng, y=lat).
create function public.st_x(p point) returns double precision
language sql immutable as $fn$ select (p)[0] $fn$;
create function public.st_y(p point) returns double precision
language sql immutable as $fn$ select (p)[1] $fn$;

-- ---- Supabase-style default privileges -------------------------------------
-- Supabase grants broad table access to client roles; RLS is the gate.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
