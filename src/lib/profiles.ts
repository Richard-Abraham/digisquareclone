import { getAdmin } from "./supabase";

/**
 * Build a user_id → profile map, falling back to Supabase Auth emails
 * when no `profiles` row exists. This ensures display names are always
 * available so the UI never shows raw UUIDs.
 */
export async function resolveProfiles(
  userIds: string[],
): Promise<Map<string, { user_id: string; display_name: string; avatar_url: string | null }>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  const map = new Map<string, { user_id: string; display_name: string; avatar_url: string | null }>();

  if (!ids.length) return map;

  // 1. Fetch from profiles table.
  const { data: profiles } = await getAdmin()
    .from("profiles")
    .select("user_id, display_name, avatar_url")
    .in("user_id", ids);

  for (const p of profiles || []) {
    if (p.display_name) {
      map.set(p.user_id, { user_id: p.user_id, display_name: p.display_name, avatar_url: p.avatar_url ?? null });
    }
  }

  // 2. For any IDs without a profile (or without display_name), fall back to Auth.
  const missing = ids.filter((id) => !map.has(id));
  if (missing.length) {
    const { data } = await getAdmin().auth.admin.listUsers({ perPage: 1000 });
    const authMap = new Map((data.users || []).map((u) => [u.id, u]));
    for (const id of missing) {
      const u = authMap.get(id);
      if (!u) continue;
      const fullName = (u.user_metadata as Record<string, string>)?.full_name;
      if (fullName?.trim()) {
        map.set(id, { user_id: id, display_name: fullName.trim(), avatar_url: null });
      } else if (u.email) {
        map.set(id, { user_id: id, display_name: u.email.split("@")[0], avatar_url: null });
      }
    }
  }

  return map;
}
