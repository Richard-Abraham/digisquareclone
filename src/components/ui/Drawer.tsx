"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import clsx from "clsx";
import { CloseIcon, SpinnerIcon } from "@/components/icons";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  loading?: boolean;
}

const MAXIMIZE_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);

const RESTORE_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
  </svg>
);

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  initialWidth = 480,
  minWidth = 380,
  maxWidth = 900,
  loading = false,
}: DrawerProps) {
  const [width, setWidth] = useState(initialWidth);
  const [maximized, setMaximized] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset width when re-opened
  useEffect(() => {
    if (open) {
      setWidth(initialWidth);
      setMaximized(false);
    }
  }, [open, initialWidth]);

  // Escape to close + body scroll lock
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

  // Drag-to-resize from the left edge
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (maximized) return;
    e.preventDefault();
    setDragging(true);
    dragRef.current = { startX: e.clientX, startWidth: width };
  }, [maximized, width]);

  useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - e.clientX;
      const next = Math.max(minWidth, Math.min(maxWidth, dragRef.current.startWidth + delta));
      setWidth(next);
    };
    const onMouseUp = () => {
      setDragging(false);
      dragRef.current = null;
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, minWidth, maxWidth]);

  if (!open) return null;

  const effectiveWidth = maximized ? "100%" : `${width}px`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={clsx(
          "relative h-full bg-surface-1 border-l border-border shadow-[-8px_0_30px_rgba(0,0,0,0.12)] flex flex-col",
          "animate-slide-in-right transition-[width] duration-200 ease-out",
          dragging && "transition-none",
        )}
        style={{ width: effectiveWidth, maxWidth: maximized ? "100%" : `${maxWidth}px` }}
      >
        {/* Drag handle on left edge */}
        {!maximized && (
          <div
            onMouseDown={onMouseDown}
            className={clsx(
              "absolute top-0 left-0 bottom-0 w-1.5 cursor-col-resize flex items-center justify-center group z-10",
              "hover:bg-primary/20 transition-colors",
              dragging && "bg-primary/30",
            )}
            aria-label="Drag to resize"
            role="separator"
          >
            <div className={clsx(
              "w-0.5 h-12 rounded-full bg-border transition-colors",
              "group-hover:bg-primary/40",
              dragging && "bg-primary/60",
            )} />
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-border-subtle flex-shrink-0">
          <div className="min-w-0 pr-2">
            {title && <h2 className="font-display text-[17px] font-bold text-text-primary tracking-tight truncate">{title}</h2>}
            {description && <p className="text-[13px] text-text-secondary mt-0.5 truncate font-light">{description}</p>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setMaximized(m => !m)}
              className="btn-ghost btn-icon btn-sm text-text-tertiary hover:text-text-primary transition-colors"
              aria-label={maximized ? "Restore" : "Maximize"}
              title={maximized ? "Restore" : "Maximize"}
            >
              {maximized ? RESTORE_ICON : MAXIMIZE_ICON}
            </button>
            <button
              onClick={onClose}
              className="btn-ghost btn-icon btn-sm text-text-tertiary hover:text-text-primary hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              aria-label="Close"
              title="Close"
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <SpinnerIcon size={28} className="animate-spin text-primary" />
              <p className="text-sm text-text-secondary font-light">Loading...</p>
            </div>
          ) : (
            <div className="p-5 sm:p-6">
              {children}
            </div>
          )}
        </div>

        {/* Footer */}
        {footer && !loading && (
          <div className="flex items-center justify-end gap-2.5 px-5 sm:px-6 py-4 border-t border-border-subtle flex-shrink-0 bg-surface-card/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
