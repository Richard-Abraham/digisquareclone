"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface Me { user: { id: string; email: string }; profile: { display_name: string } | null }

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("token")) { router.push("/login"); return; }
    api<Me>("/api/auth/me").then((m) => { setMe(m); setName(m.profile?.display_name || ""); setLoading(false); }).catch(() => router.push("/login"));
  }, [router]);

  async function save() {
    if (!name.trim()) return;
    setSaving(true); setMsg(null); setSaved(false);
    try {
      await api("/api/auth/me", { method: "PATCH", body: { display_name: name } });
      setSaved(true);
    } catch (e: any) { setMsg(e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="flex h-full items-center justify-center text-[#5e6574]">Loading...</div>;

  return (
    <div className="p-6 max-w-md mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#1a1d23]">Your profile</h1>
        <p className="text-sm text-[#5e6574]">{me?.user.email}</p>
      </div>
      <div className="bg-white rounded-xl border border-[#eef0f6] p-4">
        <label className="block text-xs font-medium text-[#5e6574] mb-1">Display name</label>
        <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} onKeyDown={(e) => e.key === "Enter" && save()}
          className="w-full rounded-lg border border-[#e2e6ef] px-3 py-2 text-sm outline-none focus:border-[#3f76ff]" />
        {msg && <p className="text-xs text-red-500 mt-2">{msg}</p>}
        {saved && <p className="text-xs text-[#16a34a] mt-2">Saved.</p>}
        <button onClick={save} disabled={saving || !name.trim()} className="mt-3 rounded-lg bg-[#3f76ff] px-4 py-2 text-sm font-medium text-white hover:bg-[#2558e8] disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
      </div>
    </div>
  );
}
