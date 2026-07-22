"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/hooks";
import { useAuth } from "@/lib/providers";
import { SpinnerIcon, CalendarIcon } from "@/components/icons";
import { Spinner, EmptyState } from "@/components/ui/States";
import { EntryList } from "@/components/standup/EntryList";
import { ClipboardList, Search, Users, CalendarDays, Filter, X } from "lucide-react";

interface Profile { display_name?: string }
interface StandupItem {
  id: string;
  date: string;
  plan: string | null;
  report: string | null;
  submitted_at: string | null;
  user_id: string;
  profile: Profile | null;
}
interface MemberOption { user_id: string; display_name: string }

export default function AllStandupsPage() {
  const { user, ready } = useAuth();
  const { data: ws } = useWorkspace();
  const router = useRouter();

  const [items, setItems] = useState<StandupItem[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  // Filters
  const [filterUser, setFilterUser] = useState("");
  const [filterDate, setFilterDate] = useState("");

  const slug = ws?.slug;
  const isOwner = ws && user ? ws.owner_id === user.id : false;

  const loadData = useCallback(async (append = false, cursorVal?: string | null) => {
    if (!slug) return;
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterUser) params.set("userId", filterUser);
      if (filterDate) params.set("date", filterDate);
      if (append && cursorVal) params.set("cursor", cursorVal);
      const qs = params.toString();
      const res = await api<{ items: StandupItem[]; next_cursor: string | null; members: MemberOption[] }>(
        `/api/workspaces/${slug}/standup/all${qs ? `?${qs}` : ""}`
      );
      if (append) {
        setItems(prev => [...prev, ...res.items]);
      } else {
        setItems(res.items);
        setMembers(res.members || []);
      }
      setCursor(res.next_cursor);
      setDenied(false);
    } catch (e: any) {
      if (e?.status === 403 || e?.message?.includes("403")) {
        setDenied(true);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [slug, filterUser, filterDate]);

  useEffect(() => {
    if (!ready) return;
    if (!user) { router.push("/login"); return; }
    if (slug) loadData();
  }, [ready, user, slug, filterUser, filterDate]);

  if (!ready || !user) return null;

  if (denied) {
    return (
      <div className="p-6 sm:p-8">
        <EmptyState
          icon={<ClipboardList size={28} strokeWidth={1.5} />}
          title="Owner access required"
          description="Only the workspace owner can view all standups."
        />
      </div>
    );
  }

  const hasFilters = !!filterUser || !!filterDate;

  // Group items by date
  const grouped = items.reduce<Record<string, StandupItem[]>>((acc, item) => {
    const key = item.date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  const dateKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-primary-600 shadow-sm flex items-center justify-center text-white flex-shrink-0">
            <ClipboardList size={20} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-primary font-display tracking-tight">All Standups</h1>
            <p className="text-xs text-text-tertiary">View every team member&apos;s standup reports</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-text-tertiary" />
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Filters</span>
          {hasFilters && (
            <button
              onClick={() => { setFilterUser(""); setFilterDate(""); }}
              className="ml-auto text-[11px] text-text-tertiary hover:text-red-500 transition-colors flex items-center gap-1 px-2 py-0.5 rounded-lg hover:bg-red-50"
            >
              <X size={12} /> Clear all
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-text-tertiary flex-shrink-0" />
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="select text-sm !w-auto min-w-[180px] !py-1.5 rounded-lg"
              aria-label="Filter by member"
            >
              <option value="">All members</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.display_name || m.user_id.slice(0, 8)}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays size={14} className="text-text-tertiary flex-shrink-0" />
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="input-sm !w-auto rounded-lg"
              aria-label="Filter by date"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <Spinner label="Loading standups..." />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={28} strokeWidth={1.5} />}
          title={hasFilters ? "No standups match your filters" : "No standups yet"}
          description={hasFilters ? "Try adjusting or clearing your filters." : "Standups will appear here once team members submit them."}
        />
      ) : (
        <div className="space-y-6">
          {dateKeys.map((dateKey) => {
            const dayItems = grouped[dateKey];
            const dateLabel = new Date(dateKey + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "long", month: "long", day: "numeric", year: "numeric",
            });
            return (
              <div key={dateKey}>
                {/* Date header */}
                <div className="flex items-center gap-2 mb-3">
                  <CalendarDays size={14} className="text-primary" />
                  <h2 className="text-sm font-bold text-text-primary">{dateLabel}</h2>
                  <span className="text-[10px] text-text-tertiary font-medium bg-surface-2 px-2 py-0.5 rounded-full">
                    {dayItems.length} standup{dayItems.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Standup cards for this date */}
                <div className="space-y-3">
                  {dayItems.map((item) => (
                    <div key={item.id} className="card p-4 hover:border-border-accent transition-colors">
                      <div className="flex items-center justify-between mb-3 gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="size-8 rounded-full bg-gradient-to-br from-primary-300 to-primary-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 ring-2 ring-surface-card shadow-sm">
                            {item.profile?.display_name?.[0]?.toUpperCase() || "U"}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-text-primary">
                              {item.profile?.display_name || item.user_id.slice(0, 8)}
                            </p>
                            <p className="text-[10px] text-text-tertiary">{dateKey}</p>
                          </div>
                        </div>
                        {item.submitted_at ? (
                          <span className="badge badge-success text-[10px] shadow-sm">
                            Submitted {new Date(item.submitted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        ) : (
                          <span className="badge badge-warning text-[10px]">In progress</span>
                        )}
                      </div>
                      <EntryList reportField={item.report} planField={item.plan} submittedAt={item.submitted_at} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Load more */}
          {cursor && (
            <button
              onClick={() => loadData(true, cursor)}
              disabled={loadingMore}
              className="btn-secondary btn-md w-full rounded-xl"
            >
              {loadingMore ? (
                <span className="flex items-center justify-center gap-2">
                  <SpinnerIcon size={14} className="animate-spin" /> Loading...
                </span>
              ) : (
                "Load more"
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
