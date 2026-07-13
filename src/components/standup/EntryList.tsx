"use client";
import { parseEntries } from "@/lib/standup";
import { CheckIcon } from "@/components/icons";

interface Props {
  reportField: string | null | undefined;
  /** Legacy plan text — used when reportField is in the old format. */
  planField?: string | null;
  submittedAt?: string | null;
  /** Optional cap for previews. */
  compact?: boolean;
  bounded?: boolean;
}

/**
 * Read-only renderer for a user's submitted standup entries. Each entry is
 * shown as `Plan` + `Report` so the pairing is unambiguous.
 */
export function EntryList({ reportField, planField, submittedAt, compact, bounded }: Props) {
  const entries = parseEntries(reportField, planField, submittedAt);
  if (!entries.length) return null;

  return (
    <div className={`space-y-2 ${bounded ? "max-h-72 overflow-auto pr-1" : ""}`}>
      {entries.map((e, i) => (
        <div key={e.id} className={`rounded-lg border border-border bg-surface-1 ${compact ? "p-2.5" : "p-3"}`}>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className={`font-semibold text-text-primary ${compact ? "text-[11px]" : "text-xs"}`}>Entry</span>
            {e.submitted_at ? (
              <span className="badge badge-success text-[10px]" title={new Date(e.submitted_at).toLocaleString()}>
                <CheckIcon size={10} /> Submitted {new Date(e.submitted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : (
              <span className="badge badge-warning text-[10px]">Draft</span>
            )}
          </div>
          <div className="space-y-1.5">
            <div>
              <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mr-1">Plan:</span>
              <span className={`${compact ? "text-xs" : "text-sm"} text-text-primary whitespace-pre-line`}>{e.plan || "—"}</span>
            </div>
            <div>
              <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mr-1">Report:</span>
              <span className={`${compact ? "text-xs" : "text-sm"} text-text-secondary whitespace-pre-line`}>{e.report || <em className="text-text-tertiary">(no report yet)</em>}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
