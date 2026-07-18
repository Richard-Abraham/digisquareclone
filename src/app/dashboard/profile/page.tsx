"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/providers";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner, ErrorState } from "@/components/ui/States";
import { User, Settings, Folder } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { CheckIcon, SunIcon, MoonIcon, BellIcon } from "@/components/icons";

type Tab = "profile" | "preferences" | "workspace";

interface Workspace { id: string; slug: string; name: string; owner_id: string }
interface Member { user_id: string; role: number; is_owner: boolean; profile: { display_name?: string } | null }

const NOTIF_KEYS = ["email_notifications", "realtime_notifications", "daily_digest"] as const;
const NOTIF_LABELS: Record<string, string> = {
  email_notifications: "Email notifications",
  realtime_notifications: "Real-time notifications",
  daily_digest: "Daily standup digest",
};
const NOTIF_DESCS: Record<string, string> = {
  email_notifications: "Receive task assignments and updates via email",
  realtime_notifications: "Show live updates as they happen in the app",
  daily_digest: "Get a summary of your team's standups every morning",
};

export default function ProfilePage() {
  const { user, profile, ready, refresh } = useAuth();
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState<Tab>("profile");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [editingBio, setEditingBio] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBio, setSavingBio] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [isManager, setIsManager] = useState(false);
  const [wsLoading, setWsLoading] = useState(true);

  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    email_notifications: true,
    realtime_notifications: true,
    daily_digest: false,
  });

  useEffect(() => {
    if (!ready) return;
    if (!user) return;
    setName(profile?.display_name || "");
    setBio((profile as any)?.bio || "");
    setLoading(false);
  }, [ready, user, profile]);

  useEffect(() => {
    if (!ready || !user) return;
    (async () => {
      try {
        const wsList = await api<Workspace[]>("/api/workspaces");
        if (wsList.length > 0) {
          const ws = wsList[0];
          setWorkspace(ws);
          const res = await api<{ members: Member[]; is_manager: boolean; my_user_id: string }>(`/api/workspaces/${ws.slug}/members`);
          setMembers(res.members);
          setIsManager(res.is_manager);
        }
      } catch {} finally { setWsLoading(false); }
    })();
  }, [ready, user]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("digisystem-notif-prefs");
      if (stored) setNotifPrefs(JSON.parse(stored));
    } catch {}
  }, []);

  async function saveName() {
    if (!name.trim()) return;
    setSaving(true); setMsg(null); setSaved(false);
    try {
      await api("/api/auth/me", { method: "PATCH", body: { display_name: name } });
      setSaved(true); refresh();
    }
    catch (e: any) { setMsg(e.message); toast.error("Failed to save name"); } finally { setSaving(false); }
  }

  async function saveBio() {
    setSavingBio(true);
    try {
      await api("/api/auth/me", { method: "PATCH", body: { bio } });
      setEditingBio(false); refresh(); toast.success("Bio saved");
    }
    catch { toast.error("Failed to save bio"); } finally { setSavingBio(false); }
  }

  function toggleNotif(key: string) {
    const next = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(next);
    try { localStorage.setItem("digisystem-notif-prefs", JSON.stringify(next)); toast.success("Preference updated"); } catch {}
  }

  if (loading) return <Spinner label="Loading profile..." />;
  if (!user) return <ErrorState message="Not logged in" />;

  const initials = (name?.[0] || user.email?.[0] || "U").toUpperCase();
  const roleLabel = isManager ? "Manager" : "Member";

  const TAB_META: Record<Tab, { label: string; icon: React.ReactNode }> = {
    profile: { label: "Profile", icon: <User size={15} /> },
    preferences: { label: "Preferences", icon: <Settings size={15} /> },
    workspace: { label: "Workspace", icon: <Folder size={15} /> },
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="section-header">
        <div>
          <h1 className="section-title">Settings</h1>
          <p className="section-desc">Manage your profile, preferences, and workspace</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-6 mt-6">
        {/* Sidebar */}
        <div className="space-y-4">
          {/* Profile card */}
          <div className="card p-5 text-center">
            <div className="avatar-lg mx-auto bg-gradient-to-br from-primary-300 to-primary-600 text-white text-xl font-bold shadow-md shadow-primary-200/50 dark:shadow-primary-900/30 mb-3 ring-4 ring-surface-1">
              {initials}
            </div>
            <p className="text-sm font-semibold text-text-primary truncate">{name || "Set your name"}</p>
            <p className="text-xs text-text-tertiary truncate mt-0.5">{user.email}</p>
            {workspace && (
              <span className={`badge mt-2 text-[10px] ${isManager ? "badge-primary" : "badge-neutral"}`}>
                {isManager ? "Manager" : "Member"}
              </span>
            )}
          </div>

          {/* Nav */}
          <nav className="card p-2 space-y-0.5">
            {(["profile", "preferences", "workspace"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2
                  ${tab === t ? "bg-primary-50 text-primary dark:bg-primary-500/10" : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"}`}>
                <span className="flex-shrink-0">{TAB_META[t].icon}</span>
                {TAB_META[t].label}
              </button>
            ))}
          </nav>

          {/* Theme toggle */}
          <div className="card p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {theme === "dark" ? <MoonIcon size={16} /> : <SunIcon size={16} />}
              <span className="text-sm text-text-secondary">{theme === "dark" ? "Dark" : "Light"} mode</span>
            </div>
            <ThemeToggle size="sm" />
          </div>
        </div>

        {/* Content */}
        <div className="space-y-5">
          {tab === "profile" && (
            <>
              <div className="card p-6 space-y-4">
                <h3 className="text-sm font-bold text-text-primary">Profile</h3>

                <Input
                  label="Display name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setSaved(false); }}
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                  placeholder="Your display name"
                  error={msg || undefined}
                />

                {saved && <p className="text-xs text-emerald-600 animate-fade-in flex items-center gap-1"><CheckIcon size={12} /> Saved.</p>}

                <Button variant="primary" size="sm" onClick={saveName} disabled={saving || !name.trim()}>
                  {saving ? "Saving..." : "Save name"}
                </Button>
              </div>

              <div className="card p-6 space-y-3">
                <h3 className="text-sm font-bold text-text-primary">Bio</h3>
                {editingBio ? (
                  <div className="space-y-3">
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Tell your team a bit about yourself..."
                      rows={4}
                      className="input resize-none rounded-xl text-sm"
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <Button variant="primary" size="sm" onClick={saveBio} disabled={savingBio}>
                        {savingBio ? "Saving..." : "Save bio"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setEditingBio(false); setBio((profile as any)?.bio || ""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div onClick={() => setEditingBio(true)}
                    className="cursor-text rounded-xl border border-border-subtle px-3 py-2.5 text-sm text-text-secondary hover:border-border-accent transition-colors min-h-[60px]">
                    {bio ? (
                      <p className="whitespace-pre-wrap leading-relaxed">{bio}</p>
                    ) : (
                      <p className="text-text-tertiary italic">Click to add a bio...</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === "preferences" && (
            <div className="card p-6 space-y-5">
              <h3 className="text-sm font-bold text-text-primary">Preferences</h3>

              {/* Theme */}
              <div className="flex items-center justify-between py-3 border-b border-border-subtle">
                <div>
                  <p className="text-sm font-medium text-text-primary">Theme</p>
                  <p className="text-xs text-text-tertiary mt-0.5">Choose light or dark appearance</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setTheme("light")}
                    className={`btn-sm rounded-lg ${theme === "light" ? "btn-primary" : "btn-ghost"}`}>Light</button>
                  <button onClick={() => setTheme("dark")}
                    className={`btn-sm rounded-lg ${theme === "dark" ? "btn-primary" : "btn-ghost"}`}>Dark</button>
                </div>
              </div>

              {/* Notifications */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-3">
                  <BellIcon size={14} />
                  <h4 className="text-sm font-semibold text-text-primary">Notifications</h4>
                </div>
                {NOTIF_KEYS.map((key) => (
                  <div key={key} className="flex items-center justify-between py-3 border-b border-border-subtle last:border-0">
                    <div className="min-w-0 pr-4">
                      <p className="text-sm font-medium text-text-primary">{NOTIF_LABELS[key]}</p>
                      <p className="text-xs text-text-tertiary mt-0.5">{NOTIF_DESCS[key]}</p>
                    </div>
                    <button
                      onClick={() => toggleNotif(key)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${notifPrefs[key] ? "bg-primary" : "bg-border"}`}
                      role="switch"
                      aria-checked={notifPrefs[key]}
                      aria-label={NOTIF_LABELS[key]}
                    >
                      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${notifPrefs[key] ? "translate-x-5" : "translate-x-0.5"} mt-0.5`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "workspace" && (
            <div className="card p-6 space-y-4">
              <h3 className="text-sm font-bold text-text-primary">Workspace</h3>
              {wsLoading ? (
                <Spinner label="Loading workspace..." />
              ) : workspace ? (
                <>
                  <div className="flex items-center justify-between py-3 border-b border-border-subtle">
                    <div className="flex items-center gap-2.5">
                      <div className="size-9 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {workspace.name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">{workspace.name}</p>
                        <p className="text-xs text-text-tertiary mt-0.5">/{workspace.slug}</p>
                      </div>
                    </div>
                    <span className={`badge text-[10px] ${isManager ? "badge-primary" : "badge-neutral"}`}>{isManager ? "Manager" : "Member"}</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-border-subtle">
                    <p className="text-sm text-text-secondary">Members</p>
                    <span className="text-sm font-bold text-text-primary">{members.length}</span>
                  </div>
                  <div className="pt-2">
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Team</p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {members.map((m) => (
                        <div key={m.user_id} className="flex items-center gap-2.5 py-1">
                          <div className="avatar-sm bg-primary-100 text-primary-700 text-[10px] font-bold dark:bg-primary-500/20 dark:text-primary-300">
                            {(m.profile?.display_name?.[0] || "U").toUpperCase()}
                          </div>
                          <span className="text-sm text-text-primary truncate">{m.profile?.display_name || "Unknown"}</span>
                          {m.is_owner && <span className="badge badge-warning text-[9px]">Owner</span>}
                          {!m.is_owner && m.role === 2 && <span className="badge badge-primary text-[9px]">Manager</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-text-tertiary">No workspace found.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
