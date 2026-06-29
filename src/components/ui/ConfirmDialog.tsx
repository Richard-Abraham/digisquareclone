"use client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SpinnerIcon } from "@/components/icons";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel",
  variant = "primary", loading = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      maxWidth="sm:max-w-sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
          <Button variant={variant === "danger" ? "danger" : "primary"} size="sm" onClick={onConfirm} disabled={loading}>
            {loading ? <span className="flex items-center gap-2"><SpinnerIcon size={14} className="animate-spin" /> Processing...</span> : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-text-secondary font-light">{message}</p>
    </Modal>
  );
}
