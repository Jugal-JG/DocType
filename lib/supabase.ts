import { createClient } from "@supabase/supabase-js";

export function connectSupabase(persistSession = true) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession, autoRefreshToken: persistSession, flowType: "pkce" } })
    : null;
}
