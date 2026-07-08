# Warmth backend — handoff & go-live checklist

The full Supabase backend is **built and committed** on `night-pass`. It is
**dormant until a project exists**: with no keys, the app runs exactly as
before (device identity, no wall, ambient seed city). The moment the two env
vars below are set, the sign-up wall, per-account journal, DB-backed public
field, realtime, and photos all engage — **no code change needed**.

## The one blocker: Ben provisions the project

I can't create it from here (the MCP token has no orgs). Ben:

1. **Create a Supabase project** (dashboard). Note the region.
2. **Apply the migrations, in order** (`npx supabase link` then `npx supabase db push`, or paste into the SQL editor):
   1. `supabase/migrations/20260707120000_public_and_journal.sql` (tables, RLS, storage bucket)
   2. `supabase/migrations/20260708120000_public_read_realtime_triggers.sql` (read RPC, broadcast trigger, `journal_mine`, `updated_at`)
3. **Auth → Providers:** enable **Email** (magic link on). Then **Phone** (needs Twilio/MessageBird SMS creds), **Google** (Cloud console OAuth client; redirect `https://<ref>.supabase.co/auth/v1/callback`), **Apple** (paid dev account, Services ID + key). Email ships alone — Google/Apple/phone can follow.
4. **Auth → SMTP:** set **custom SMTP** (Resend/Postmark) *before* testing — the built-in sender throttles to a few emails/hour and will stall you immediately.
5. **Auth → URL Configuration:** Site URL = the deployed origin; **Redirect allow-list** must include `http://localhost:3005/auth/callback` and `https://<prod-domain>/auth/callback`.
6. **Hand over two keys** (Settings → API) → paste into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
   (The anon key is RLS-gated and safe in the client bundle.)

## What's built (all committed, typecheck + lint clean)

| Area | Files | State |
|---|---|---|
| Client + session persistence | `lib/supabase.ts` | ✅ |
| Real auth (sync `currentUserId`, `useSession`, dev fallback) | `lib/auth.ts`, `lib/sync.ts` | ✅ |
| Schema: read RPC, broadcast trigger, `journal_mine`, `updated_at` | `supabase/migrations/20260708120000_*.sql` | ✅ written — **Ben applies** |
| Sign-up wall (Google/Apple/email-link+code/phone), PKCE callback | `components/Auth/AppGate.tsx`, `AuthOverlay.tsx`, `app/auth/callback/page.tsx`, `app/page.tsx` | ✅ |
| Journal sync both ways + claim-on-sign-in | `lib/journalSync.ts`, `lib/momentsStore.ts` | ✅ |
| Public field from DB + realtime (coarsened, self-echo guard) | `lib/publicField.ts`, `momentsStore`, `OneScreen` | ✅ |
| Photos (upload + signed read-back) | `lib/photos.ts`, `components/Trail/MemoryCard.tsx` | ✅ |

**Privacy guarantee (CLAUDE.md):** raw public coordinates live only in
`public_moments.location`, which has no SELECT policy and is in no realtime
publication. Clients get only ~330 m grid-cell **centres** (via the RPC and
the broadcast trigger). Exact location survives only in the owner's journal.

## Live verification, per slice (once keys are set)

Run `npm run dev -- -p 3005`.

1. **Wall:** open `/` → the glass wall over the blurred breathing field; the orb does nothing. Email → "check your email" → paste the 6-digit code (read it from **Auth logs** in dev) → wall springs away, orb live.
2. **Journal both ways:** commit a feeling → confirm a row in `journal_entries` (yours) **and** `public_moments` (no user). On a second device/browser, sign in as the same account → your entry appears (hydrate). Sign in as a different account → you see none of the first user's entries (RLS).
3. **Public field read:** `execute_sql` insert ~30 `public_moments` at varied points → reload → the field is populated, and `momentsStore.points` coordinates are **cell centres, not the inserted coords** (the privacy check). Empty the table → ambient seed returns.
4. **Realtime:** with the app open, `execute_sql` insert one `public_moment` → within ~1 s a new bloom appears. Commit from the orb → exactly **one** light at your spot (the echo is de-duped, no double).
5. **Photos:** open a journal entry → "add a photo" → it thumbnails; confirm the object under `memories/<your-uid>/…` and that a second account gets 403 on it.
6. **Privacy asserts (run once):** anon `select * from public_moments` returns 0 rows; `public_moments` is **absent** from `pg_publication_tables`; `journal_mine` has `security_invoker = true`; `get_advisors(security)` is clean.

## Follow-ups (not blocking)

Per-cell density cap in the RPC for very busy cities · journal **delete** UI
(RLS policy already exists) · "N people feeling now" presence · 24 h retention
cron on `public_moments` · full cross-device journal-edit conflict resolution
(v1 fills only a *bare* local entry's memory from the cloud; never clobbers a
local edit).
