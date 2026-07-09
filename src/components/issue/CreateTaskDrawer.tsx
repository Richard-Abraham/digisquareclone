"use client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Drawer } from "@/components/ui/Drawer";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SpinnerIcon } from "@/components/icons";
import { PRIORITIES, PRIO_META, type Issue } from "@/app/dashboard/kanban-parts";

interface Member {
  user_id: string;
  profile: { display_name: string } | null;
}

interface CreateTaskDrawerProps {
  open: boolean;
  onClose: () => void;
  wsSlug: string;
  projId: string;
  members: Member[];
  onCreated?: (issue: Issue) => void;
}

interface CreateTaskInput {
  name: string;
  priority: string;
  assignee_ids: string[];
  is_bug: boolean;
}

export function CreateTaskDrawer({ open, onClose, wsSlug, projId, members, onCreated }: CreateTaskDrawerProps) {
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("none");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [isBug, setIsBug] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  // Reset form whenever the drawer opens so stale data from a previous create
  // does not leak into a fresh task.
  useEffect(() => {
    if (open) {
      setName("");
      setPriority("none");
      setAssigneeIds([]);
      setIsBug(false);
      setTouched(false);
    }
  }, [open]);

  const nameError = useMemo(() => {
    if (!touched) return "";
    const trimmed = name.trim();
    if (!trimmed) return "Task name is required.";
    if (trimmed.length < 2) return "Task name must be at least 2 characters.";
    return "";
  }, [name, touched]);

  const canSubmit = name.trim().length >= 2 && !submitting;

  function toggleAssignee(uid: string) {
    setAssigneeIds((cur) =>
      cur.includes(uid) ? cur.filter((id) => id !== uid) : [...cur, uid]
    );
  }

  async function handleSubmit() {
    setTouched(true);
    if (!canSubmit) return;

    setSubmitting(true);
    const body: CreateTaskInput = {
      name: name.trim(),
      priority,
      assignee_ids: assigneeIds,
      is_bug: isBug,
    };

    try {
      const issue = await api<Issue>(
        `/api/workspaces/${wsSlug}/projects/${projId}/issues`,
        { method: "POST", body }
      );
      toast.success("Task created");
      onCreated?.(issue);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Create Task"
      description="Add a new task to the current project."
      initialWidth={560}
      maxWidth={720}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? (
              <span className="flex items-center gap-2">
                <SpinnerIcon size={14} className="animate-spin" /> Creating...
              </span>
            ) : (
              "Create task"
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Input
          label="Task name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="e.g. Fix login redirect"
          autoFocus
          error={nameError}
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="select"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIO_META[p].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Type
            </label>
            <label className="flex items-center gap-2.5 h-[40px] text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={isBug}
                onChange={(e) => setIsBug(e.target.checked)}
                className="size-4 rounded border-border text-primary focus:ring-primary-200"
              />
              Mark as bug
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
            Assignees
          </label>
          <div className="flex flex-wrap gap-2">
            {members.length === 0 && (
              <p className="text-xs text-text-tertiary font-light">No members yet.</p>
            )}
            {members.map((m) => {
              const on = assigneeIds.includes(m.user_id);
              return (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => toggleAssignee(m.user_id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all duration-150 ${
                    on
                      ? "bg-primary-50 border-primary-300 text-primary font-medium dark:bg-primary-500/15 dark:border-primary-500/40"
                      : "border-border text-text-secondary hover:bg-surface-2 hover:border-border-accent"
                  }`}
                >
                  {m.profile?.display_name || m.user_id.slice(0, 6)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
