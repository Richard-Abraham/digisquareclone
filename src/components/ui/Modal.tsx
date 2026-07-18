"use client";
import { useEffect } from "react";
import clsx from "clsx";
import { CloseIcon } from "@/components/icons";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

export function Modal({ open, onClose, title, description, children, footer, maxWidth = "sm:max-w-md" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={clsx(
          "relative bg-surface-card rounded-t-2xl sm:rounded-2xl shadow-modal w-full animate-slide-up p-5 sm:p-6 max-h-[90vh] overflow-y-auto",
          maxWidth
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <div className="mb-4 pr-8">
            {title && <h2 className="font-bold text-lg text-text-primary">{title}</h2>}
            {description && <p className="text-sm text-text-secondary mt-1">{description}</p>}
          </div>
        )}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 btn-ghost btn-icon btn-sm text-text-tertiary hover:text-text-primary"
          aria-label="Close"
        >
          <CloseIcon size={16} />
        </button>
        {children}
        {footer && <div className="flex justify-end gap-2 mt-6">{footer}</div>}
      </div>
    </div>
  );
}
