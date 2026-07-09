/**
 * Supabase browser client.
 *
 * Reads public env vars (safe to expose): the anon key is row-level-security
 * gated. Returns `null` until the project is wired up, so the app still builds
 * and deploys before Supabase exists. Guard usages with `if (supabase)`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          // The session lives across reloads and refreshes itself; the
          // magic link lands back in the tab and is detected from the URL.
          // Implicit, not PKCE (2026-07-09): the free-tier default email is
          // LINK-ONLY (templates locked, no code shown), and a PKCE link
          // dies unless it opens in the exact browser context that asked —
          // Eli's link "didn't work". The hash-token flow is self-contained.
          // Revisit with custom SMTP + a code-first template (handoff doc).
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "implicit",
          storageKey: "warmth-auth",
        },
      })
    : null;

export const isSupabaseConfigured = Boolean(url && anonKey);
