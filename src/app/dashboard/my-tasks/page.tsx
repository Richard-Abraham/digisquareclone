"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { BugIcon } from "@/components/icons";

interface Task {
  id: string; name: string; priority: string; sequence_id: number; is_bug: boolean;
  state: { name: string; group_name: string; color: string } | null;
  project: { id: string; name: string } | null;
  assignees: { display_name?: string; user_id?: string }[];
  subtask_total: number; subtask_done: number; role: string;
}

const VIEWS = [
  { key: "all", label: "Active" },
  { key: "review", label: "Awaiting review" },
  { key: "bugs", label: "Bugs" },
  { key: "done", label: "Done" },
];
const PRIO_COLORS: Record<string, string> = { urgent: "#dc2626", high: "#f59e0b", medium: "#3f76ff", low: "#9ca3af", none: "#d1d5db" };

export default function MyTasksPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [view, setView] = useState("all");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("token")) { router.push("/login"); return; }
    api<any[]>("/api/workspaces").then((ws) => {
      if (!ws.length) { setLoading(false); return; }
      setSlug(ws[0].slug);
    }).catch(() => router.push("/login"));
  }, [router]);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const res = await api<{ issues: Task[] }>(`/api/workspaces/${slug}/my-tasks?view=${view}`);
      setTasks(res.issues);
    } finally { setLoading(false); }
  }, [slug, view]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#1a1d23]">My Tasks</h1>
        <p className="text-sm text-[#5e6574]">Tasks where you&apos;re an assignee or reviewer</p>
      </div>

      <div className="flex gap-1 mb-4 border-b border-[#eef0f6]">
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => setView(v.key)}
            className={`px-3 py-2 text-sm -mb-px border-b-2 transition-colors ${view === v.key ? "border-[#3f76ff] text-[#3f76ff] font-medium" : "border-transparent text-[#5e6574] hover:text-[#1a1d23]"}`}>
            {v.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#9ca3af] text-sm">Loading...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-[#9ca3af] text-sm">Nothing here.</div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <Link key={t.id} href={`/dashboard/issues/${t.id}?ws=${slug}&proj=${t.project?.id ?? ""}`}
              className="flex items-center gap-3 rounded-lg bg-white border border-[#eef0f6] px-4 py-3 hover:border-[#3f76ff]/30 transition-colors">
              <span className="text-[10px] text-[#9ca3af] w-10">#{t.sequence_id}</span>
              {t.is_bug && <BugIcon size={12} />}
              <span className="flex-1 text-sm font-medium text-[#1a1d23] truncate">{t.name}</span>
              {t.subtask_total > 0 && <span className="text-[10px] text-[#9ca3af]">{t.subtask_done}/{t.subtask_total}</span>}
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: PRIO_COLORS[t.priority] + "20", color: PRIO_COLORS[t.priority] }}>{t.priority}</span>
              {t.state && <span className="text-[10px] font-medium" style={{ color: t.state.color }}>{t.state.name}</span>}
              <span className="text-[10px] text-[#9ca3af] w-16 text-right truncate">{t.project?.name}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${t.role === "reviewer" ? "bg-[#fef3c7] text-[#92400e]" : "bg-[#eef3ff] text-[#3f76ff]"}`}>{t.role}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
