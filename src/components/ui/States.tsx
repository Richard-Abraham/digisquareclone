import { SpinnerIcon } from "@/components/icons";
import { AlertCircle } from "lucide-react";
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
        <AlertCircle size={24} strokeWidth={1.5} />
      </div>
      <p className="empty-state-title">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary btn-sm mt-3">Try again</button>
      )}
    </div>
  );
}
