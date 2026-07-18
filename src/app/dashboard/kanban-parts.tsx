"use client";
import { useDroppable } from "@dnd-kit/core";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BugIcon, GripIcon } from "@/components/icons";
import { Calendar, Plus, SquareDashed } from "lucide-react";
import clsx from "clsx";

export interface Issue {
  id: string; name: string; priority: string; sequence_id: number; is_bug?: boolean;
  subtask_total?: number; subtask_done?: number; sort_order?: number;
  state: { id: string; name: string; group_name: string; color: string } | null;
  assignee: { display_name: string } | null;
  assignees: { user_id?: string; display_name?: string }[];
  created_at: string; target_date: string | null;
  creator?: { display_name?: string } | null;
}
export interface State { id: string; name: string; group_name: string; color: string; }

export const GROUPS = ["backlog", "unstarted", "started", "completed", "cancelled"] as const;
export type Group = (typeof GROUPS)[number];

export const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
export const PRIO_META: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: "Urgent", color: "#DC2626", bg: "#FEF2F2" },
  high: { label: "High", color: "#D97706", bg: "#FFFBEB" },
  medium: { label: "Medium", color: "#6366F1", bg: "#EEF2FF" },
  low: { label: "Low", color: "#64748B", bg: "#F1F5F9" },
  none: { label: "None", color: "#CBD5E1", bg: "#F8FAFC" },
};

function formatDue(dateStr: string): { label: string; overdue: boolean } {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = d < today;
  return { label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), overdue };
}

