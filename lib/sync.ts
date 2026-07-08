/**
 * lib/sync.ts — the dual write: ONE log action, TWO destinations.
 *
 * THE PRIVACY BOUNDARY (Eli's call, 2026-07-07 — do not soften):
 *   public_moments   — emotion, intensity, location, time. NO identity.
 *   journal_entries  — the same moment, full fidelity, owned by user_id.
 * Two physically separate tables; nothing ever joins them. The public
 * payload is built by PICKING fields (never spreading the moment), so a
 * future field on Moment can't leak into the anonymous row by accident.
 *
 * Currently DORMANT: `supabase` is null until the project is linked (the
 * access token + applied migrations are pending — see
 * supabase/migrations/20260707120000_public_and_journal.sql). Every call is
 * fire-and-forget and quota-safe: the app never blocks on the network, and
 * localStorage remains the source of truth until sync is real (Phase 3b
 * adds echo-dedupe via `momentsStore.has`).
 */
import { supabase } from "@/lib/supabase";
import { currentUserId, isSignedIn } from "@/lib/auth";
import type { Memory, Moment } from "@/lib/momentsStore";

/** Fresh commit → anonymous public row + owned journal row. */
/** supabase-js returns errors, it doesn't throw — surface them in dev so a
 *  half-broken sync (public lands, journal fails) can never hide (review). */
function report(where: string, error: { message: string } | null) {
  if (error && process.env.NODE_ENV !== "production") {
    console.warn(`warmth sync: ${where} failed — ${error.message}`);
  }
}

export async function pushMomentToCloud(m: Moment): Promise<void> {
  // No client, or no session yet (first-frame race): the on-device journal
  // already holds the entry; a later hydrate/claim reconciles it.
  if (!supabase || !isSignedIn()) return;
  try {
    // PUBLIC: picked fields only — structurally incapable of carrying
    // identity. No id: the DB mints its own; no key is shared with the
    // journal row, so the two can never be joined.
    const pub = await supabase.from("public_moments").insert({
      emotion: m.emotion,
      intensity: Math.round(m.intensity),
      location: `SRID=4326;POINT(${m.lng} ${m.lat})`,
      created_at: new Date(m.createdAt).toISOString(),
    });
    report("public insert", pub.error);
    // PRIVATE: the owned journal record (id reused so edits address it).
    const priv = await supabase.from("journal_entries").insert({
      id: m.id,
      user_id: currentUserId(),
      emotion: m.emotion,
      intensity: Math.round(m.intensity),
      location: `SRID=4326;POINT(${m.lng} ${m.lat})`,
      created_at: new Date(m.createdAt).toISOString(),
    });
    report("journal insert", priv.error);
  } catch {
    // Offline — the on-device journal already has the entry.
  }
}

/** Memory add/edit → journal row only. The public side NEVER sees memories. */
export async function pushMemoryToCloud(id: string, memory: Memory | undefined): Promise<void> {
  if (!supabase || !memory || !isSignedIn()) return;
  try {
    const res = await supabase
      .from("journal_entries")
      .update({
        description: memory.description ?? null,
        song_title: memory.songTitle ?? null,
        song_artist: memory.songArtist ?? null,
        photo_path: memory.photoPath ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", currentUserId());
    report("memory update", res.error);
  } catch {
    // Same story: local persistence already succeeded.
  }
}
