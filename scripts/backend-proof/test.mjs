// ============================================================================
// Warmth backend proof — executes Eli's real migrations on a real Postgres
// (pglite) under real roles, and attacks every privacy promise in CLAUDE.md.
// Run: node --test test.mjs
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bootDb, asRole } from "./db.mjs";

const REPO = "/Users/benjaminnashel/warmth";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// The client's half of the privacy-grid contract (lib/publicField.ts).
const GRID_LNG = 0.004;
const GRID_LAT = 0.003;
const cellCentre = (lng, lat) => [
  Math.floor(lng / GRID_LNG) * GRID_LNG + GRID_LNG / 2,
  Math.floor(lat / GRID_LAT) * GRID_LAT + GRID_LAT / 2,
];

const { db, files } = await bootDb();
await db.query("insert into auth.users (id, email) values ($1, 'a@x.io'), ($2, null)", [USER_A, USER_B]);

const superCount = async (t) => Number((await db.query(`select count(*) n from ${t}`)).rows[0].n);
const insertPublic = (role, uid, lng, lat, emotion = "joy", intensity = 7) =>
  asRole(db, role, uid, () =>
    db.query(
      "insert into public.public_moments (emotion, intensity, location) values ($1, $2, point($3, $4))",
      [emotion, intensity, lng, lat],
    ));
const insertJournal = (uid, id, lng, lat, emotion = "calm", intensity = 5) =>
  asRole(db, "authenticated", uid, () =>
    db.query(
      "insert into public.journal_entries (id, user_id, emotion, intensity, location) values ($1, $2, $3, $4, point($5, $6))",
      [id, uid, emotion, intensity, lng, lat],
    ));

test("migrations apply cleanly on a real Postgres", () => {
  // Subset, not an exact count — a new migration must never fail this
  // (clean application is already proven by bootDb() above).
  for (const known of [
    "20260707120000_public_and_journal.sql",
    "20260708120000_public_read_realtime_triggers.sql",
    "20260804163547_field_read_cap.sql",
  ]) {
    assert.ok(files.includes(known), `missing migration: ${known}`);
  }
});

test("field_read_cap took effect: bucket ordering + cap, no raw-time leak", async () => {
  const def = (await db.query(
    "select pg_get_functiondef(oid) d from pg_proc where proname = 'public_field_recent'",
  )).rows[0].d;
  assert.match(def, /order by bucket desc, cell_id/i, "orders on the QUANTIZED bucket");
  assert.doesNotMatch(def, /order by max\(created_at\)/i, "must not order on raw time");
  assert.match(def, /limit 550/i, "cap sized to the client's 500-point budget");
  assert.match(def, /security definer/i, "still definer (raw table stays sealed)");
});

// The critical finding from the 2026-08-04 review, pinned so it can never
// regress: a future-dated row must neither be insertable nor readable.
test("future-dated moments cannot evict the real city", async () => {
  const before = (await asRole(db, "anon", null, () =>
    db.query("select count(*) n from public.public_field_recent()"))).rows[0].n;

  // GUARD 2: the write is refused outright.
  await assert.rejects(
    () => asRole(db, "anon", null, () =>
      db.query(
        "insert into public.public_moments (emotion, intensity, location, created_at) values ('joy', 10, point(-73.96, 40.77), now() + interval '5 years')",
      )),
    /row-level security|violates/i,
    "a future timestamp must be refused at insert",
  );

  // GUARD 1: even if one existed (a service-role write bypasses RLS), the
  // read ignores it — so it can never outrank or evict the real field.
  await db.query(
    "insert into public.public_moments (emotion, intensity, location, created_at) values ('joy', 10, point(-73.96, 40.77), now() + interval '5 years')",
  );
  const after = (await asRole(db, "anon", null, () =>
    db.query("select count(*) n from public.public_field_recent()"))).rows[0].n;
  assert.equal(Number(after), Number(before), "the future row must not surface");

  // Backdating (offline replay) is still allowed — the real use case.
  await asRole(db, "anon", null, () =>
    db.query(
      "insert into public.public_moments (emotion, intensity, location, created_at) values ('calm', 4, point(-73.96, 40.77), now() - interval '2 hours')",
    ));

  // Leave the table exactly as found — later tests count rows.
  await db.query("delete from public.public_moments where location[0] = -73.96 and location[1] = 40.77");
  assert.equal(await superCount("public.public_moments"), 0, "this test must leave no residue");
});

