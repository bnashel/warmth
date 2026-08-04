/**
 * lib/auth.ts — THE IDENTITY SEAM (now real Supabase auth).
 *
 * The whole app reads identity through this file and nowhere else. It wraps
 * `supabase.auth` behind a SYNCHRONOUS surface on purpose: the commit path
 * (momentsStore.add → pushMomentToCloud → currentUserId) runs synchronously,
 * so the session user id is cached from onAuthStateChange into a module
 * variable and read without awaiting. The hard auth wall guarantees a
 * session exists before the orb is ever interactive, so the cache is always
 * populated before a commit can happen.
 *
 * DEV FALLBACK (no Supabase keys yet): when the project isn't configured we
 * keep the old device-local anonymous identity and report "signed in", so
 * the app stays fully usable locally. The moment real keys land in
 * .env.local, the real session + the auth wall engage with zero code change.
 *
 * The contract the rest of the app relies on:
 *   - currentUserId() is stable across reloads for the same account/device.
 *   - isSignedIn() gates the private surface (and the wall).
 */
"use client";

import { useSyncExternalStore } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const LEGACY_KEY = "warmth-identity-v1";

/** The cached session user id — the sync read the commit path depends on. */
let sessionUserId: string | null = null;
/** True once initAuth's first getSession has resolved (drives the wall veil). */
let ready = false;
let initStarted = false;
/** Store subscribers (useSyncExternalStore) — fire on any state change. */
const storeListeners = new Set<() => void>();
/** Edge subscribers (onAuthChange) — fire only on a sign-in/out transition. */
const edgeListeners = new Set<(signedIn: boolean) => void>();

/** A referentially-stable snapshot for useSyncExternalStore: only rebuilt
 *  when userId or readiness actually changes, so React doesn't loop. */
let snapshot: { userId: string | null; loading: boolean } = { userId: null, loading: true };

function publish() {
  if (snapshot.userId !== sessionUserId || snapshot.loading !== !ready) {
    snapshot = { userId: sessionUserId, loading: !ready };
    for (const cb of storeListeners) cb();
  }
}

function markReady() {
  if (!ready) {
    ready = true;
    publish();
  }
}

function setUser(id: string | null) {
  const was = sessionUserId;
  if (was === id) return;
  sessionUserId = id;
  publish();
  for (const cb of edgeListeners) cb(id !== null);
}

/* ------------------------------------------------------------------ */
/* Dev fallback: a stable device id when Supabase isn't configured    */
/* ------------------------------------------------------------------ */
function legacyDeviceId(): string {
  if (typeof window === "undefined") return "ssr-no-user";
  try {
    let id = window.localStorage.getItem(LEGACY_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(LEGACY_KEY, id);
    }
    return id;
  } catch {
    return `session-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

/** Start the auth engine: resolve the current session, then track changes.
 *  Idempotent — safe to call from every mount. */
export async function initAuth(): Promise<void> {
  if (initStarted) return;
  initStarted = true;

  // No project yet → the dev fallback identity, always "signed in".
  if (!supabase || !isSupabaseConfigured) {
    setUser(legacyDeviceId());
    markReady();
    return;
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user?.id ?? null);
    markReady();
  });
  const { data } = await supabase.auth.getSession();
  setUser(data.session?.user?.id ?? null);
  markReady();
}

/** Stable user id for the commit/sync path — synchronous by contract. */
export function currentUserId(): string {
  return sessionUserId ?? "no-session";
}

/** Gates the private surface and the auth wall. */
export function isSignedIn(): boolean {
  return sessionUserId !== null;
}

/** Whether the first session check has resolved (avoids an auth-then-app flash). */
export function authReady(): boolean {
  return ready;
}

/** Subscribe to sign-in/out edges. Returns an unsubscribe. */
export function onAuthChange(cb: (signedIn: boolean) => void): () => void {
  edgeListeners.add(cb);
  return () => edgeListeners.delete(cb);
}

/* ------------------------------------------------------------------ */
/* Sign-in methods                                                     */
/* ------------------------------------------------------------------ */

const callbackUrl = () =>
  typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

type AuthResult = { error?: string };

/** Email magic link (same-device) + a 6-digit code (cross-device fallback). */
export async function signInWithEmail(email: string): Promise<AuthResult> {
  if (!supabase) return { error: "Backend not configured yet." };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl() },
  });
  return error ? { error: error.message } : {};
}

/** Phone OTP — a text with a 6-digit code (verify with verifyPhone). */
export async function signInWithPhone(phone: string): Promise<AuthResult> {
  if (!supabase) return { error: "Backend not configured yet." };
  const { error } = await supabase.auth.signInWithOtp({ phone });
  return error ? { error: error.message } : {};
}

export async function verifyPhone(phone: string, token: string): Promise<AuthResult> {
  if (!supabase) return { error: "Backend not configured yet." };
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  return error ? { error: error.message } : {};
}

/** Paste-a-code path for email too (works when the link opens on another device). */
export async function verifyEmail(email: string, token: string): Promise<AuthResult> {
  if (!supabase) return { error: "Backend not configured yet." };
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  return error ? { error: error.message } : {};
}

/** Google / Apple — redirects out and back to /auth/callback. */
export async function signInWithProvider(provider: "google" | "apple"): Promise<AuthResult> {
  if (!supabase) return { error: "Backend not configured yet." };
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: callbackUrl() },
  });
  return error ? { error: error.message } : {};
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
  setUser(null);
}

/* ------------------------------------------------------------------ */
/* React binding                                                       */
/* ------------------------------------------------------------------ */

/** Session state for components: the wall reads this. useSyncExternalStore
 *  gives a race-free snapshot (initAuth may resolve before or after mount). */
function subscribe(cb: () => void): () => void {
  void initAuth();
  storeListeners.add(cb);
  return () => storeListeners.delete(cb);
}
const serverSnapshot = { userId: null, loading: true } as const;

export function useSession(): { userId: string | null; loading: boolean } {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot,
  );
}
