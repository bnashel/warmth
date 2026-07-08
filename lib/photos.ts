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