// The harness inserts via point(); production sends an EWKT string from
// lib/sync.ts. Nothing here executes that string, so pin its shape in the
// source — an axis swap or a lost SRID prefix would otherwise stay green
// here and break (or silently mis-locate) every insert on real PostGIS.
test("lib/sync.ts wire format: SRID prefix present, lng before lat", () => {
  const sync = readFileSync(`${REPO}/lib/sync.ts`, "utf8");
  const hits = [...sync.matchAll(/`SRID=4326;POINT\(\$\{m\.lng\} \$\{m\.lat\}\)`/g)];
  assert.equal(hits.length, 2, "both the public and journal inserts must use the exact EWKT form");
});

// ---------------------------------------------------------------------------
// STRUCTURAL ANONYMITY — the table itself cannot carry identity
// ---------------------------------------------------------------------------
test("public_moments has no identity column at all", async () => {
  const r = await db.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name='public_moments' order by ordinal_position",
  );
  assert.deepEqual(r.rows.map((x) => x.column_name), ["id", "emotion", "intensity", "location", "created_at"]);
});

test("public_moments is in no realtime publication (raw rows can never stream)", async () => {
  const r = await db.query("select * from pg_publication_tables where tablename in ('public_moments','journal_entries')");
  assert.equal(r.rows.length, 0);
});

test("RLS is enabled on every sensitive surface", async () => {
  const r = await db.query(
    "select relname, relrowsecurity from pg_class where relname in ('public_moments','journal_entries') order by relname",
  );
  assert.deepEqual(r.rows, [
    { relname: "journal_entries", relrowsecurity: true },
    { relname: "public_moments", relrowsecurity: true },
  ]);
});

// ---------------------------------------------------------------------------
// RLS MATRIX — inserts allowed, raw reads forbidden
// ---------------------------------------------------------------------------
test("anyone can contribute a public moment (anon and authenticated)", async () => {
  await insertPublic("anon", null, -73.9857, 40.7484, "joy", 8);
  await insertPublic("authenticated", USER_A, -73.9855, 40.7486, "joy", 6);
  assert.equal(await superCount("public.public_moments"), 2);
});

test("NOBODY reads raw public_moments rows — not anon, not authenticated", async () => {
  for (const [role, uid] of [["anon", null], ["authenticated", USER_A]]) {
    const r = await asRole(db, role, uid, () => db.query("select * from public.public_moments"));
    assert.equal(r.rows.length, 0, `${role} must see zero raw rows`);
  }
});

test("insert…returning cannot be used to read back a raw public row", async () => {
  // Settle FIRST, assert after: wrapping the assertion in a .catch would
  // swallow its own failure and make this tripwire unable to ever fire.
  const outcome = await asRole(db, "anon", null, () =>
    db.query(
      "insert into public.public_moments (emotion, intensity, location) values ('calm', 3, point(-73.95, 40.78)) returning *",
    )).then((r) => ({ rows: r.rows }), (err) => ({ err }));
  if (outcome.err) {
    // An RLS/permission refusal is equally correct — but it must be that,
    // not any error (a typo'd column would otherwise "pass").
    assert.match(String(outcome.err.message), /row-level security|permission denied/i);
  } else {
    assert.equal(outcome.rows.length, 0, "returning must not expose the raw row");
  }
});

test("journal: owner can insert own rows; forging another user_id is refused", async () => {
  await insertJournal(USER_A, "11111111-0000-4000-8000-000000000001", -73.99, 40.73);
  await assert.rejects(
    () => asRole(db, "authenticated", USER_A, () =>
      db.query(
        "insert into public.journal_entries (id, user_id, emotion, intensity, location) values (gen_random_uuid(), $1, 'joy', 5, point(-73.9, 40.7))",
        [USER_B],
      )),
    /row-level security|violates/i,
  );
});

