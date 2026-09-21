"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { api, getToken } from "@/lib/api";
import { useWorkspace, useCredentials, useClients, type Credential } from "@/lib/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Drawer } from "@/components/ui/Drawer";
import { Tabs } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner, EmptyState } from "@/components/ui/States";
import { EyeIcon, SpinnerIcon } from "@/components/icons";
import { toast } from "sonner";
import { Search, Download, Shield, Trash2 } from "lucide-react";

interface Grant { user_id: string; granted_by: string; granted_at: string; profile: { display_name?: string } | null }
interface MemberOption { user_id: string; role: number; profile: { display_name?: string } | null }
interface AuditRow {
  id: string; user_id: string; action: string; target_user_id: string | null; at: string;
  actor: { display_name?: string } | null; target: { display_name?: string } | null;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CredentialsPage() {
  const { data: ws } = useWorkspace();
  const slug = ws?.slug;
  const { data: credentials, isLoading } = useCredentials(slug);
  const { data: clients } = useClients(slug);
  const queryClient = useQueryClient();

  const [isManager, setIsManager] = useState(false);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [uploadClientId, setUploadClientId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [accessCredential, setAccessCredential] = useState<Credential | null>(null);
  const [accessTab, setAccessTab] = useState("access");
  const [grants, setGrants] = useState<Grant[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [grantPick, setGrantPick] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);

  // We derive isManager/myId from whether the list response includes access_count
  // (only managers get it) combined with the members endpoint for the current user id.
  const loadWhoAmI = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await api<{ is_manager: boolean }>(`/api/workspaces/${slug}/members`);
      setIsManager(res.is_manager);
    } catch {}
  }, [slug]);

  useEffect(() => { loadWhoAmI(); }, [loadWhoAmI]);

  const filtered = useMemo(() => {
    let rows = credentials || [];
    if (clientFilter) rows = rows.filter((c) => c.client_id === clientFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((c) => c.label.toLowerCase().includes(q));
    }
    return rows;
  }, [credentials, search, clientFilter]);

  async function submitUpload() {
    if (!slug || !file || !label.trim()) return;
    setUploadBusy(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("label", label.trim());
      if (description.trim()) fd.append("description", description.trim());
      if (uploadClientId) fd.append("client_id", uploadClientId);
      const res = await fetch(`/api/workspaces/${slug}/credentials`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("Credential uploaded");
      setUploadOpen(false);
      setLabel(""); setDescription(""); setUploadClientId(""); setFile(null);
      queryClient.invalidateQueries({ queryKey: ["credentials", slug] });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadBusy(false);
    }
  }

  async function download(c: Credential) {
    if (!slug) return;
    try {
      const res = await api<{ url: string }>(`/api/workspaces/${slug}/credentials/${c.id}/download`);
      window.open(res.url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not download");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || !slug) return;
    setDeleteBusy(true);
    try {
      await api(`/api/workspaces/${slug}/credentials/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Credential deleted");
      queryClient.invalidateQueries({ queryKey: ["credentials", slug] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setDeleteBusy(false);
      setDeleteTarget(null);
    }
  }

  const loadAccess = useCallback(async (credentialId: string) => {
    if (!slug) return;
    setAccessLoading(true);
    try {
      const [accessRes, auditRes] = await Promise.all([
        api<{ grants: Grant[]; members: MemberOption[] }>(`/api/workspaces/${slug}/credentials/${credentialId}/access`),
        api<AuditRow[]>(`/api/workspaces/${slug}/credentials/${credentialId}/audit`),
      ]);
      setGrants(accessRes.grants);
      setMembers(accessRes.members);
      setAudit(auditRes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load access");
    } finally {
      setAccessLoading(false);
    }
  }, [slug]);

  function openAccess(c: Credential) {
    setAccessCredential(c);
    setAccessTab("access");
    setGrantPick("");
    loadAccess(c.id);
  }

  async function grantAccess() {
    if (!accessCredential || !slug || !grantPick) return;
    setGrantBusy(true);
    try {
      await api(`/api/workspaces/${slug}/credentials/${accessCredential.id}/access`, { method: "POST", body: { user_id: grantPick } });
      setGrantPick("");
      await loadAccess(accessCredential.id);
      queryClient.invalidateQueries({ queryKey: ["credentials", slug] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not grant access");
    } finally {
      setGrantBusy(false);
    }
  }

  async function revokeAccess(userId: string) {
    if (!accessCredential || !slug) return;
    try {
      await api(`/api/workspaces/${slug}/credentials/${accessCredential.id}/access?user_id=${userId}`, { method: "DELETE" });
      await loadAccess(accessCredential.id);
      queryClient.invalidateQueries({ queryKey: ["credentials", slug] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke access");
    }
  }

  const grantedUserIds = new Set(grants.map((g) => g.user_id));
  const grantCandidates = members.filter((m) => !grantedUserIds.has(m.user_id));

  if (isLoading) return <Spinner label="Loading credentials..." />;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="section-header">
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex size-10 rounded-xl bg-gradient-to-br from-primary to-primary-600 shadow-sm items-center justify-center flex-shrink-0 text-white">
            <EyeIcon size={20} />
          </div>
          <div>
            <h1 className="section-title">Credentials</h1>
            <p className="section-desc">{(credentials || []).length} credential{(credentials || []).length === 1 ? "" : "s"} in this workspace</p>
          </div>
        </div>
        {isManager && (
          <Button variant="primary" size="sm" onClick={() => setUploadOpen(true)}>Upload credential</Button>
        )}
      </div>

      <div className="card border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30 p-4 mb-5 text-sm">
        Files here are stored privately and every download is logged, but they are not
        end-to-end encrypted. Anyone with administrator access to the underlying database can
        read them. Do not store credentials here that you would not give a company
        administrator.
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search credentials..."
            className="input !pl-9 rounded-lg" aria-label="Search credentials" />
        </div>
        {clients && clients.length > 0 && (
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="select w-auto" aria-label="Filter by client">
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      <div className="card overflow-hidden mb-5">
        <div className="divide-y divide-border-subtle">
          {filtered.length === 0 ? (
            <EmptyState title="No credentials" description={
              (credentials || []).length === 0
                ? (isManager ? "Upload the first credential to get started." : "No credentials have been shared with you yet.")
                : "Try a different search or filter."
            } />
          ) : filtered.map((c) => (
            <div key={c.id} className="list-item hover:bg-surface-muted flex-wrap gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">{c.label}</p>
                {c.description && <p className="text-xs text-text-tertiary truncate">{c.description}</p>}
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <Badge variant="neutral">{c.file_name.split(".").pop()?.toUpperCase() || "FILE"}</Badge>
                  <span className="text-xs text-text-tertiary">{formatSize(c.size_bytes)}</span>
                  <span className="text-xs text-text-tertiary">{c.uploader?.display_name || "Unknown"}</span>
                  <span className="text-xs text-text-tertiary">{new Date(c.created_at).toLocaleDateString()}</span>
                  {isManager && <span className="text-xs text-text-tertiary">Shared with {c.access_count ?? 0}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => download(c)} className="btn-ghost btn-sm text-text-tertiary hover:text-primary" aria-label={`Download ${c.label}`}>
                  <Download size={16} />
                </button>
                {isManager && (
                  <>
                    <button onClick={() => openAccess(c)} className="btn-ghost btn-sm text-text-tertiary hover:text-primary" aria-label={`Manage access for ${c.label}`}>
                      <Shield size={16} />
                    </button>
                    <button onClick={() => setDeleteTarget(c)} className="btn-ghost btn-sm text-text-tertiary hover:text-red-500" aria-label={`Delete ${c.label}`}>
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal
        open={uploadOpen}
        onClose={() => { if (!uploadBusy) setUploadOpen(false); }}
        title="Upload credential"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setUploadOpen(false)} disabled={uploadBusy}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={submitUpload} disabled={uploadBusy || !file || !label.trim()}>
              {uploadBusy ? <span className="flex items-center gap-2"><SpinnerIcon size={14} className="animate-spin" /> Uploading...</span> : "Upload"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Client X — hosting login" />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-secondary">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input" rows={3} placeholder="Optional notes" />
          </div>
          {clients && clients.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-secondary">Client</label>
              <select value={uploadClientId} onChange={(e) => setUploadClientId(e.target.value)} className="select w-full">
                <option value="">None</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-secondary">File</label>
            <input type="file" accept=".pdf,.docx,.doc" onChange={(e) => setFile(e.target.files?.[0] || null)} className="input" />
          </div>
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
        </div>
      </Modal>

      <Drawer
        open={!!accessCredential}
        onClose={() => setAccessCredential(null)}
        title={accessCredential ? `Access — ${accessCredential.label}` : undefined}
      >
        <Tabs
          items={[{ key: "access", label: "Who has access" }, { key: "audit", label: "Audit trail" }]}
          value={accessTab}
          onChange={setAccessTab}
          className="mb-4"
        />
        {accessLoading ? (
          <Spinner label="Loading..." />
        ) : accessTab === "access" ? (
          <div className="space-y-4">
            <div className="divide-y divide-border-subtle">
              {grants.length === 0 && <p className="text-xs text-text-tertiary py-2">No one has been granted access yet.</p>}
              {grants.map((g) => (
                <div key={g.user_id} className="flex items-center gap-3 py-2">
                  <div className="flex-1 min-w-0 text-sm font-medium text-text-primary truncate">
                    {g.profile?.display_name || g.user_id.slice(0, 8)}
                  </div>
                  <button onClick={() => revokeAccess(g.user_id)} className="btn-ghost btn-sm text-text-tertiary hover:text-red-500">Revoke</button>
                </div>
              ))}
            </div>
            {grantCandidates.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <select value={grantPick} onChange={(e) => setGrantPick(e.target.value)} className="select flex-1 min-w-[180px]" aria-label="Select member to grant access">
                  <option value="">Select a member...</option>
                  {grantCandidates.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile?.display_name || m.user_id.slice(0, 8)}</option>)}
                </select>
                <Button variant="primary" size="sm" onClick={grantAccess} disabled={grantBusy || !grantPick}>
                  {grantBusy ? <span className="flex items-center gap-2"><SpinnerIcon size={14} className="animate-spin" /> Granting...</span> : "Grant"}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {audit.length === 0 && <p className="text-xs text-text-tertiary py-2">No activity recorded yet.</p>}
            {audit.map((a) => (
              <div key={a.id} className="py-2 text-sm">
                <span className="font-medium text-text-primary">{a.actor?.display_name || a.user_id.slice(0, 8)}</span>{" "}
                <span className="text-text-secondary">{a.action}</span>
                {a.target && <span className="text-text-secondary"> → {a.target.display_name}</span>}
                <div className="text-xs text-text-tertiary">{new Date(a.at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete credential"
        message={`Delete "${deleteTarget?.label}"? This removes the file and cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
