# Sign-in — how it works, and how to rescue it

## The shape

Email → a **six-digit code** typed into the wall. No password, no link.

**Why not a link** (learned the hard way, 2026-08-04): mail apps *prefetch*
links to build previews, and a sign-in link is a one-time token — Apple's
preview spent it, so every link arrived pre-expired. Links also sign in the
device that *opens the email*, which is the wrong device whenever you read
mail on a laptop and want your phone signed in. A typed code has neither
problem. The email template (`supabase/templates/magic_link.html`) therefore
contains **no link at all**.

The wall is `components/Auth/AuthOverlay.tsx`; identity lives behind the seam
in `lib/auth.ts` (synchronous `currentUserId()` by contract — the commit path
depends on it). `components/Auth/AppGate.tsx` gates the app and reconciles the
journal at sign-in (claim → hydrate → photo sweep).

## Sending is the fragile part

Sign-in emails go through **custom SMTP** (Supabase dashboard → Authentication
→ Emails → SMTP Settings). Two things to know:

- **Without custom SMTP** the built-in sender allows only ~2 emails/hour for
  the entire project, and Supabase **locks the email template** — the code-only
  template silently cannot apply. Custom SMTP is what unlocks it.
- **iCloud SMTP (`smtp.mail.me.com`) is a poor fit.** It needs an
  app-specific password (not your Apple ID password), and Apple frequently
  refuses connections from datacenter IPs regardless. Symptom: the API returns
  `500 unexpected_failure — Error sending magic link email`, and the wall shows
  "the email didn't go out". If it resists, switch to a transactional provider
  (Resend/SendGrid/Postmark) rather than fighting it.

## Locked out? Mint a code by hand

This needs no email at all and works even when sending is broken or
rate-limited. Requires the service-role key (never put this in the app):

```bash
export PATH="$HOME/.local/node/bin:$PATH"
SERVICE=$(npx -y supabase projects api-keys --project-ref eafonmtjgojesudwazom -o json \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{console.log(JSON.parse(d).find(k=>k.name==="service_role").api_key)})')

curl -s -X POST "https://eafonmtjgojesudwazom.supabase.co/auth/v1/admin/generate_link" \
  -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
  -H "Content-Type: application/json" \
  -d '{"type":"magiclink","email":"you@example.com"}' \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).email_otp))'
```

Then in the app: enter that email → **"already have a code?"** → type the six
digits. Codes last an hour, one use. Requesting a *new* code invalidates the
previous one, so don't press send after minting.

## Account management

The profile chip (bottom-left, `components/Auth/AccountChip.tsx`) holds name,
journal stats, and the three data promises in `lib/account.ts`:

- **export** — the whole journal as one JSON file, photos included as data
  URLs. Pure client-side: works offline and signed-out.
- **change email** — Supabase double-confirms (both addresses must agree).
- **delete** — calls the `delete-account` edge function, which uses admin
  powers to erase the caller's photo objects and auth user (journal rows
  cascade), then wipes this device and reloads. **Public moments survive on
  purpose**: those rows have no user column at all, so they are neither
  linkable to the account nor reclaimable. The confirm copy says exactly this.

The function takes **no parameters** — identity comes only from the caller's
verified JWT, so it can never be aimed at another account. Proven end-to-end
against the live project (unauthenticated refused; total self-erasure; other
accounts untouched; public rows survive).
