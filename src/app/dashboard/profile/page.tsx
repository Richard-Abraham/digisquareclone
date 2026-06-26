"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/providers";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner, ErrorState } from "@/components/ui/States";
import { CheckIcon } from "@/components/icons";

export default function ProfilePage() {
  const { user, profile, ready, refresh } = useAuth();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) return;
    setName(profile?.display_name || "");
    setLoading(false);
  }, [ready, user, profile]);

  async function save() {
    if (!name.trim()) return;
    setSaving(true); setMsg(null); setSaved(false);
    try {
      await api("/api/auth/me", { method: "PATCH", body: { display_name: name } });
      setSaved(true); refresh();
    }
    catch (e: any) { setMsg(e.message); } finally { setSaving(false); }
  }

  if (loading) return <Spinner label="Loading profile..." />;
  if (!user) return <ErrorState message="Not logged in" />;

  return (
    <div className="p-4 sm:p-6 max-w-lg mx-auto">
      <div className="section-header">
        <div>
          <h1 className="section-title">Your profile</h1>
          <p className="section-desc">{user.email}</p>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="avatar-lg bg-gradient-to-br from-primary-300 to-primary-600 text-white text-xl font-bold shadow-md shadow-primary-200/50 dark:shadow-primary-900/30">
            {name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">{name || "Set your name"}</p>
            <p className="text-xs text-text-tertiary truncate">{user.email}</p>
          </div>
        </div>

        <Input
          label="Display name"
          value={name}
          onChange={(e) => { setName(e.target.value); setSaved(false); }}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Your display name"
          autoFocus
          error={msg || undefined}
        />

        {saved && <p className="text-xs text-emerald-600 animate-fade-in flex items-center gap-1"><CheckIcon size={12} /> Saved.</p>}

        <Button variant="primary" size="sm" onClick={save} disabled={saving || !name.trim()}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
