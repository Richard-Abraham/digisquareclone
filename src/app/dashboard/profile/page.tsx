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
    try { await api("/api/auth/me", { method: "PATCH", body: { display_name: name } }); setSaved(true); }
    catch (e: any) { setMsg(e.message); } finally { setSaving(false); }
  }

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-600 animate-pulse-soft" />
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-lg mx-auto">
      <div className="section-header">
        <div>
          <h1 className="section-title">Your profile</h1>
          <p className="section-desc">{me?.user.email}</p>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        {/* Avatar preview */}
        <div className="flex items-center gap-4">
          <div className="avatar-lg bg-gradient-to-br from-primary-300 to-primary-600 text-white text-xl font-bold shadow-md shadow-primary-200">
            {name?.[0]?.toUpperCase() || me?.user.email?.[0]?.toUpperCase() || "U"}
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">{name || "Set your name"}</p>
            <p className="text-xs text-text-tertiary">{me?.user.email}</p>
          </div>
        </div>

        <div className="pt-2">
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Display name</label>
          <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="input" placeholder="Your display name" autoFocus />
          {msg && <p className="text-xs text-red-500 mt-2 animate-fade-in">{msg}</p>}
          {saved && <p className="text-xs text-emerald-600 mt-2 animate-fade-in flex items-center gap-1"><CheckIcon size={12} /> Saved.</p>}
        </div>

        <button onClick={save} disabled={saving || !name.trim()} className="btn-primary btn-sm">
          {saving ? <span className="flex items-center gap-2"><span className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</span> : "Save"}
        </button>
      </div>
    </div>
  );
}

function CheckIcon({ size }: { size?: number }) {
  return (
    <svg width={size || 14} height={size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