test("journal: A cannot read, update, or delete B's entries", async () => {
  await insertJournal(USER_B, "22222222-0000-4000-8000-000000000002", -73.91, 40.69);
  const seen = await asRole(db, "authenticated", USER_A, () =>
    db.query("select id from public.journal_entries"));
  assert.deepEqual(seen.rows.map((r) => r.id), ["11111111-0000-4000-8000-000000000001"]);

  const upd = await asRole(db, "authenticated", USER_A, () =>
    db.query("update public.journal_entries set description = 'stolen' where user_id = $1", [USER_B]));
  assert.equal(upd.affectedRows ?? 0, 0);

  const del = await asRole(db, "authenticated", USER_A, () =>
    db.query("delete from public.journal_entries where user_id = $1", [USER_B]));
  assert.equal(del.affectedRows ?? 0, 0);
  assert.equal(await superCount("public.journal_entries"), 2);
});

test("journal_mine view: security_invoker keeps it owner-scoped, returns lng/lat", async () => {
  const r = await asRole(db, "authenticated", USER_A, () =>
    db.query("select id, lng, lat, emotion from public.journal_mine"));
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].id, "11111111-0000-4000-8000-000000000001");
  assert.ok(Math.abs(r.rows[0].lng - -73.99) < 1e-9, "lng must be a plain double");
  assert.ok(Math.abs(r.rows[0].lat - 40.73) < 1e-9, "lat must be a plain double");
});

test("anon has no path into the journal at all", async () => {
  const r = await asRole(db, "anon", null, () => db.query("select * from public.journal_mine"));
  assert.equal(r.rows.length, 0);
  const base = await asRole(db, "anon", null, () => db.query("select * from public.journal_entries"));
  assert.equal(base.rows.length, 0);
});

// ---------------------------------------------------------------------------
// THE PRIVACY GRID — aggregates only, cell centres only, client-SQL agreement
// ---------------------------------------------------------------------------
test("public_field_recent returns cell CENTRES that match the client's grid math", async () => {
  const rawLng = -73.98571, rawLat = 40.74843; // an exact drop point
  await insertPublic("anon", null, rawLng, rawLat, "love", 9);
  const rows = (await asRole(db, "anon", null, () => db.query("select * from public.public_field_recent()"))).rows;
  const cell = rows.find((r) => r.emotion === "love");
  assert.ok(cell, "the love cell must aggregate");
  const [cLng, cLat] = cellCentre(rawLng, rawLat);
  assert.ok(Math.abs(cell.lng - cLng) < 1e-9, `SQL centre ${cell.lng} != client centre ${cLng}`);
  assert.ok(Math.abs(cell.lat - cLat) < 1e-9, `SQL centre ${cell.lat} != client centre ${cLat}`);
  assert.notEqual(cell.lng, rawLng, "centre must never equal the raw point");
  assert.ok(Math.abs(cell.lng - rawLng) <= GRID_LNG / 2 + 1e-9, "centre within half a cell");
  assert.ok(Math.abs(cell.lat - rawLat) <= GRID_LAT / 2 + 1e-9);
});

test("negative-coordinate flooring: NYC longitudes snap to the same cell as the client", async () => {
  // A point exactly on the tricky side of a boundary.
  const lng = -74.0001, lat = 40.6001;
  await insertPublic("anon", null, lng, lat, "energy", 4);
  const rows = (await asRole(db, "anon", null, () => db.query("select * from public.public_field_recent()"))).rows;
  const cell = rows.find((r) => r.emotion === "energy");
  const [cLng, cLat] = cellCentre(lng, lat);
  assert.ok(Math.abs(cell.lng - cLng) < 1e-9 && Math.abs(cell.lat - cLat) < 1e-9);
});

test("aggregation: n, avg_intensity, and the 15-minute bucket", async () => {
  // three gratitude moments in one cell
  const base = [-73.9500, 40.7800];
  await insertPublic("anon", null, base[0] + 0.0001, base[1] + 0.0001, "gratitude", 2);
  await insertPublic("anon", null, base[0] + 0.0009, base[1] + 0.0004, "gratitude", 4);
  await insertPublic("authenticated", USER_B, base[0] + 0.0014, base[1] + 0.0011, "gratitude", 9);
  const rows = (await asRole(db, "authenticated", USER_A, () =>
    db.query("select * from public.public_field_recent()"))).rows;
  const cell = rows.find((r) => r.emotion === "gratitude");
  assert.equal(cell.n, 3, "three feelings pool into one cell");
  assert.ok(Math.abs(cell.avg_intensity - 5) < 1e-6, "avg(2,4,9) = 5");
  const bucketMs = new Date(cell.bucket).getTime();
  assert.equal(bucketMs % (900 * 1000), 0, "bucket must be 15-min quantized");
  assert.ok(Number.isFinite(bucketMs) && bucketMs <= Date.now());
});

