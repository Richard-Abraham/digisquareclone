export type Priority = "urgent" | "high" | "medium" | "low" | "none";

export const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low", "none"];

export interface PriorityMeta {
  label: string;
  color: string;
  bg: string;
  ring: string;
}

export const PRIO_META: Record<Priority, PriorityMeta> = {
  urgent: { label: "Urgent", color: "text-red-600", bg: "bg-red-50", ring: "ring-red-200" },
  high: { label: "High", color: "text-orange-600", bg: "bg-orange-50", ring: "ring-orange-200" },
  medium: { label: "Medium", color: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-200" },
  low: { label: "Low", color: "text-blue-600", bg: "bg-blue-50", ring: "ring-blue-200" },
  none: { label: "No priority", color: "text-slate-500", bg: "bg-slate-50", ring: "ring-slate-200" },
};

export interface User {
  id: string;
  email: string;
}

export interface Profile {
  display_name: string;
  avatar?: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface Project {
  id: string;
  name: string;
  identifier: string;
  description?: string;
  workspace_id: string;
  created_at: string;
}

export interface State {
  id: string;
  name: string;
  group_name: string;
  color: string;
  sequence: number;
}

export interface Member {
  user_id: string;
  email: string;
  display_name?: string;
  avatar?: string | null;
  role: string;
}

export interface Tag {
  id: string;
  name: string;
  kind?: string;
  color?: string;
}

export interface Issue {
  id: string;
  name: string;
  description_html?: string;
  priority: Priority;
  sequence_id: number;
  state_id: string;
  project_id: string;
  workspace_id: string;
  assignee_id?: string | null;
  is_bug: boolean;
  start_date?: string | null;
  target_date?: string | null;
  created_at: string;
  created_by: string;
  state?: State | null;
  assignees?: Member[];
  reviewers?: Member[];
  tags?: Tag[];
}

export interface ActivityEvent {
  id: string;
  kind: string;
  created_at: string;
  actor_id: string;
  actor?: Member | null;
  metadata?: Record<string, unknown>;
}

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body?: string;
  read: boolean;
  created_at: string;
  link?: string;
}