function CardBody({ issue }: { issue: Issue }) {
  const prio = PRIO_META[issue.priority] || PRIO_META.none;
  const due = issue.target_date ? formatDue(issue.target_date) : null;
  const subPct = issue.subtask_total ? Math.round(((issue.subtask_done || 0) / issue.subtask_total) * 100) : 0;
  const subColor = subPct >= 70 ? "#10B981" : subPct >= 30 ? "#F59E0B" : "#EF4444";
  return (
    <>
      {/* Top row: identifier + badges */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] font-mono font-medium text-text-tertiary">#{issue.sequence_id}</span>
        {issue.is_bug && (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide text-red-500 bg-red-50 dark:bg-red-500/10 px-1.5 py-px rounded">
            <BugIcon size={10} /> Bug
          </span>
        )}
        {issue.priority !== "none" && (
          <span className="ml-auto inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded"
            style={{ backgroundColor: `${prio.color}1A`, color: prio.color }}>
            <span className="size-1.5 rounded-full" style={{ backgroundColor: prio.color }} />
            {prio.label}
          </span>
        )}
      </div>

      {/* Title */}
      <p className="text-[13px] font-medium text-text-primary line-clamp-2 leading-snug mb-2">
        {issue.name}
      </p>

      {/* Subtask progress */}
      {!!issue.subtask_total && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-text-tertiary font-medium">Subtasks</span>
            <span className="text-[10px] text-text-tertiary font-semibold">{issue.subtask_done}/{issue.subtask_total}</span>
          </div>
          <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${subPct}%`, backgroundColor: subColor }} />
          </div>
        </div>
      )}

      {/* Footer: due date + avatars */}
      <div className="flex items-center justify-between min-h-[20px]">
        {due ? (
          <span className={clsx(
            "inline-flex items-center gap-1 text-[10px] font-medium",
            due.overdue ? "text-red-500" : "text-text-tertiary"
          )}>
            {due.overdue && <span className="size-1.5 rounded-full bg-red-500 animate-pulse-soft" />}
            <Calendar size={11} />
            {due.label}{due.overdue ? " · overdue" : ""}
          </span>
        ) : <span />}
        {issue.assignees?.length > 0 && (
          <div className="avatar-group">
            {issue.assignees.slice(0, 3).map((a, i) => (
              <div key={i} className="avatar size-5 text-[8px] bg-gradient-to-br from-primary-400 to-primary-600 text-white font-bold ring-2 ring-surface-card"
                title={a.display_name || ""}>
                {a.display_name?.[0]?.toUpperCase() || "?"}
              </div>
            ))}
            {issue.assignees.length > 3 && (
              <div className="avatar size-5 text-[8px] bg-surface-2 text-text-tertiary font-medium ring-2 ring-surface-card">
                +{issue.assignees.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

interface KanbanCardProps {
  issue: Issue;
  stateColor?: string;
  onOpen: (id: string) => void;
}

export function KanbanCard({ issue, stateColor, onOpen }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id });
  const prio = PRIO_META[issue.priority] || PRIO_META.none;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderLeftColor: stateColor || "#E2E8F0",
    touchAction: "none",
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(issue.id)}
      className={clsx(
        "bg-surface-card rounded-xl border border-border px-3 py-2.5 cursor-grab active:cursor-grabbing transition-all duration-200",
        "hover:shadow-card hover:border-border-accent hover:-translate-y-0.5 border-l-[3px] group relative",
        isDragging && "opacity-40 ring-2 ring-primary-300 scale-[1.02]"
      )}
    >
      {issue.priority !== "none" && issue.priority !== "low" && (
        <span className="absolute top-0 right-0 w-1.5 h-full rounded-r" style={{ backgroundColor: prio.color }} />
      )}
      <span className="absolute bottom-2.5 right-2.5 text-text-tertiary/0 group-hover:text-text-tertiary/60 transition-colors">
        <GripIcon size={12} />
      </span>
      <CardBody issue={issue} />
    </div>
  );
}

export function DragPreviewCard({ issue, stateColor }: { issue: Issue; stateColor?: string }) {
  return (
    <div className="bg-surface-card rounded-xl border border-border px-3 py-2.5 border-l-[3px] shadow-modal rotate-2 cursor-grabbing w-[264px]" style={{ borderLeftColor: stateColor || "#E2E8F0" }}>
      <CardBody issue={issue} />
    </div>
  );
}

interface KanbanColumnProps {
  group: Group;
  items: Issue[];
  stateInfo?: State;
  droppable: boolean;
  activeId: string | null;
  onOpen: (id: string) => void;
}

const GROUP_LABELS: Record<Group, string> = {
  backlog: "Backlog", unstarted: "To Do", started: "In Progress", completed: "Done", cancelled: "Cancelled",
};

export function KanbanColumn({ group, items, stateInfo, droppable, activeId, onOpen }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: group, disabled: !droppable });
  const showDropHere = activeId !== null && items.length === 0;
  const count = items.length;
  const countColor = count > 10 ? "#EF4444" : count > 5 ? "#F59E0B" : "#6366F1";
  const headerGradient = stateInfo?.color
    ? `linear-gradient(135deg, ${stateInfo.color}10, transparent)`
    : undefined;

  return (
    <div
      className={clsx(
        "w-[280px] min-w-[280px] snap-start flex flex-col rounded-2xl transition-all duration-200 max-h-full shadow-sm",
        "bg-surface-2/40 border backdrop-blur-sm",
        isOver && droppable ? "border-primary-300 ring-2 ring-primary-200/60 bg-primary-50/40 dark:bg-primary-500/5" : "border-border-subtle"
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2.5 flex-shrink-0 border-b border-border-subtle/80" style={{ background: headerGradient }}>
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full ring-[3px]" style={{
            backgroundColor: stateInfo?.color || "#94A3B8",
            ['--tw-ring-color' as any]: `${stateInfo?.color || "#94A3B8"}25`,
          }} />
          <span className="text-xs font-bold text-text-primary tracking-wide">{stateInfo?.name || GROUP_LABELS[group]}</span>
        </div>
        <span className="text-[11px] font-bold min-w-[22px] h-[20px] px-1.5 rounded-lg flex items-center justify-center shadow-sm border"
          style={{ backgroundColor: `${countColor}10`, borderColor: `${countColor}30`, color: countColor }}>
          {count}
        </span>
      </div>

      {/* Cards */}
      <div ref={setNodeRef} className="flex-1 overflow-y-auto px-2.5 pb-2.5 space-y-2 min-h-[80px]">
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((issue) => (
            <KanbanCard key={issue.id} issue={issue} stateColor={stateInfo?.color} onOpen={onOpen} />
          ))}
        </SortableContext>
        {items.length === 0 && (
          <div
            className={clsx(
              "text-xs text-center py-8 rounded-xl border-2 border-dashed transition-colors flex flex-col items-center gap-1.5",
              isOver && droppable ? "border-primary-300 bg-primary-50/50 text-primary dark:bg-primary-500/10" : showDropHere ? "border-border-accent text-text-tertiary" : "border-border/70 text-text-tertiary"
            )}
          >
            {isOver && droppable ? (
              <Plus size={16} />
            ) : (
              <SquareDashed size={14} strokeWidth={1.5} className="opacity-40" />
            )}
            <span>{isOver && droppable ? "Drop here" : "No tasks"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
