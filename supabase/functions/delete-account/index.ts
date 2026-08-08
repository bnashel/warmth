/**
 * delete-account — the way out. A private diary must offer a real exit:
 * everything the account owns is destroyed, server-side, atomically enough.
 *
 * Who can call it: only a signed-in user, and only on THEMSELVES — identity
 * comes exclusively from the caller's verified JWT; there is no user-id
 * parameter to aim at anyone else.
 *
 * What dies: every photo object under the caller's uid prefix, then the
 * auth user — journal_entries rows follow via the ON DELETE CASCADE foreign
 * key (migration 20260707120000).
 *
 * What survives, on purpose: public_moments. Those rows are structurally
 * anonymous — no user column exists — so they are not the caller's to
 * reclaim and not linkable to them. The feelings already given to the city
 * stay in the city. (The client says exactly this before deleting.)
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Identity = the caller's own verified JWT. Nothing else is trusted.
  const authHeader = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) return json({ error: "not signed in" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Photos first: everything under the caller's uid prefix. Objects live
  //    at `${uid}/${entryId}/${file}`, so walk one folder level down.
  //    Photos go before the user row — if anything fails midway, the
  //    account still exists and the user can simply try again.
  const bucket = admin.storage.from("memories");
  const paths: string[] = [];
  const { data: top, error: listErr } = await bucket.list(user.id, { limit: 1000 });
  if (listErr) return json({ error: `photo listing failed: ${listErr.message}` }, 500);
  for (const item of top ?? []) {
    // Folders come back with a null id in storage listings.
    if (item.id === null) {
      const { data: files } = await bucket.list(`${user.id}/${item.name}`, { limit: 1000 });
      for (const f of files ?? []) paths.push(`${user.id}/${item.name}/${f.name}`);
    } else {
      paths.push(`${user.id}/${item.name}`);
    }
  }
  if (paths.length > 0) {
    const { error: rmErr } = await bucket.remove(paths);
    if (rmErr) return json({ error: `photo deletion failed: ${rmErr.message}` }, 500);
  }

  // 2. The account. journal_entries rows cascade with it (FK).
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) return json({ error: delErr.message }, 500);

  return json({ ok: true, photosDeleted: paths.length });
});
