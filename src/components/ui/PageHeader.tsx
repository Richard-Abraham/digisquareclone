"use client";
import clsx from "clsx";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, icon, className }: PageHeaderProps) {
  return (
    <div className={clsx("flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6", className)}>
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="hidden sm:flex size-10 rounded-xl bg-gradient-to-br from-primary to-primary-600 shadow-sm items-center justify-center flex-shrink-0 text-white">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-text-primary font-display tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-sm text-text-tertiary mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}
