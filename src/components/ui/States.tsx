import { SpinnerIcon } from "@/components/icons";
import clsx from "clsx";

interface SpinnerProps {
  label?: string;
  className?: string;
}

export function Spinner({ label, className }: SpinnerProps) {
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-3 py-16", className)}>
      <SpinnerIcon size={24} className="animate-spin text-primary" />
      {label && <p className="text-sm text-text-secondary">{label}</p>}
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={clsx("empty-state", className)}>
      {icon && <div className="empty-state-icon">{icon}</div>}
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ message = "Something went wrong", onRetry, className }: ErrorStateProps) {
  return (
    <div className={clsx("empty-state", className)}>
      <div className="empty-state-icon text-red-500">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <p className="empty-state-title">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary btn-sm mt-3">Try again</button>
      )}
    </div>
  );
}
