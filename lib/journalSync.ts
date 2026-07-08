/**
 * lib/journalSync.ts — the journal's two-way reconciliation at sign-in.
 *
 *   claimLocalJournal()      — push on-device entries into the account (once
 *                              per account/device). Journal table ONLY: a
 *                              backfill must never pollute the anonymous
 *                              public field.
 *   hydrateJournalFromCloud()— pull the account's entries down and merge them
 *                              into the local trail (entries from other
 *                              devices appear; local edits aren't clobbered).
 *
 * Both no-op without a configured client and a real session, so dev (no keys)
 * and the first-frame race are safe. Call order at sign-in: claim, then
 * hydrate (local lands on the server, then the full set comes back).
 */
import { supabase } from "@/lib/supabase";
import { currentUserId, isSignedIn } from "@/lib/auth";
import { momentsStore, type Moment } from "@/lib/momentsStore";
import type { Emotion } from "@/lib/theme";

function claimedFlag(uid: string) {
  return `warmth-claimed-${uid}`;
}
function alreadyClaimed(uid: string): boolean {
  try {
    return window.localStorage.getItem(claimedFlag(uid)) === "1";
  } catch {
    return false;
  }
}
function markClaimed(uid: string) {
  try {
    window.localStorage.setItem(claimedFlag(uid), "1");
  } catch {
    /* private mode — we'll just re-attempt the (idempotent) claim next time */
  }
}

/** One-time: adopt any on-device journal entries into the signed-in account. */
export async function claimLocalJournal(): Promise<void> {
  if (!supabase || !isSignedIn()) return;
  const uid = currentUserId();
  if (alreadyClaimed(uid)) return;

  const entries = momentsStore.ownEntries();
  if (entries.length === 0) {
    markClaimed(uid);
    return;
  }
  const rows = entries.map((m) => ({
    id: m.id,
    user_id: uid,
    emotion: m.emotion,
    intensity: Math.round(m.intensity),
    location: `SRID=4326;POINT(${m.lng} ${m.lat})`,
    created_at: new Date(m.createdAt).toISOString(),
    description: m.memory?.description ?? null,
    // Song columns still exist in the schema but are no longer written
    // (Eli, 2026-07-08: the prompt + a photo is the complete set).
    photo_path: m.memory?.photoPath ?? null,
  }));
  // Idempotent: entries already claimed (e.g. committed while signed in) are
  // left untouched. JOURNAL ONLY — the public field is never backfilled.
  const { error } = await supabase
    .from("journal_entries")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (!error) markClaimed(uid);
  else if (process.env.NODE_ENV !== "production") {
    console.warn(`warmth journalSync: claim failed — ${error.message}`);
  }
}

/** Pull the account's journal down and merge into the local trail. */
export async function hydrateJournalFromCloud(): Promise<void> {
  if (!supabase || !isSignedIn()) return;
  // journal_mine is a security_invoker view: RLS scopes it to my rows, and it
  // hands back lng/lat (not WKB) so there's nothing to parse.
  const { data, error } = await supabase
    .from("journal_mine")
    .select("id, emotion, intensity, lng, lat, created_at, description, photo_path")
    .order("created_at", { ascending: false });
  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`warmth journalSync: hydrate failed — ${error.message}`);
    }
    return;
  }
  for (const row of data ?? []) {
    const m: Moment = {
      id: row.id as string,
      emotion: row.emotion as Emotion,
      intensity: row.intensity as number,
      lng: row.lng as number,
      lat: row.lat as number,
      createdAt: new Date(row.created_at as string).getTime(),
      own: true,
      memory: {
        description: (row.description as string) ?? undefined,
        // `photo` (the local data URL) never lives server-side; another
        // device fetches the Storage original from photoPath (signed URL).
        photoPath: (row.photo_path as string) ?? undefined,
      },
    };
    momentsStore.ingestCloudEntry(m);
  }
}
