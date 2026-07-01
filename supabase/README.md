# supabase/

Home for the Supabase project: migrations, config, and (later) edge functions.

Migrations are created **only** via the Supabase CLI — never hand-edit an
already-applied migration (per CLAUDE.md):

```bash
supabase migration new <name>
```

Nothing lives here yet; the Postgres + PostGIS schema lands with the first
data work.
