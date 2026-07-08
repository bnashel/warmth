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
          // The session lives across reloads and refreshes itself; the OAuth
          // redirect (Google/Apple) and magic link land back in the tab and
          // are detected from the URL. PKCE so the code exchange is safe on
          // a public client. A named storageKey keeps it ours.
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
          storageKey: "warmth-auth",
        },
      })
    : null;

export const isSupabaseConfigured = Boolean(url && anonKey);
