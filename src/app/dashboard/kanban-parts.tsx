"use client";
import { useDroppable } from "@dnd-kit/core";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BugIcon, GripIcon } from "@/components/icons";
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

function CardBody({ issue }: { issue: Issue }) {
  const prio = PRIO_META[issue.priority] || PRIO_META.none;
  return (
    <>
      <p className="text-sm font-semibold text-text-primary mb-2.5 line-clamp-2 leading-snug">
        {issue.is_bug && <BugIcon className="inline mr-1 -mt-0.5 text-red-500" />}
        {issue.name}
      </p>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: prio.bg, color: prio.color }}>
          {prio.label}
        </span>
        <div className="flex items-center gap-2">
          {!!issue.subtask_total && (
            <span className="text-[10px] text-text-tertiary font-medium">{issue.subtask_done}/{issue.subtask_total}</span>
          )}
          {issue.assignees?.length > 0 && (
            <div className="avatar-group">
              {issue.assignees.slice(0, 2).map((a, i) => (
                <div key={i} className="avatar size-5 text-[8px] bg-primary-100 text-primary-700 font-bold ring-2 ring-surface-card">
                  {a.display_name?.[0]?.toUpperCase() || "?"}
                </div>
              ))}
              {issue.assignees.length > 2 && (
                <div className="avatar size-5 text-[8px] bg-surface-2 text-text-tertiary font-medium ring-2 ring-surface-card">
                  +{issue.assignees.length - 2}
                </div>
              )}
            </div>
          )}
        </div>
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
        "card px-3 py-2.5 cursor-grab active:cursor-grabbing transition-all duration-150 hover:shadow-elevated hover:-translate-y-0.5 border-l-[3px] group relative border-b border-border-subtle last:border-b-0",
        isDragging && "opacity-40 ring-2 ring-primary-300 scale-[1.02]"
      )}
    >
      <span className="absolute top-2.5 right-2.5 text-text-tertiary/0 group-hover:text-text-tertiary transition-colors">
        <GripIcon size={12} />
      </span>
      <CardBody issue={issue} />
    </div>
  );
}

export function DragPreviewCard({ issue, stateColor }: { issue: Issue; stateColor?: string }) {
  return (
    <div className="card p-3 border-l-[3px] shadow-elevated rotate-2 cursor-grabbing" style={{ borderLeftColor: stateColor || "#E2E8F0" }}>
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

export function KanbanColumn({ group, items, stateInfo, droppable, activeId, onOpen }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: group, disabled: !droppable });
  const showDropHere = activeId !== null && items.length === 0;
  return (
    <div
      className={clsx(
        "min-w-[260px] snap-start rounded-xl p-3.5 transition-all duration-200",
        isOver && droppable ? "bg-primary-50 ring-2 ring-primary-300 dark:bg-primary-500/10" : "bg-surface-2"
      )}
    >
      <div className="flex items-center justify-between mb-3.5 px-1">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ backgroundColor: stateInfo?.color }} />
          <span className="text-xs font-semibold text-text-secondary">{stateInfo?.name || group}</span>
        </div>
        <span className="text-xs font-medium text-text-tertiary px-1.5 py-0.5 rounded-full bg-surface-card/50">{items.length}</span>
      </div>
      <div ref={setNodeRef} className="space-y-3 min-h-[60px]">
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((issue) => (
            <KanbanCard key={issue.id} issue={issue} stateColor={stateInfo?.color} onOpen={onOpen} />
          ))}
        </SortableContext>
        {items.length === 0 && (
          <div
            className={clsx(
              "text-xs text-center py-7 rounded-lg border-2 border-dashed transition-colors",
              isOver && droppable ? "border-primary-300 bg-primary-50/50 text-primary dark:bg-primary-500/10" : showDropHere ? "border-border-accent text-text-tertiary" : "border-border text-text-tertiary"
            )}
          >
            {isOver && droppable ? "Drop here" : "No tasks"}
          </div>
        )}
      </div>
    </div>
  );
}
