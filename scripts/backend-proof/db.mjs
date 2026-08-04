// Harness loader: boot pglite, apply the shim, then apply Warmth's real
// migrations (geometry -> point substitution only — see README).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "..", "supabase", "migrations");
const SHIM = join(HERE, "shim.sql");

/** The one allowed substitution: PostGIS column type -> native point. */
function substitute(sql) {
  return sql.replace(/geometry\(Point,\s*4326\)/g, "point");
}

export async function bootDb({ log = false } = {}) {
  const db = new PGlite();
  await db.exec(readFileSync(SHIM, "utf8"));

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const raw = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    // postgis is unavailable in pglite; the harness strips just the
    // extension statement (spatial indexes still build over `point`).
    const sql = substitute(raw).replace(/create extension if not exists postgis;/g, "");
    await db.exec(sql);
    if (log) console.log(`applied: ${f}`);
  }
  return { db, files };
}

/**
 * Run `fn` as a client role with a simulated JWT sub claim, then restore.
 * Mirrors how PostgREST executes requests: set role + request claims.
 */
export async function asRole(db, role, uid, fn) {
  await db.exec(`set role ${role}`);
  // Both forms PostgREST/Supabase may present: the legacy per-claim GUC and
  // the modern claims JSON. auth.uid() in shim.sql reads either.
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    uid ? JSON.stringify({ sub: uid, role }) : "",
  ]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)", []);
    await db.query("select set_config('request.jwt.claims', '', false)", []);
  }
}
