import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_KEY || "";

export function getAdmin() {
  if (!url || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  return createClient(url, serviceKey);
}
