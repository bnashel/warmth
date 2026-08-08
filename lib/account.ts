/**
 * lib/account.ts — the account's three promises, kept.
 *
 *   exportJournal()  — your whole journal as one file, on demand. Local
 *                      truth (the store) is the source: it includes photos
 *                      as data URLs, so the export is complete even offline.
 *   changeEmail()    — via Supabase's double-confirmation flow (both the
 *                      old and new address get a say; config.toml).
 *   deleteAccount()  — the real exit. Server-side (edge function): photos
 *                      destroyed, auth user deleted, journal rows cascade.
 *                      Then every trace on THIS device is wiped too.
 *
 * Public moments are untouched by deletion, on purpose: those rows carry
 * no identity at all (no user column exists), so they are not linkable to
 * the account and not reclaimable — the feelings already given to the city
 * stay in the city. The UI says this before the user confirms.
 */
import { supabase } from "@/lib/supabase";
import { isSignedIn } from "@/lib/auth";
import { momentsStore } from "@/lib/momentsStore";

/** Download the journal as a single self-contained JSON file. */
export function exportJournal(): boolean {
  try {
    const entries = momentsStore.ownEntries().map((m) => ({
      id: m.id,
      emotion: m.emotion,
      intensity: m.intensity,
      lng: m.lng,
      lat: m.lat,
      createdAt: new Date(m.createdAt).toISOString(),
      description: m.memory?.description,
      // The on-device copy IS the photo (a data URL) — the export needs no
      // network and no signed URLs, and works signed-out.
      photo: m.memory?.photo,
    }));
    const blob = new Blob(
      [JSON.stringify({ app: "warmth", exportedAt: new Date().toISOString(), entries }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `warmth-journal-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    return true;
  } catch {
    return false;
  }
}

/** Start the email change; both addresses receive a confirmation. */
export async function changeEmail(next: string): Promise<{ error?: string }> {
  if (!supabase || !isSignedIn()) return { error: "not signed in" };
  const { error } = await supabase.auth.updateUser({ email: next.trim() });
  return error ? { error: error.message } : {};
}

/** Every trace of Warmth on this device. */
const LOCAL_KEYS_PREFIX = "warmth";

/** Delete the account everywhere, then wipe this device and reload. */
export async function deleteAccount(): Promise<{ error?: string }> {
  if (!supabase || !isSignedIn()) return { error: "not signed in" };
  const { data, error } = await supabase.functions.invoke("delete-account", { method: "POST" });
  if (error) return { error: error.message };
  if (!(data as { ok?: boolean })?.ok) {
    return { error: (data as { error?: string })?.error ?? "deletion failed" };
  }
  // The server side is gone; now this device. Sign-out first would 403 (the
  // user no longer exists) — just erase local state and start clean.
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(LOCAL_KEYS_PREFIX)) doomed.push(k);
    }
    for (const k of doomed) window.localStorage.removeItem(k);
  } catch {
    /* storage blocked — reload still lands on a signed-out wall */
  }
  window.location.reload();
  return {};
}
