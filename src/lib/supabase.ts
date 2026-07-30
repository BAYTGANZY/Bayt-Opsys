import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://tixxacthedwaoqtjokdr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_NJhrAoS54zwCGQlHycHlZQ_ueYyPJO_";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
