"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { CloseIcon } from "@/components/icons";
import { IssueDetailCore } from "@/components/issue/IssueDetailCore";

interface Member { user_id: string; profile: { display_name: string } | null; }
interface State { id: string; name: string; group_name: string; color: string; }

interface Issue { id: string; name: string; priority: string; sequence_id: number; state_id: string; is_bug: boolean; target_date: string | null; created_at: string; created_by: string; creator: { display_name?: string } | null; state: State | null; }

interface IssuePanelProps {
  issueId: string;
  wsSlug: string;
  projId: string;
  members: Member[];
  states: State[];
  onClose: () => void;
  onIssueUpdated?: (issue: Issue) => void;
}

export default function IssuePanel({ issueId, wsSlug, projId, states, onClose, onIssueUpdated }: IssuePanelProps) {
  const router = useRouter();
  const [issue, setIssue] = useState<Issue | null>(null);

  // M2 fix: Escape to close + body scroll lock while panel is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50" onClick={onClose} />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Issue #${issue?.sequence_id || ""}`}
        className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-lg bg-surface-1 border-l border-border shadow-[-4px_0_20px_rgba(0,0,0,0.08)] flex flex-col animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-border-subtle flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-text-tertiary">#{issue?.sequence_id}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => router.push(`/dashboard/issues/${issueId}?ws=${wsSlug}&proj=${projId}`)}
              className="btn-ghost btn-sm text-xs">Full page &rarr;</button>
            <button onClick={onClose} className="btn-ghost btn-icon btn-sm" aria-label="Close panel"><CloseIcon size={16} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <IssueDetailCore
            issueId={issueId}
            wsSlug={wsSlug}
            projId={projId}
            states={states}
            onIssueUpdated={(updated) => {
              setIssue(updated as Issue);
              onIssueUpdated?.(updated as Issue);
            }}
            compact
          />
        </div>
      </div>
    </>
  );
}
