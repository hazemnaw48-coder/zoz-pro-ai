import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/**
 * Returns the browser client configured for the MEHWAR Preview project.
 * Only the publishable/anon key belongs here. Never use service_role.
 */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error(
      "إعداد الاتصال غير مكتمل. أضف VITE_SUPABASE_URL وVITE_SUPABASE_ANON_KEY إلى ملف .env.local.",
    );
  }

  if (!/^https:\/\/[^\s]+$/.test(url)) {
    throw new Error("رابط Supabase غير صالح.");
  }

  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return client;
}
