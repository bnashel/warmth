/**
 * lib/photos.ts — memory photos in the private "memories" bucket.
 *
 * The bucket + owner-only RLS already exist (migration 20260707120000). Every
 * object is stored under the owner's uid folder, which is exactly what the
 * storage policy checks: (storage.foldername(name))[1] = auth.uid(). The
 * bucket is private, so reads go through short-lived signed URLs. No-ops
 * (returning an error/null) without a client or a session.
 */
import { supabase } from "@/lib/supabase";
import { currentUserId, isSignedIn } from "@/lib/auth";

const BUCKET = "memories";

/** Upload a photo for one journal entry; returns its storage path. */
export async function uploadMemoryPhoto(
  entryId: string,
  file: File,
): Promise<{ path?: string; error?: string }> {
  if (!supabase || !isSignedIn()) return { error: "Sign in to keep photos." };
  const uid = currentUserId();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  // First folder = uid → satisfies the owner-only storage RLS.
  const path = `${uid}/${entryId}/${rand}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) return { error: error.message };
  return { path };
}

/** A time-limited URL to view a private photo (null if unavailable). */
export async function signedPhotoUrl(path: string, expiresSec = 3600): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresSec);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Upload from the on-device data URL (the local-first copy). Used by the
 *  sign-in photo sweep: photos attached before sign-in — or whose original
 *  upload failed — exist only as data URLs in localStorage. */
export async function uploadMemoryPhotoFromDataUrl(
  entryId: string,
  dataUrl: string,
): Promise<{ path?: string; error?: string }> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const type = blob.type || "image/jpeg";
    const file = new File([blob], `memory.${type.split("/")[1] ?? "jpg"}`, { type });
    return uploadMemoryPhoto(entryId, file);
  } catch {
    return { error: "Couldn't read the saved photo." };
  }
}

/** Delete a photo's bytes. In a private diary, removing a photo must mean
 *  GONE — clearing the journal reference alone would leave the object in
 *  the bucket forever. Owner-only RLS enforces whose objects can go. A
 *  failed delete never blocks the edit: the path is tombstoned and retried
 *  at the next sign-in sweep, so "removed" converges on "gone" even across
 *  crashes and offline stretches. */
export async function deleteMemoryPhoto(path: string): Promise<void> {
  if (!path) return;
  if (!supabase || !isSignedIn()) {
    tombstonePhoto(path); // can't reach the bucket now — remember to.
    return;
  }
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    tombstonePhoto(path);
    if (process.env.NODE_ENV !== "production") {
      console.warn(`warmth photos: delete failed (tombstoned) — ${error.message}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Tombstones: paths whose bytes still need deleting.                  */
/* ------------------------------------------------------------------ */
const TOMB_KEY = "warmth-photo-tombstones-v1";
const TOMB_CAP = 200;

function readTombstones(): string[] {
  try {
    const raw = window.localStorage.getItem(TOMB_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}
function writeTombstones(list: string[]): void {
  try {
    window.localStorage.setItem(TOMB_KEY, JSON.stringify(list.slice(-TOMB_CAP)));
  } catch {
    /* storage blocked — worst case an orphaned object, never a broken app */
  }
}

export function tombstonePhoto(path: string): void {
  const list = readTombstones();
  if (!list.includes(path)) writeTombstones([...list, path]);
}

/** Retry every pending delete (called from the sign-in sweep).
 *  remove() of an already-gone object returns SUCCESS (empty data, no
 *  error) — which is the goal state, so any non-error drops the stone. */
export async function drainPhotoTombstones(): Promise<void> {
  if (!supabase || !isSignedIn()) return;
  const list = readTombstones();
  if (list.length === 0) return;
  const remaining: string[] = [];
  for (const path of list) {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) remaining.push(path);
  }
  writeTombstones(remaining);
}

/** Rescue path for a divergent row: the SERVER knows a photo_path this
 *  device's store lost (e.g. the path landed in memory but the localStorage
 *  write quota-failed, then a reload). Read it and tombstone it BEFORE the
 *  row is nulled, so removing the photo still deletes the real bytes. */
export async function tombstoneRowPhoto(entryId: string): Promise<void> {
  if (!supabase || !isSignedIn()) return;
  const { data } = await supabase
    .from("journal_mine")
    .select("photo_path")
    .eq("id", entryId)
    .maybeSingle();
  const path = (data as { photo_path: string | null } | null)?.photo_path;
  if (path) tombstonePhoto(path);
}
