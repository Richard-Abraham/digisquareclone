"use client";
import { cn } from "@/lib/cn";

export interface TabItem {
  key: string;
  label: string;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ items, value, onChange, className }: TabsProps) {
  return (
    <div role="tablist" className={cn("inline-flex gap-1 rounded-lg bg-surface-2 p-1", className)}>
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-all",
              active ? "bg-surface-1 shadow-sm text-text-primary" : "text-text-secondary hover:text-text-primary"
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