test("moments older than 24h never surface", async () => {
  await db.query(
    "insert into public.public_moments (emotion, intensity, location, created_at) values ('calm', 8, point(-73.90, 40.85), now() - interval '25 hours')",
  );
  const rows = (await asRole(db, "anon", null, () => db.query("select * from public.public_field_recent()"))).rows;
  const stale = rows.find((r) => r.emotion === "calm" && Math.abs(r.lat - (Math.floor(40.85 / GRID_LAT) * GRID_LAT + GRID_LAT / 2)) < 1e-9);
  assert.equal(stale, undefined, "25h-old moment must not aggregate");
});

test("RPC output shape is exactly the client's FieldRow contract", async () => {
  const r = await asRole(db, "anon", null, () => db.query("select * from public.public_field_recent() limit 1"));
  assert.deepEqual(Object.keys(r.rows[0]).sort(), ["avg_intensity", "bucket", "cell_id", "emotion", "lat", "lng", "n"]);
});

// ---------------------------------------------------------------------------
// THE LIVE PATH — broadcast emits snapped centres, and only those
// ---------------------------------------------------------------------------
test("every public insert broadcasts exactly one coarsened cell — never a raw coord", async () => {
  await db.exec("delete from realtime.messages");
  const rawLng = -73.97712, rawLat = 40.76389;
  await insertPublic("authenticated", USER_A, rawLng, rawLat, "joy", 7);
  const msgs = (await db.query("select * from realtime.messages")).rows;
  assert.equal(msgs.length, 1, "one insert → one broadcast");
  const m = msgs[0];
  assert.equal(m.topic, "public_field");
  assert.equal(m.event, "moment");
  assert.equal(m.private, true);
  const p = m.payload;
  assert.deepEqual(Object.keys(p).sort(), ["bucket", "cell_id", "emotion", "eid", "intensity", "lng", "lat"].sort(),
    "payload keys are exactly the client's LivePayload contract");
  const [cLng, cLat] = cellCentre(rawLng, rawLat);
  assert.ok(Math.abs(p.lng - cLng) < 1e-9 && Math.abs(p.lat - cLat) < 1e-9, "payload carries the cell centre");
  assert.notEqual(p.lng, rawLng, "raw longitude must never leave the database");
  assert.notEqual(p.lat, rawLat);
  assert.equal(p.emotion, "joy");
  assert.equal(p.intensity, 7);
  assert.equal(new Date(p.bucket).getTime() % (900 * 1000), 0, "bucket 15-min quantized");
  assert.match(String(p.eid), /^[0-9a-f-]{36}$/, "eid is a fresh uuid, not identity");
  const noRaw = JSON.stringify(p);
  assert.ok(!noRaw.includes(String(rawLng)) && !noRaw.includes(String(rawLat)), "payload contains no raw coordinate");
});

test("broadcast cell_id equals the RPC cell_id for the same cell (echo-dedupe join)", async () => {
  const msg = (await db.query("select payload from realtime.messages limit 1")).rows[0].payload;
  const rows = (await asRole(db, "anon", null, () => db.query("select * from public.public_field_recent()"))).rows;
  const match = rows.find((r) => r.cell_id === msg.cell_id);
  assert.ok(match, "live cell_id must join to the snapshot cell_id");
  assert.equal(match.emotion, msg.emotion);
});

test("clients cannot PUBLISH into public_field (only the DB trigger may)", async () => {
  for (const [role, uid] of [["anon", null], ["authenticated", USER_A]]) {
    await assert.rejects(
      () => asRole(db, role, uid, () =>
        db.query(
          "insert into realtime.messages (topic, extension, event, payload, private) values ('public_field', 'broadcast', 'moment', '{\"lng\":-73.98,\"lat\":40.75,\"emotion\":\"love\"}'::jsonb, true)",
        )),
      /row-level security|permission denied|violates/i,
      `${role} must not be able to publish a bloom`,
    );
  }
});

