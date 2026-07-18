"use client";
import {
  Area,
  AreaChart as RechartsArea,
  Bar,
  BarChart as RechartsBar,
  CartesianGrid,
  Cell,
  Line,
  LineChart as RechartsLine,
  Pie,
  PieChart as RechartsPie,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronUp } from "lucide-react";

export const chartColors = {
  primary: "#6366F1",
  emerald: "#10B981",
  amber: "#F59E0B",
  red: "#EF4444",
  slate: "#94A3B8",
  backlog: "#94A3B8",
  unstarted: "#6366F1",
  started: "#F59E0B",
  completed: "#10B981",
  cancelled: "#EF4444",
};

export const STATE_COLORS: Record<string, string> = {
  backlog: chartColors.backlog,
  unstarted: chartColors.unstarted,
  started: chartColors.started,
  completed: chartColors.completed,
  cancelled: chartColors.cancelled,
};

export const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid var(--tooltip-border, #E2E8F0)",
  fontSize: 12,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  background: "var(--tooltip-bg, rgba(255,255,255,0.96))",
  color: "var(--tooltip-text, #15 23 42)",
};

export const axisTick = { fontSize: 11, fill: "#94A3B8" };

if (typeof document !== "undefined") {
  const updateChartTheme = () => {
    const isDark = document.documentElement.classList.contains("dark");
    document.documentElement.style.setProperty("--tooltip-bg", isDark ? "rgba(23,32,51,0.96)" : "rgba(255,255,255,0.96)");
    document.documentElement.style.setProperty("--tooltip-border", isDark ? "#1E293B" : "#E2E8F0");
    document.documentElement.style.setProperty("--tooltip-text", isDark ? "#F1F5F9" : "#0F172A");
  };
  updateChartTheme();
  const observer = new MutationObserver(updateChartTheme);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
}

export function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card p-5 ${className}`}>
      <h3 className="mb-4 text-sm font-bold text-text-primary">{title}</h3>
      {children}
    </div>
  );
}

export function AreaChart({ data, xKey, yKey, color = chartColors.primary, gradientId = "areaFill", height = 260 }: { data: any[]; xKey: string; yKey: string; color?: string; gradientId?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsArea data={data} margin={{ left: -20, right: 8, top: 8 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey={xKey} tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey={yKey} stroke={color} strokeWidth={2.5} fill={`url(#${gradientId})`} />
      </RechartsArea>
    </ResponsiveContainer>
  );
}

export function LineChart({ data, lines, height = 250 }: { data: any[]; lines: { dataKey: string; color: string; name: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLine data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
        <XAxis dataKey="month" tick={axisTick} />
        <YAxis tick={axisTick} />
        <Tooltip contentStyle={tooltipStyle} />
        {lines.map((l) => (
          <Line key={l.dataKey} type="monotone" dataKey={l.dataKey} stroke={l.color} strokeWidth={2.5} dot={{ r: 3 }} name={l.name} />
        ))}
      </RechartsLine>
    </ResponsiveContainer>
  );
}

export function BarChart({ data, xKey, yKey, color = chartColors.primary, height = 200, barSize = 42 }: { data: any[]; xKey: string; yKey: string; color?: string; height?: number; barSize?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBar data={data} margin={{ left: -20, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey={xKey} tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#F1F5F9" }} />
        <Bar dataKey={yKey} fill={color} radius={[6, 6, 0, 0]} maxBarSize={barSize} />
      </RechartsBar>
    </ResponsiveContainer>
  );
}

export function ColoredBarChart({ data, xKey, yKey, colorMap, height = 200, barSize = 42 }: { data: any[]; xKey: string; yKey: string; colorMap: Record<string, string>; height?: number; barSize?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBar data={data} margin={{ left: -20, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey={xKey} tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#F1F5F9" }} />
        <Bar dataKey={yKey} radius={[6, 6, 0, 0]} maxBarSize={barSize}>
          {data.map((entry, i) => (
            <Cell key={i} fill={colorMap[entry[xKey]] || chartColors.primary} />
          ))}
        </Bar>
      </RechartsBar>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, dataKey, nameKey, colors, height = 260, innerRadius = 55, outerRadius = 90 }: { data: any[]; dataKey: string; nameKey: string; colors: string[]; height?: number; innerRadius?: number; outerRadius?: number }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsPie>
          <Pie data={data} dataKey={dataKey} nameKey={nameKey} innerRadius={innerRadius} outerRadius={outerRadius} paddingAngle={3}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </RechartsPie>
      </ResponsiveContainer>
      <div className="mt-2 flex justify-center gap-4 text-xs">
        {data.map((d, i) => (
          <span key={d[nameKey]} className="flex items-center gap-1.5 text-text-secondary">
            <span className="size-2.5 rounded-full" style={{ background: colors[i % colors.length] }} />
            {d[nameKey]} ({d[dataKey]})
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatCard({ label, value, sub, icon, color, trend, onClick }: { label: string; value: string | number; sub?: string; icon?: React.ReactNode; color?: string; trend?: { value: number; label?: string }; onClick?: () => void }) {
  return (
    <div
      className={`card p-5 ${onClick ? "cursor-pointer hover:shadow-elevated hover:border-border-accent transition-all" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        {icon && (
          <span className="grid size-9 place-items-center rounded-lg bg-primary-50 text-primary transition-transform duration-200" style={color ? { background: `${color}15`, color } : undefined}>
            {icon}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2 mt-3">
        <p className="text-3xl font-bold text-text-primary font-display tracking-tight">{typeof value === "number" ? value.toLocaleString() : value}</p>
        {trend && (
          <span className={`text-xs font-bold flex items-center gap-0.5 ${trend.value >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            <ChevronUp size={10} strokeWidth={3} style={{ transform: trend.value >= 0 ? "none" : "rotate(180deg)" }} />
            {Math.abs(trend.value)}%
          </span>
        )}
      </div>
      {sub && <p className="mt-0.5 text-xs text-text-tertiary">{sub}</p>}
    </div>
  );
}
