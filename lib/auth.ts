/**
 * lib/auth.ts — THE IDENTITY SEAM.
 *
 * ⚠️ BEN: this is yours to replace. The journal is built against this
 * interface as if real auth already exists (Eli's call, 2026-07-07).
 * Today it mints one stable anonymous id per device (localStorage) so the
 * private journal works end-to-end. When Supabase auth lands, swap the
 * internals for `supabase.auth` (anonymous sign-in + optional email claim)
 * WITHOUT changing the exported shape — nothing else in the app should
 * need to know the difference.
 *
 * The contract the journal relies on:
 *   - `currentUserId()` is stable across reloads on the same device/account.
 *   - `isSignedIn()` gates the private surface; today it is always true
 *     (anonymous IS an identity), so there is no logged-out dead end.
 */

const KEY = "warmth-identity-v1";

let cached: string | null = null;

/** Stable user id — anonymous device identity until Ben wires Supabase. */
export function currentUserId(): string {
  if (cached) return cached;
  if (typeof window === "undefined") return "ssr-no-user";
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(KEY, id);
    }
    cached = id;
    return id;
  } catch {
    // Private mode: identity lives for the session only — the journal
    // still works, it just starts fresh next visit.
    cached = cached ?? `session-${Math.random().toString(36).slice(2, 12)}`;
    return cached;
  }
}

/** Today: always signed in (anonymous identity). Ben: reflect real session. */
export function isSignedIn(): boolean {
  return true;
}
