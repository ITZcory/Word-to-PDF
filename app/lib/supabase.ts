import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://kunwpjtmjwotjplwuwxg.supabase.co",
  "sb_publishable_aEVn2evQ1Z6c5xzqKB0OeA_ndMaRMEW",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