test("broadcast receive authorization: authenticated on-topic only", async () => {
  await db.query("select set_config('realtime.topic', 'public_field', false)");
  const authed = await asRole(db, "authenticated", USER_A, () => db.query("select count(*) n from realtime.messages"));
  assert.ok(Number(authed.rows[0].n) >= 1, "authenticated subscriber on the topic receives");
  const anon = await asRole(db, "anon", null, () => db.query("select count(*) n from realtime.messages"));
  assert.equal(Number(anon.rows[0].n), 0, "anon receives nothing (private channel)");
  await db.query("select set_config('realtime.topic', 'other_topic', false)");
  const wrong = await asRole(db, "authenticated", USER_A, () => db.query("select count(*) n from realtime.messages"));
  assert.equal(Number(wrong.rows[0].n), 0, "wrong topic receives nothing");
  await db.query("select set_config('realtime.topic', '', false)");
});

// ---------------------------------------------------------------------------
// EMOTION CONTRACT — SQL accepts exactly the client's five, nothing else
// ---------------------------------------------------------------------------
test("SQL emotion set == client theme.ts set; legacy names are refused", async () => {
  const theme = readFileSync(`${REPO}/lib/theme.ts`, "utf8");
  const m = theme.match(/export type Emotion =([^;]+);/);
  const clientSet = [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]).sort();
  for (const e of clientSet) {
    await insertPublic("anon", null, -73.93, 40.7, e, 5); // must not throw
  }
  for (const legacy of ["reflective", "awe", "sadness"]) {
    await assert.rejects(() => insertPublic("anon", null, -73.93, 40.7, legacy, 5), /check|violates/i);
  }
  assert.deepEqual(clientSet, ["calm", "energy", "gratitude", "joy", "love"]);
});

test("client grid constants in publicField.ts match the SQL literals", () => {
  const pf = readFileSync(`${REPO}/lib/publicField.ts`, "utf8");
  assert.match(pf, /GRID_LNG = 0\.004/);
  assert.match(pf, /GRID_LAT = 0\.003/);
  // Pin the load-bearing expression too, not just the constants: swapping
  // floor for round (or reordering the key) would leave the constants
  // intact while breaking self-echo dedupe at cell boundaries.
  assert.ok(
    pf.includes("`${Math.floor(lng / GRID_LNG)}:${Math.floor(lat / GRID_LAT)}:${emotion}`"),
    "publicCellKey must keep its exact floor-based key shape",
  );
  const sql = readFileSync(`${REPO}/supabase/migrations/20260708120000_public_read_realtime_triggers.sql`, "utf8");
  for (const lit of ["/ 0.004", "/ 0.003", "* 0.004 + 0.002", "* 0.003 + 0.0015"]) {
    assert.ok(sql.includes(lit), `SQL must contain '${lit}'`);
  }
});

// ---------------------------------------------------------------------------
// JOURNAL MECHANICS + STORAGE
// ---------------------------------------------------------------------------
test("updated_at touch trigger fires on memory edits", async () => {
  const before = (await db.query("select updated_at from public.journal_entries where id = '11111111-0000-4000-8000-000000000001'")).rows[0].updated_at;
  await asRole(db, "authenticated", USER_A, () =>
    db.query("update public.journal_entries set description = 'the day the map lit up' where id = '11111111-0000-4000-8000-000000000001'"));
  const after = (await db.query("select updated_at, description from public.journal_entries where id = '11111111-0000-4000-8000-000000000001'")).rows[0];
  assert.equal(after.description, "the day the map lit up");
  assert.ok(new Date(after.updated_at) >= new Date(before), "updated_at touched");
});

test("storage: owner-only path prefix on the memories bucket", async () => {
  const bucket = (await db.query("select id, public from storage.buckets where id = 'memories'")).rows[0];
  assert.ok(bucket, "memories bucket exists");
  assert.equal(bucket.public, false, "bucket must be private");
  await asRole(db, "authenticated", USER_A, () =>
    db.query("insert into storage.objects (bucket_id, name) values ('memories', $1)", [`${USER_A}/photo1.jpg`]));
  await assert.rejects(
    () => asRole(db, "authenticated", USER_A, () =>
      db.query("insert into storage.objects (bucket_id, name) values ('memories', $1)", [`${USER_B}/stolen.jpg`])),
    /row-level security|violates/i,
  );
  const mine = await asRole(db, "authenticated", USER_B, () => db.query("select name from storage.objects"));
  assert.equal(mine.rows.length, 0, "B sees none of A's photos");
});
