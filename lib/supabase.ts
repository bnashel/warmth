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
  url && anonKey ? createClient(url, anonKey) : null;

export const isSupabaseConfigured = Boolean(url && anonKey);
